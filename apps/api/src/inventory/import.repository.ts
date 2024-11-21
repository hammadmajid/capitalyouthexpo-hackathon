import { createHash } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { v7 } from 'uuid';
import { files, inventoryImportRuns, type Database } from '@hsm/db';
import type { PrivateStorage } from '@hsm/files';
import {
  DomainError,
  inventoryImportIdentitySchema,
  inventoryImportKindSchema,
  inventoryImportRowSchema,
  inventoryImportPreviewSchema,
  type InventoryImportInput,
} from '@hsm/contracts';
import type { Actor } from '../authorization/store.js';
import { AuditWriter, type Transaction } from '../audit/writer.js';
import { lockActor } from '../auth/actor-lock.js';
import { lockInventoryScope } from './scope.js';
import { parseInventoryCsv } from './import-csv.js';
import { validateImportRows } from './import-plan.js';
import { applyImportRows } from './import-apply.js';
export class InventoryImportRepository {
  constructor(
    readonly database: Database,
    private readonly storage: PrivateStorage,
    private readonly bucket: string,
    private readonly audit = new AuditWriter(),
    private readonly clock: () => Date = () => new Date(),
  ) {}
  async authorize(tx: Transaction, actor: Actor, branchId: string) {
    await lockActor(tx, actor, this.clock);
    return lockInventoryScope(tx, actor, branchId, 'inventory_edit');
  }
  async run(tx: Transaction, branchId: string, runId: string) {
    const [run] = await tx
      .select()
      .from(inventoryImportRuns)
      .where(and(eq(inventoryImportRuns.id, runId), eq(inventoryImportRuns.branchId, branchId)))
      .for('update');
    if (!run) throw new DomainError('NOT_FOUND', 404, 'Import unavailable');
    return run;
  }
  async file(tx: Transaction, uploader: string, fileId: string) {
    const [file] = await tx
      .select()
      .from(files)
      .where(
        and(
          eq(files.id, fileId),
          eq(files.uploadedBy, uploader),
          eq(files.bucket, this.bucket),
          eq(files.visibility, 'private'),
          eq(files.purpose, 'import'),
          eq(files.mimeType, 'text/csv'),
          eq(files.scanStatus, 'clean'),
        ),
      )
      .for('update');
    if (!file || !file.sha256 || file.sizeBytes > 5000000n)
      throw new DomainError('NOT_FOUND', 404, 'Clean CSV import file unavailable');
    return { ...file, sha256: file.sha256 };
  }
  async validate(tx: Transaction, actor: Actor, branchId: string, input: InventoryImportInput) {
    const scope = await this.authorize(tx, actor, branchId),
      file = await this.file(tx, actor.userId, input.fileId);
    await this.requireNewContent(tx, branchId, input.kind, file.sha256);
    let bytes: Buffer;
    try {
      bytes = await this.storage.read(file.objectKey, 5000000);
    } catch {
      throw new DomainError('INTERNAL', 503, 'Private import storage unavailable');
    }
    if (
      BigInt(bytes.length) !== file.sizeBytes ||
      !createHash('sha256').update(bytes).digest().equals(file.sha256)
    )
      throw new DomainError('CONFLICT', 409, 'Import file changed');
    const rows = await validateImportRows(
        tx,
        branchId,
        input.kind,
        parseInventoryCsv(bytes, input.kind),
      ),
      errorRows = rows.filter((row) => row.errors.length).length,
      id = v7();
    await tx
      .insert(inventoryImportRuns)
      .values({
        id,
        branchId,
        ...input,
        fileSha256: file.sha256,
        status: errorRows ? 'failed' : 'validated',
        totalRows: rows.length,
        errorRows,
        rows,
        createdByUserId: actor.userId,
        createdAt: this.clock(),
      });
    await this.record(tx, actor, branchId, id, scope, 'validate');
    return inventoryImportIdentitySchema.parse({ id, branchId });
  }
  async commit(tx: Transaction, actor: Actor, branchId: string, id: string) {
    const scope = await this.authorize(tx, actor, branchId),
      run = await this.run(tx, branchId, id);
    if (run.status === 'committed')
      throw new DomainError(
        'IMPORT_ALREADY_COMMITTED',
        409,
        'This import has already been committed',
      );
    if (run.status !== 'validated')
      throw new DomainError('CONFLICT', 409, 'Correct CSV errors and validate a new file');
    const file = await this.file(tx, run.createdByUserId, run.fileId);
    if (!file.sha256.equals(run.fileSha256))
      throw new DomainError('CONFLICT', 409, 'Import file changed');
    await this.requireNewContent(tx, branchId, run.kind, run.fileSha256);
    const kind = inventoryImportKindSchema.parse(run.kind),
      rows = inventoryImportRowSchema.array().min(1).max(500).parse(run.rows),
      checked = await validateImportRows(tx, branchId, kind, rows);
    if (checked.some((row) => row.errors.length))
      throw new DomainError('CONFLICT', 409, 'Inventory changed; validate the CSV again');
    const created = await applyImportRows(tx, branchId, kind, checked);
    await tx
      .update(inventoryImportRuns)
      .set({ status: 'committed', committedAt: this.clock() })
      .where(eq(inventoryImportRuns.id, id));
    await this.record(tx, actor, branchId, id, scope, 'commit', created);
    return inventoryImportIdentitySchema.parse({ id, branchId });
  }
  read(actor: Actor, branchId: string, id: string, offset: number, limit: number) {
    return this.database.transaction(async (tx) => {
      await this.authorize(tx, actor, branchId);
      const run = await this.run(tx, branchId, id);
      return inventoryImportPreviewSchema.parse({
        id,
        branchId,
        kind: run.kind,
        status: run.status,
        totalRows: run.totalRows,
        errorRows: run.errorRows,
        createdAt: run.createdAt.toISOString(),
        committedAt: run.committedAt?.toISOString() ?? null,
        rows: run.rows.slice(offset, offset + limit),
        nextOffset: offset + limit < run.totalRows ? offset + limit : null,
      });
    });
  }
  private async record(
    tx: Transaction,
    actor: Actor,
    branchId: string,
    id: string,
    scope: Awaited<ReturnType<typeof lockInventoryScope>>,
    action: 'validate' | 'commit',
    created?: Awaited<ReturnType<typeof applyImportRows>>,
  ) {
    await this.audit.hostel(tx, {
      actorUserId: actor.userId,
      actorRole: scope.actorRole,
      organizationId: scope.organizationId,
      branchId,
      targetType: 'inventory_import',
      targetId: id,
      action: 'inventory.import.' + action,
      after: { id, branchId, ...(created ? { created } : {}) },
      createdAt: this.clock(),
    });
    await lockActor(tx, actor, this.clock);
  }
  private async requireNewContent(tx: Transaction, branchId: string, kind: string, digest: Buffer) {
    const [duplicate] = await tx
      .select({ id: inventoryImportRuns.id })
      .from(inventoryImportRuns)
      .where(
        and(
          eq(inventoryImportRuns.branchId, branchId),
          eq(inventoryImportRuns.kind, kind),
          eq(inventoryImportRuns.fileSha256, digest),
          eq(inventoryImportRuns.status, 'committed'),
        ),
      )
      .limit(1);
    if (duplicate)
      throw new DomainError(
        'IMPORT_ALREADY_COMMITTED',
        409,
        'The same CSV content was already committed',
      );
  }
}

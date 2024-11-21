import { z } from 'zod';
import { and, eq, isNull } from 'drizzle-orm';
import { roomTypes } from '@hsm/db';
import { DomainError } from '@hsm/contracts';
import {
  inventoryImportInputSchema,
  inventoryImportIdentitySchema,
  inventoryImportKindSchema,
  inventoryImportPageQuerySchema,
  inventoryImportTemplateSchema,
} from '@hsm/contracts';
import type { Actor } from '../authorization/store.js';
import type { IdempotencyService } from '../idempotency/service.js';
import { requireTransaction } from '../idempotency/context.js';
import { inventoryFailure } from '../booking/errors.js';
import { InventoryImportRepository } from './import.repository.js';
const id = z
  .string()
  .uuid()
  .transform((value) => value.toLowerCase());
export class InventoryImportService {
  constructor(
    private readonly repository: InventoryImportRepository,
    private readonly idempotency: IdempotencyService,
  ) {}
  async template(actor: Actor, branchId: string, kind: unknown, query: unknown) {
    const options = z.object({ roomTypeId: id.optional() }).strict().parse(query);
    const branch = id.parse(branchId),
      parsed = inventoryImportKindSchema.parse(kind);
    await this.repository.database.transaction(async (tx) => {
      await this.repository.authorize(tx, actor, branch);
      if (options.roomTypeId) {
        const [type] = await tx
          .select({ id: roomTypes.id })
          .from(roomTypes)
          .where(
            and(
              eq(roomTypes.id, options.roomTypeId),
              eq(roomTypes.branchId, branch),
              isNull(roomTypes.archivedAt),
            ),
          );
        if (!type) throw new DomainError('NOT_FOUND', 404, 'Room type unavailable');
      }
    });
    return inventoryImportTemplateSchema.parse({
      branchId: branch,
      kind: parsed,
      fileName: 'hsm-' + parsed + '.csv',
      csv:
        parsed === 'rooms'
          ? 'room_type_id,room_number\r\n' +
            (options.roomTypeId ? options.roomTypeId + ',\r\n' : '')
          : 'room_number,bed_label\r\n',
    });
  }
  read(actor: Actor, branchId: string, runId: string, query: unknown) {
    const page = inventoryImportPageQuerySchema.parse(query);
    return this.repository.read(
      actor,
      id.parse(branchId),
      id.parse(runId),
      page.offset,
      page.limit,
    );
  }
  validate(actor: Actor, key: string, branchId: string, body: unknown) {
    const branch = id.parse(branchId),
      input = inventoryImportInputSchema.parse(body);
    return this.idempotency
      .execute(
        { actor, key, endpoint: 'POST /branches/:branchId/inventory/imports', status: 201 },
        { branch },
        input,
        inventoryImportIdentitySchema,
        async (tx) => {
          await this.repository.authorize(tx, actor, branch);
          await this.repository.file(tx, actor.userId, input.fileId);
          return true;
        },
        () => this.repository.validate(requireTransaction(), actor, branch, input),
      )
      .catch(inventoryFailure);
  }
  commit(actor: Actor, key: string, branchId: string, runId: string, body: unknown) {
    z.object({}).strict().parse(body);
    const branch = id.parse(branchId),
      run = id.parse(runId);
    return this.idempotency
      .execute(
        {
          actor,
          key,
          endpoint: 'POST /branches/:branchId/inventory/imports/:runId/commit',
          status: 200,
        },
        { branch, run },
        {},
        inventoryImportIdentitySchema,
        async (tx) => {
          await this.repository.authorize(tx, actor, branch);
          await this.repository.run(tx, branch, run);
          return true;
        },
        () => this.repository.commit(requireTransaction(), actor, branch, run),
      )
      .catch(inventoryFailure);
  }
}

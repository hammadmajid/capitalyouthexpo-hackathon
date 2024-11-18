import { z } from 'zod';
import {
  inventoryImportIdentitySchema,
  inventoryImportInputSchema,
  inventoryImportKindSchema,
  inventoryImportPageQuerySchema,
  inventoryImportPreviewSchema,
  inventoryImportTemplateSchema,
} from '@hsm/contracts';
import type { ApiClient } from './client.js';
import { ApiFailure, ClientFailure, readApi } from './result.js';
const id = z
  .string()
  .uuid()
  .transform((value) => value.toLowerCase());
export async function inventoryImportTemplate(
  client: ApiClient,
  branchId: string,
  kind: unknown,
  roomTypeId?: string,
) {
  const branch = id.parse(branchId),
    parsed = inventoryImportKindSchema.parse(kind);
  const result = await readApi(
    client.GET('/v1/branches/{branchId}/inventory/imports/templates/{kind}', {
      params: {
        path: { branchId: branch, kind: parsed },
        query: roomTypeId ? { roomTypeId: id.parse(roomTypeId) } : {},
      },
    }),
    inventoryImportTemplateSchema,
  );
  if (
    result.branchId !== branch ||
    result.kind !== parsed ||
    result.fileName !== 'hsm-' + parsed + '.csv'
  )
    throw new ClientFailure('INVALID_RESPONSE');
  return result;
}
export async function readInventoryImport(
  client: ApiClient,
  branchId: string,
  runId: string,
  query: unknown = {},
) {
  const branch = id.parse(branchId),
    run = id.parse(runId),
    page = inventoryImportPageQuerySchema.parse(query);
  const result = await readApi(
    client.GET('/v1/branches/{branchId}/inventory/imports/{runId}', {
      params: { path: { branchId: branch, runId: run }, query: page },
    }),
    inventoryImportPreviewSchema,
  );
  if (
    result.id !== run ||
    result.branchId !== branch ||
    result.rows.length > page.limit ||
    result.rows.some((row, index) => row.recordNumber !== page.offset + index + 2) ||
    result.rows.length !== Math.max(0, Math.min(page.limit, result.totalRows - page.offset)) ||
    result.nextOffset !==
      (page.offset + page.limit < result.totalRows ? page.offset + page.limit : null)
  )
    throw new ClientFailure('INVALID_RESPONSE');
  return result;
}
const commandSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('validate'), body: inventoryImportInputSchema }).strict(),
  z.object({ kind: z.literal('commit'), runId: id }).strict(),
]);
export type InventoryImportCommand = z.infer<typeof commandSchema>;
export async function executeInventoryImport(
  client: ApiClient,
  branchId: string,
  input: InventoryImportCommand,
  key: string,
) {
  const branch = id.parse(branchId),
    command = commandSchema.parse(input),
    header = { 'Idempotency-Key': id.parse(key) };
  const result = await readApi(
    command.kind === 'validate'
      ? client.POST('/v1/branches/{branchId}/inventory/imports', {
          params: { path: { branchId: branch }, header },
          body: command.body,
        })
      : client.POST('/v1/branches/{branchId}/inventory/imports/{runId}/commit', {
          params: { path: { branchId: branch, runId: command.runId }, header },
          body: {},
        }),
    inventoryImportIdentitySchema,
  );
  if (result.branchId !== branch || (command.kind === 'commit' && result.id !== command.runId))
    throw new ClientFailure('INVALID_RESPONSE');
  return result;
}
export class RetainedInventoryImport {
  private command: InventoryImportCommand | undefined;
  private key: string | undefined;
  private pending = false;
  private uncertain = false;
  private succeeded = false;
  constructor(
    private readonly execute: (command: InventoryImportCommand, key: string) => Promise<unknown>,
  ) {}
  get locked() {
    return this.pending || this.uncertain;
  }
  send(input: InventoryImportCommand, key: string) {
    if (this.command || this.pending || this.succeeded)
      throw new Error('Resolve the existing import command first');
    const command = commandSchema.parse(input),
      parsedKey = id.parse(key);
    if (command.kind === 'validate') Object.freeze(command.body);
    this.command = Object.freeze(command);
    this.key = parsedKey;
    return this.run();
  }
  retry() {
    return this.run();
  }
  reset() {
    if (this.locked) throw new Error('Uncertain import cannot be replaced');
    this.command = undefined;
    this.key = undefined;
    this.succeeded = false;
  }
  private async run() {
    if (!this.command || !this.key || this.pending || this.succeeded)
      throw new Error('Import command unavailable');
    this.pending = true;
    try {
      const result = await this.execute(this.command, this.key);
      this.succeeded = true;
      this.uncertain = false;
      return result;
    } catch (error) {
      if (
        error instanceof ApiFailure &&
        error.problem.status >= 400 &&
        error.problem.status < 500 &&
        !this.uncertain
      ) {
        this.command = undefined;
        this.key = undefined;
      } else this.uncertain = true;
      throw error;
    } finally {
      this.pending = false;
    }
  }
}

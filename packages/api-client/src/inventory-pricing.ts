import { z } from 'zod';
import {
  roomPriceInputSchema,
  roomPriceVersionSchema,
  roomPriceHistorySchema,
  roomPriceQuerySchema,
  type RoomPriceInput,
} from '@hsm/contracts';
import type { ApiClient } from './client.js';
import { ApiFailure, ClientFailure, readApi } from './result.js';
const id = z
  .string()
  .uuid()
  .transform((value) => value.toLowerCase());
export async function readInventoryPrices(
  client: ApiClient,
  branchId: string,
  roomTypeId: string,
  query: z.input<typeof roomPriceQuerySchema> = {},
) {
  const branch = id.parse(branchId),
    type = id.parse(roomTypeId),
    page = roomPriceQuerySchema.parse(query);
  const result = await readApi(
    client.GET('/v1/branches/{branchId}/inventory/room-types/{roomTypeId}/prices', {
      params: {
        path: { branchId: branch, roomTypeId: type },
        query: { limit: page.limit, ...(page.cursor ? { cursor: page.cursor } : {}) },
      },
    }),
    roomPriceHistorySchema,
  );
  if (
    result.branchId !== branch ||
    result.roomTypeId !== type ||
    result.data.length > page.limit ||
    result.data.some(
      (row, index) =>
        row.branchId !== branch ||
        row.roomTypeId !== type ||
        (page.cursor !== undefined && row.effectiveFrom >= page.cursor) ||
        (index > 0 && row.effectiveFrom >= (result.data[index - 1]?.effectiveFrom ?? '')),
    ) ||
    (result.nextCursor !== null &&
      (result.data.length !== page.limit ||
        result.nextCursor !== result.data.at(-1)?.effectiveFrom)) ||
    new Set(result.data.map((row) => row.id)).size !== result.data.length
  )
    throw new ClientFailure('INVALID_RESPONSE');
  return result;
}
export async function scheduleInventoryPrice(
  client: ApiClient,
  branchId: string,
  roomTypeId: string,
  input: RoomPriceInput,
  key: string,
) {
  const branch = id.parse(branchId),
    type = id.parse(roomTypeId),
    body = roomPriceInputSchema.parse(input);
  const result = await readApi(
    client.POST('/v1/branches/{branchId}/inventory/room-types/{roomTypeId}/prices', {
      params: {
        path: { branchId: branch, roomTypeId: type },
        header: { 'Idempotency-Key': id.parse(key) },
      },
      body,
    }),
    roomPriceVersionSchema,
  );
  if (
    result.branchId !== branch ||
    result.roomTypeId !== type ||
    JSON.stringify(
      roomPriceInputSchema.parse({
        effectiveFrom: result.effectiveFrom,
        bedMonthlyRentPaisa: result.bedMonthlyRentPaisa,
        roomMonthlyRentPaisa: result.roomMonthlyRentPaisa,
        depositPaisa: result.depositPaisa,
        fees: result.fees,
      }),
    ) !== JSON.stringify(body)
  )
    throw new ClientFailure('INVALID_RESPONSE');
  return result;
}
export class RetainedInventoryPrice {
  private command: RoomPriceInput | undefined;
  private key: string | undefined;
  private pending = false;
  private uncertain = false;
  private succeeded = false;
  constructor(
    private readonly execute: (command: RoomPriceInput, key: string) => Promise<unknown>,
  ) {}
  get locked() {
    return this.pending || this.uncertain;
  }
  send(input: unknown, key: string) {
    if (this.command || this.pending || this.succeeded)
      throw new Error('Resolve the existing price first');
    const command = roomPriceInputSchema.parse(input),
      parsedKey = id.parse(key);
    command.fees.forEach(Object.freeze);
    Object.freeze(command.fees);
    this.command = Object.freeze(command);
    this.key = parsedKey;
    return this.run();
  }
  retry() {
    return this.run();
  }
  reset() {
    if (this.locked) throw new Error('Uncertain price cannot be replaced');
    this.command = undefined;
    this.key = undefined;
    this.succeeded = false;
  }
  private async run() {
    if (!this.command || !this.key || this.pending || this.succeeded)
      throw new Error('Price command unavailable');
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

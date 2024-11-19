import { z } from 'zod';
import {
  duplicationRoomNumbers,
  roomDuplicationInputSchema,
  roomDuplicationResultSchema,
  type RoomDuplicationInput,
} from '@hsm/contracts';
import type { ApiClient } from './client.js';
import { ApiFailure, ClientFailure, readApi } from './result.js';
const id = z
  .string()
  .uuid()
  .transform((value) => value.toLowerCase());
export async function duplicateInventoryRoom(
  client: ApiClient,
  branchId: string,
  roomId: string,
  input: RoomDuplicationInput,
  key: string,
) {
  const branch = id.parse(branchId),
    room = id.parse(roomId),
    body = roomDuplicationInputSchema.parse(input);
  const result = await readApi(
    client.POST('/v1/branches/{branchId}/inventory/rooms/{roomId}/duplicate', {
      params: {
        path: { branchId: branch, roomId: room },
        header: { 'Idempotency-Key': id.parse(key) },
      },
      body,
    }),
    roomDuplicationResultSchema,
  );
  if (
    result.branchId !== branch ||
    result.sourceRoomId !== room ||
    result.roomIds.includes(room) ||
    result.roomIds.length !== duplicationRoomNumbers(body).length
  )
    throw new ClientFailure('INVALID_RESPONSE');
  return result;
}
const commandSchema = z.object({ roomId: id, body: roomDuplicationInputSchema }).strict();
type Command = z.infer<typeof commandSchema>;
// A mounted actor/branch owns one unresolved intent. Unknown outcomes retain the original key/body.
export class RetainedRoomDuplication {
  private command: Command | undefined;
  private key: string | undefined;
  private pending = false;
  private uncertain = false;
  private succeeded = false;
  constructor(private readonly execute: (command: Command, key: string) => Promise<unknown>) {}
  get locked() {
    return this.pending || this.uncertain;
  }
  send(input: unknown, key: string) {
    if (this.command || this.pending || this.succeeded)
      throw new Error('Resolve the existing duplication first');
    const command = commandSchema.parse(input),
      parsedKey = id.parse(key);
    if ('roomNumbers' in command.body) Object.freeze(command.body.roomNumbers);
    Object.freeze(command.body);
    this.command = Object.freeze(command);
    this.key = parsedKey;
    return this.run();
  }
  retry() {
    return this.run();
  }
  reset() {
    if (this.locked) throw new Error('Uncertain duplication cannot be replaced');
    this.command = undefined;
    this.key = undefined;
    this.succeeded = false;
  }
  private async run() {
    if (!this.command || !this.key || this.pending || this.succeeded)
      throw new Error('Duplication unavailable');
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

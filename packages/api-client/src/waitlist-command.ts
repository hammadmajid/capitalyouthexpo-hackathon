import { z } from 'zod';
import { joinWaitlistSchema, saveExpectedVacancySchema } from '@hsm/contracts';
import { saveExpectedVacancy } from './waitlist-vacancy.js';
import { ApiFailure } from './result.js';
import { joinWaitlist, leaveWaitlist } from './waitlist.js';
import type { ApiClient } from './client.js';
const id = z.string().uuid();
export const waitlistCommandSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('vacancy'),
      branchId: id,
      roomTypeId: id,
      body: saveExpectedVacancySchema,
    })
    .strict(),
  z.object({ kind: z.literal('join'), body: joinWaitlistSchema }).strict(),
  z.object({ kind: z.literal('leave'), entryId: id }).strict(),
]);
export type WaitlistCommand = z.infer<typeof waitlistCommandSchema>;
export function executeWaitlistCommand(client: ApiClient, command: WaitlistCommand, key: string) {
  if (command.kind === 'vacancy')
    return saveExpectedVacancy(client, command.branchId, command.roomTypeId, command.body, key);
  return command.kind === 'join'
    ? joinWaitlist(client, command.body, key)
    : leaveWaitlist(client, command.entryId, key);
}
// WAIT-001: one actor/scope-mounted instance retains the original uncertain command.
export class RetainedWaitlistCommand {
  private command: WaitlistCommand | undefined;
  private key: string | undefined;
  private pending = false;
  private uncertain = false;
  private succeeded = false;
  constructor(
    private readonly execute: (command: WaitlistCommand, key: string) => Promise<unknown>,
  ) {}
  get locked() {
    return this.pending || this.uncertain;
  }
  async send(input: unknown, key: string) {
    if (this.command || this.pending || this.succeeded)
      throw new Error('Existing waiting-list command must be resolved first');
    const command = waitlistCommandSchema.parse(input),
      parsedKey = id.parse(key);
    if ('body' in command) Object.freeze(command.body);
    this.command = Object.freeze(command);
    this.key = parsedKey;
    return this.run();
  }
  retry() {
    return this.run();
  }
  reset() {
    if (this.locked) throw new Error('Uncertain waiting-list command cannot be replaced');
    this.command = undefined;
    this.key = undefined;
    this.succeeded = false;
  }
  private async run() {
    if (!this.command || !this.key || this.pending || this.succeeded)
      throw new Error('Waiting-list command unavailable');
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

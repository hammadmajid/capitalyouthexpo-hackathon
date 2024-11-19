import { z } from 'zod';
import {
  createVisitInputSchema,
  visitInterestInputSchema,
  saveVisitingHoursSchema,
  visitActionInputSchema,
} from '@hsm/contracts';
import { actOnVisit, requestVisit, saveVisitingHours } from './visits.js';
import { recordVisitInterest } from './visit-interest.js';
import { ApiFailure } from './result.js';
import type { ApiClient } from './client.js';
const id = z.string().uuid();
export const visitWorkflowCommandSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('request'), body: createVisitInputSchema }).strict(),
  z.object({ kind: z.literal('interest'), visitId: id, body: visitInterestInputSchema }).strict(),
  z.object({ kind: z.literal('hours'), branchId: id, body: saveVisitingHoursSchema }).strict(),
  z
    .object({
      kind: z.literal('action'),
      branchId: id.nullable(),
      visitId: id,
      body: visitActionInputSchema,
    })
    .strict(),
]);
export type VisitWorkflowCommand = z.infer<typeof visitWorkflowCommandSchema>;
export async function executeVisitCommand(
  client: ApiClient,
  command: VisitWorkflowCommand,
  key: string,
) {
  if (command.kind === 'interest')
    return recordVisitInterest(client, command.visitId, command.body, key);
  if (command.kind === 'request') return requestVisit(client, command.body, key);
  if (command.kind === 'hours')
    return saveVisitingHours(client, command.branchId, command.body, key);
  return actOnVisit(client, command.visitId, command.body, key, command.branchId ?? undefined);
}
function freezeCommand(input: unknown) {
  const command = visitWorkflowCommandSchema.parse(input);
  if (command.kind === 'hours') {
    for (const window of command.body.windows) Object.freeze(window);
    Object.freeze(command.body.windows);
  } else if (command.kind === 'action') Object.freeze(command.body.command);
  Object.freeze(command.body);
  return Object.freeze(command);
}
// VISIT-001: one actor/scope-mounted instance retains exact intent after an uncertain outcome.
export class RetainedVisitCommand {
  private command: VisitWorkflowCommand | undefined;
  private key: string | undefined;
  private pending = false;
  private uncertain = false;
  private succeeded = false;
  constructor(
    private readonly execute: (command: VisitWorkflowCommand, key: string) => Promise<unknown>,
  ) {}
  get locked() {
    return this.pending || this.uncertain;
  }
  async send(input: unknown, key: string) {
    if (this.command || this.pending || this.succeeded)
      throw new Error('Existing visit command must be resolved first');
    const parsedKey = id.parse(key);
    this.command = freezeCommand(input);
    this.key = parsedKey;
    return this.run();
  }
  retry() {
    return this.run();
  }
  reset() {
    if (this.locked) throw new Error('Uncertain visit command cannot be replaced');
    this.command = undefined;
    this.key = undefined;
    this.succeeded = false;
  }
  private async run() {
    if (!this.command || !this.key || this.pending || this.succeeded)
      throw new Error('Visit command unavailable');
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

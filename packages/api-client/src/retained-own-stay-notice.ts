import {
  stayIdentifierSchema,
  stayNoticeInputSchema,
  type stayNoticeResultSchema,
} from '@hsm/contracts';
import type { z } from 'zod';
import type { ApiClient } from './client.js';
import { ApiFailure, ClientFailure } from './result.js';
import { submitOwnStayNotice } from './own-stay-notice.js';
type Command = z.infer<typeof stayNoticeInputSchema>;
type Result = z.infer<typeof stayNoticeResultSchema>;
type Intent = { key: string; command: Readonly<Command>; uncertain: boolean; result?: Result };
// OUT-001 / ACC-004: one instance belongs to one actor/Stay UI scope. It stores
// no credentials; every actual retry still uses the caller's currently bound client.
export class RetainedOwnStayNotice {
  private intent: Intent | undefined;
  private pending = false;
  readonly stayId: string;
  constructor(
    stay: unknown,
    private readonly createKey: () => string,
  ) {
    this.stayId = stayIdentifierSchema.parse(stay);
  }
  get locked() {
    return this.intent !== undefined;
  }
  get uncertain() {
    return this.intent?.uncertain === true;
  }
  get command() {
    return this.intent?.command;
  }
  get result() {
    return this.intent?.result;
  }
  async submit(client: ApiClient, body: unknown) {
    if (this.pending || this.intent?.result) throw new ClientFailure('INVALID_RESPONSE');
    const command = stayNoticeInputSchema.parse(body);
    if (this.intent && JSON.stringify(this.intent.command) !== JSON.stringify(command))
      throw new ClientFailure('INVALID_RESPONSE');
    const intent: Intent = this.intent ?? {
      command: Object.freeze(command),
      key: stayIdentifierSchema.parse(this.createKey()),
      uncertain: false,
    };
    this.intent = intent;
    this.pending = true;
    try {
      const result = await submitOwnStayNotice(client, this.stayId, intent.command, intent.key);
      intent.result = result;
      intent.uncertain = false;
      return result;
    } catch (error) {
      this.retainFailure(intent, error);
      throw error;
    } finally {
      this.pending = false;
    }
  }
  private retainFailure(intent: Intent, error: unknown) {
    const rejected =
      error instanceof ApiFailure && error.problem.status >= 400 && error.problem.status < 500;
    if (rejected && !intent.uncertain) this.intent = undefined;
    else intent.uncertain = true;
  }
}

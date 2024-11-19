import {
  newResidentPaymentInputSchema,
  stayIdentifierSchema,
  type RecordExternalPaymentInput,
  type recordedResidentPaymentSchema,
} from '@hsm/contracts';
import type { z } from 'zod';
import type { ApiClient } from './client.js';
import { ApiFailure, ClientFailure } from './result.js';
import { recordStayExternalPayment } from './stay-payments.js';

type Result = z.infer<typeof recordedResidentPaymentSchema>;
type Intent = {
  key: string;
  command: Readonly<RecordExternalPaymentInput>;
  uncertain: boolean;
  result?: Result;
};
// PAY-008 / ACC-004: instantiate once per actor/branch/Stay form. Credentials
// are supplied on each deliberate request, never retained in this command.
export class RetainedStayPayment {
  private intent: Intent | undefined;
  private pending = false;
  readonly branchId: string;
  readonly stayId: string;
  constructor(
    branch: unknown,
    stay: unknown,
    private readonly createKey: () => string,
  ) {
    this.branchId = stayIdentifierSchema.parse(branch);
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
    const command = newResidentPaymentInputSchema.parse(body);
    if (this.intent && JSON.stringify(this.intent.command) !== JSON.stringify(command))
      throw new ClientFailure('INVALID_RESPONSE');
    const intent = this.intent ?? this.prepare(command);
    this.intent = intent;
    this.pending = true;
    try {
      const result = await recordStayExternalPayment(
        client,
        this.branchId,
        this.stayId,
        intent.command,
        intent.key,
      );
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
  private prepare(command: RecordExternalPaymentInput): Intent {
    command.allocations.forEach((allocation) => Object.freeze(allocation));
    Object.freeze(command.allocations);
    return {
      key: stayIdentifierSchema.parse(this.createKey()),
      command: Object.freeze(command),
      uncertain: false,
    };
  }
}

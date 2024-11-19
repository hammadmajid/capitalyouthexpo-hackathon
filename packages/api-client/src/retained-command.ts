import { ApiFailure } from './result.js';
import { ZodError } from 'zod';

export class RetainedCommandFailure extends Error {
  constructor(readonly code: 'PENDING' | 'UNRESOLVED' | 'EXPIRED') {
    super('The previous command needs resolution');
    this.name = 'RetainedCommandFailure';
  }
}
type Intent = { key: string; serialized: string; createdAt: number; uncertain: boolean };
function freeze(value: unknown): void {
  if (value !== null && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
}

// PAY-008 / AUD-003: credentials are supplied for each deliberate request.
// Match the existing server's 24-hour replay lifetime. Never rotate an unresolved key.
export class RetainedCommand {
  private intent: Intent | undefined;
  private pending = false;
  constructor(
    private readonly createKey: () => string,
    private readonly clock: () => number = Date.now,
  ) {}
  get unresolved() {
    return this.intent !== undefined;
  }
  original<T>(): T {
    if (!this.intent) throw new RetainedCommandFailure('UNRESOLVED');
    return JSON.parse(this.intent.serialized) as T;
  }
  async submit<T>(body: T, run: (body: T, key: string) => Promise<unknown>) {
    if (this.pending) throw new RetainedCommandFailure('PENDING');
    const serialized = JSON.stringify(body);
    if (serialized === undefined) throw new TypeError('Command must be JSON');
    if (this.intent && this.intent.serialized !== serialized)
      throw new RetainedCommandFailure('UNRESOLVED');
    const intent = this.intent ?? {
      key: this.createKey(),
      serialized,
      createdAt: this.clock(),
      uncertain: false,
    };
    if (this.clock() - intent.createdAt >= 86400000) throw new RetainedCommandFailure('EXPIRED');
    // Clone before dispatch so subsequent form edits cannot change the original request.
    const command = JSON.parse(intent.serialized) as T;
    freeze(command);
    this.intent = intent;
    this.pending = true;
    try {
      const result = await run(command, intent.key);
      this.intent = undefined;
      return result;
    } catch (error) {
      const rejected =
        (error instanceof ApiFailure &&
          error.problem.status >= 400 &&
          error.problem.status < 500) ||
        // SDK request validation runs before dispatch; response validation is
        // uses a separate client failure type in readApi.
        error instanceof ZodError;
      if (rejected && !intent.uncertain) this.intent = undefined;
      else intent.uncertain = true;
      throw error;
    } finally {
      this.pending = false;
    }
  }
}

// Application-lifetime registry survives remounts and account switches; an actor's
// unresolved command is never transferred to another actor. No payload is written to disk.
const commands = new Map<string, RetainedCommand>();
export function retainedCommand(scope: string, createKey: () => string) {
  let command = commands.get(scope);
  if (!command) {
    command = new RetainedCommand(createKey);
    commands.set(scope, command);
  }
  return command;
}

import { z } from 'zod';
import {
  chatMessageInputSchema,
  chatReportInputSchema,
  createConversationSchema,
} from '@hsm/contracts';
import type { ApiClient } from './client.js';
import { ApiFailure } from './result.js';
import { createConversation, sendChatMessage, markChatRead } from './chat.js';
import { reportChatMessage } from './chat-reports.js';
const id = z.string().uuid();
export const chatCommandSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('create'), body: createConversationSchema }).strict(),
  z
    .object({
      kind: z.literal('send'),
      conversationId: id,
      branchId: id.nullable(),
      body: chatMessageInputSchema,
    })
    .strict(),
  z.object({ kind: z.literal('read'), conversationId: id, branchId: id.nullable() }).strict(),
  z
    .object({
      kind: z.literal('report'),
      conversationId: id,
      branchId: id.nullable(),
      body: chatReportInputSchema,
    })
    .strict(),
]);
export type ChatCommand = z.infer<typeof chatCommandSchema>;
export function executeChatCommand(
  client: ApiClient,
  actorId: string,
  command: ChatCommand,
  key: string,
) {
  if (command.kind === 'create') return createConversation(client, actorId, command.body, key);
  if (command.kind === 'report')
    return reportChatMessage(
      client,
      actorId,
      command.body,
      key,
      command.branchId ?? undefined,
      command.branchId ? command.conversationId : undefined,
    );
  if (command.kind === 'send')
    return sendChatMessage(
      client,
      actorId,
      command.conversationId,
      command.body,
      key,
      command.branchId ?? undefined,
    );
  return markChatRead(client, command.conversationId, key, command.branchId ?? undefined);
}
export class RetainedChatCommand {
  private command: ChatCommand | undefined;
  private key: string | undefined;
  private pending = false;
  private uncertain = false;
  private succeeded = false;
  constructor(private readonly execute: (command: ChatCommand, key: string) => Promise<unknown>) {}
  get locked() {
    return this.pending || this.uncertain;
  }
  async send(input: unknown, key: string) {
    if (this.command || this.pending || this.succeeded)
      throw new Error('Resolve the existing chat command first');
    const command = chatCommandSchema.parse(input),
      parsedKey = id.parse(key);
    if (command.kind === 'send' && command.body.attachmentFileIds)
      Object.freeze(command.body.attachmentFileIds);
    if ('body' in command) Object.freeze(command.body);
    this.command = Object.freeze(command);
    this.key = parsedKey;
    return this.run();
  }
  retry() {
    return this.run();
  }
  reset() {
    if (this.locked) throw new Error('Uncertain chat command cannot be replaced');
    this.command = undefined;
    this.key = undefined;
    this.succeeded = false;
  }
  private async run() {
    if (!this.command || !this.key || this.pending || this.succeeded)
      throw new Error('Chat command unavailable');
    this.pending = true;
    try {
      const value = await this.execute(this.command, this.key);
      this.succeeded = true;
      this.uncertain = false;
      return value;
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

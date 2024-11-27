import { z } from 'zod';
import { openEnvelope } from '@hsm/security/envelope';
import { otpEmail, otpMailSchema, managerWelcomeEmail } from '@hsm/emails';
import type { OutboxMessage } from './repository.js';
export interface EmailProvider {
  send(message: {
    to: string;
    subject: string;
    html: string;
    text: string;
    messageId: string;
  }): Promise<string>;
}
export class DeliveryError extends Error {
  constructor(readonly code: 'INVALID_MESSAGE' | 'EXPIRED_MESSAGE') {
    super(code);
  }
}
const envelopeSchema = z
  .object({
    envelope: z
      .string()
      .min(40)
      .max(16384)
      .regex(/^[A-Za-z0-9+/]+={0,2}$/),
  })
  .strict();
const welcomeSchema = z
  .object({ email: z.string().email(), name: z.string().min(1).max(200) })
  .strict();
export async function deliverEmail(
  row: OutboxMessage,
  key: Buffer,
  provider: EmailProvider,
  now: Date,
) {
  const recipient = row.recipientAddress;
  if (!recipient) throw new DeliveryError('INVALID_MESSAGE');
  let content: { subject: string; html: string; text: string };
  try {
    if (row.channel !== 'email') throw new DeliveryError('INVALID_MESSAGE');
    const payload = envelopeSchema.parse(row.payload);
    const decoded: unknown = JSON.parse(
      openEnvelope(Buffer.from(payload.envelope, 'base64'), key, 'email'),
    );
    if (row.eventType === 'auth.otp') {
      const mail = otpMailSchema.parse(decoded);
      if (mail.email !== recipient) throw new DeliveryError('INVALID_MESSAGE');
      if (new Date(mail.expiresAt) <= now) throw new DeliveryError('EXPIRED_MESSAGE');
      content = await otpEmail(mail);
    } else if (row.eventType === 'manager.welcome') {
      const mail = welcomeSchema.parse(decoded);
      if (mail.email !== recipient) throw new DeliveryError('INVALID_MESSAGE');
      content = await managerWelcomeEmail(mail.name);
    } else throw new DeliveryError('INVALID_MESSAGE');
  } catch (error) {
    if (error instanceof DeliveryError) throw error;
    throw new DeliveryError('INVALID_MESSAGE');
  }
  return provider.send({
    ...content,
    to: recipient,
    messageId: '<' + row.id + '@outbox.hsm.invalid>',
  });
}

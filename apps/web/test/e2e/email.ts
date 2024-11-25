import { expect } from '@playwright/test';
import { z } from 'zod';
const messageSchema = z.object({
  ID: z.string(),
  Subject: z.string(),
  Text: z.string(),
  HTML: z.string(),
});
export async function delivered(mailpit: string, subject: string, previous?: string) {
  let result: z.infer<typeof messageSchema> | undefined;
  await expect
    .poll(
      async () => {
        const response = await fetch(mailpit + '/api/v1/message/latest');
        if (!response.ok) return false;
        const message = messageSchema.parse(await response.json());
        if (message.Subject !== subject || message.ID === previous) return false;
        result = message;
        return true;
      },
      { timeout: 20000, intervals: [200] },
    )
    .toBe(true);
  if (!result) throw new Error('Expected mail was not delivered');
  const code = result.Text.match(/\b\d{6}\b/)?.[0];
  if (!code) throw new Error('Expected verification code missing');
  expect(result.HTML).toContain(code);
  return { ...result, code };
}

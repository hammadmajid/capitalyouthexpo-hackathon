import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { sql } from 'drizzle-orm';
import { z } from 'zod';
export const AUTHORITY_CHANGE_CHANNEL = 'hsm_authority_changed';
export const authorityChangeSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('user'), id: z.string().uuid() }).strict(),
  z.object({ kind: z.literal('session'), id: z.string().uuid() }).strict(),
  z.object({ kind: z.literal('hierarchy') }).strict(),
]);
export type AuthorityChange = z.infer<typeof authorityChangeSchema>;
export async function listenAuthorityChanges(
  url: string,
  changed: (event: AuthorityChange) => void,
  unavailable: () => void,
) {
  let closed = false,
    available = false,
    retry: ReturnType<typeof setTimeout> | undefined;
  // The pinned driver accepts onnotify in its connection options; its public
  // Options interface omits that callback. Keep the extension explicitly typed.
  const options: postgres.Options<Record<string, never>> & {
    onnotify(channel: string, payload: string): void;
  } = {
    max: 1,
    connect_timeout: 3,
    idle_timeout: 0,
    max_lifetime: null,
    fetch_types: false,
    connection: { application_name: 'hsm-authority-listener' },
    onnotice: () => undefined,
    onnotify: (channel, payload) => {
      if (closed || channel !== AUTHORITY_CHANGE_CHANNEL) return;
      try {
        changed(authorityChangeSchema.parse(JSON.parse(payload) as unknown));
      } catch {
        unavailable();
      }
    },
    onclose: () => {
      available = false;
      if (!closed) {
        unavailable();
        schedule();
      }
    },
  };
  const client = postgres(z.string().url().parse(url), options);
  const database = drizzle(client);
  async function subscribe() {
    await database.execute(sql`LISTEN hsm_authority_changed`);
    if (!closed) available = true;
  }
  function schedule() {
    if (closed || retry) return;
    retry = setTimeout(() => {
      retry = undefined;
      void subscribe().catch(() => {
        if (closed) return;
        unavailable();
        schedule();
      });
    }, 1000);
    retry.unref();
  }
  async function close() {
    closed = true;
    available = false;
    clearTimeout(retry);
    await client.end({ timeout: 1 });
  }
  try {
    await subscribe();
  } catch {
    await close();
    throw new Error('AUTHORITY_LISTENER_UNAVAILABLE');
  }
  return { available: () => available, close };
}

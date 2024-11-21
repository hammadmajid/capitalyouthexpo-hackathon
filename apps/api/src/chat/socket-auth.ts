import { z } from 'zod';
const credentials = z.object({ token: z.string().min(1).max(8192).optional() }).strict();
export function chatSocketToken(input: unknown, cookie: string | undefined, secure: boolean) {
  const auth = credentials.parse(input),
    name = secure ? '__Host-hsm_access' : 'hsm_access';
  const cookies = (cookie ?? '')
    .split(';')
    .map((part) => part.trim())
    .filter((part) => part.startsWith(name + '='));
  if (cookies.length > 1 || (cookies.length && auth.token)) throw new Error('UNAUTHENTICATED');
  const token =
    auth.token ?? (cookies[0] ? decodeURIComponent(cookies[0].slice(name.length + 1)) : undefined);
  return z.string().min(1).max(8192).parse(token);
}

import { createApiClient } from '@hsm/api-client';
export function csrfCookie(cookie: string) {
  for (const name of ['__Host-hsm_csrf', 'hsm_csrf']) {
    const entry = cookie
      .split(';')
      .map((part) => part.trim())
      .find((part) => part.startsWith(name + '='));
    if (entry) {
      try {
        return decodeURIComponent(entry.slice(name.length + 1));
      } catch {
        return undefined;
      }
    }
  }
  return undefined;
}
export function browserClient() {
  return createApiClient({
    baseUrl: window.location.origin + '/api',
    authentication: { kind: 'cookie', csrf: () => csrfCookie(document.cookie) },
  });
}

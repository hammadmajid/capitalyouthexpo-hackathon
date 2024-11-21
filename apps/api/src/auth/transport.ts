import type { FastifyReply, FastifyRequest } from 'fastify';
import { DomainError, type SelfProfile } from '@hsm/contracts';
import type { AuthCrypto } from './crypto.js';
import type { SessionService } from './session.service.js';

type Credentials = Awaited<ReturnType<SessionService['issue']>>;
export class AuthTransport {
  constructor(
    private readonly crypto: AuthCrypto,
    private readonly secure: boolean,
  ) {}
  private name(kind: 'access' | 'refresh' | 'csrf') {
    return (this.secure ? '__Host-' : '') + 'hsm_' + kind;
  }
  token(request: FastifyRequest, kind: 'access' | 'refresh') {
    const cookie = request.cookies[this.name(kind)];
    const authorization = request.headers.authorization;
    if (authorization && cookie)
      throw new DomainError('UNAUTHENTICATED', 401, 'Ambiguous authentication');
    if (kind === 'access' && authorization) {
      const match = /^Bearer ([^\s]+)$/.exec(authorization);
      if (!match?.[1]) throw new DomainError('UNAUTHENTICATED', 401, 'Authentication required');
      return match[1];
    }
    if (!cookie) throw new DomainError('UNAUTHENTICATED', 401, 'Authentication required');
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method))
      this.csrf(request, request.cookies[this.name('refresh')] ?? '');
    return cookie;
  }
  csrf(request: FastifyRequest, credential: string) {
    const cookie = request.cookies[this.name('csrf')];
    const header = request.headers['x-csrf-token'];
    if (
      typeof header !== 'string' ||
      !cookie ||
      !this.crypto.equals(header, cookie) ||
      !this.crypto.equals(cookie, this.crypto.digest(credential, 'csrf'))
    )
      throw new DomainError('FORBIDDEN', 403, 'CSRF verification required');
  }
  send(reply: FastifyReply, credentials: Credentials & Partial<SelfProfile>) {
    reply.header('Cache-Control', 'no-store');
    if (credentials.client === 'mobile') return credentials;
    const options = { path: '/', secure: this.secure, sameSite: 'lax' as const };
    reply.setCookie(this.name('access'), credentials.accessToken, {
      ...options,
      httpOnly: true,
      maxAge: credentials.expiresIn,
    });
    reply.setCookie(this.name('refresh'), credentials.refreshToken, {
      ...options,
      httpOnly: true,
      maxAge: 30 * 86400,
    });
    // The refresh credential binds the shared CSRF token across access-token expiry.
    reply.setCookie(this.name('csrf'), this.crypto.digest(credentials.refreshToken, 'csrf'), {
      ...options,
      httpOnly: false,
      maxAge: 30 * 86400,
    });
    return {
      expiresIn: credentials.expiresIn,
      sessionId: credentials.sessionId,
      client: 'web',
      ...(credentials.user && credentials.capabilities
        ? { user: credentials.user, capabilities: credentials.capabilities }
        : {}),
    };
  }
  clear(reply: FastifyReply) {
    for (const kind of ['access', 'refresh', 'csrf'] as const)
      reply.clearCookie(this.name(kind), { path: '/', secure: this.secure, sameSite: 'lax' });
    reply.header('Cache-Control', 'no-store');
  }
}

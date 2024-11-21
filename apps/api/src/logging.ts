import { randomUUID } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import type { LoggerOptions } from 'pino';
import type { ApiConfig } from './config.js';
import { privateLogging } from './logging-policy.js';
export function requestId(_request?: Pick<IncomingMessage, 'headers'>) {
  void _request;
  return randomUUID();
}
export function logging(config: ApiConfig): LoggerOptions {
  const secrets = [
    'password',
    'newPassword',
    'currentPassword',
    'tempPassword',
    'generatedTempPassword',
    'otp',
    'accessToken',
    'refreshToken',
    'setupToken',
    'cnic',
    'phone',
    'phoneE164',
    'paymentProof',
    'secret',
  ];
  return {
    level: config.LOG_LEVEL,
    redact: {
      paths: [
        ...secrets,
        ...secrets.map((key) => '*.' + key),
        'req.headers.authorization',
        'req.headers.cookie',
        'res.headers["set-cookie"]',
      ],
      censor: '[REDACTED]',
    },
    ...privateLogging,
  };
}

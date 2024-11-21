import { createHash } from 'node:crypto';
import { createDatabase } from '@hsm/db';
import { sql } from 'drizzle-orm';
import { Redis } from 'ioredis';
import type { ApiConfig } from './config.js';

export interface Infrastructure {
  postgres(): Promise<void>;
  redis(): Promise<void>;
  increment(key: string, seconds: number): Promise<number>;
  close(): Promise<void>;
}
export const INFRASTRUCTURE = Symbol('Infrastructure');
export class LiveInfrastructure implements Infrastructure {
  readonly database;
  readonly cache;
  constructor(config: ApiConfig) {
    this.database = createDatabase(config.DATABASE_URL, { connectTimeoutSeconds: 3 });
    this.cache = new Redis(config.REDIS_URL, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      connectTimeout: 3000,
      commandTimeout: 3000,
      retryStrategy: () => null,
      enableOfflineQueue: false,
    });
    // Dependency errors are reported through sanitized startup/readiness results.
    this.cache.on('error', () => undefined);
  }
  async connect() {
    try {
      await this.cache.connect();
      await this.postgres();
      await this.redis();
    } catch {
      await this.close();
      throw new Error('Required API dependencies unavailable');
    }
  }
  async postgres() {
    await this.database.db.execute(sql`select 1`);
  }
  async redis() {
    if ((await this.cache.ping()) !== 'PONG') throw new Error('Redis unavailable');
  }
  async increment(key: string, seconds: number) {
    // SEC-001: counter and expiry are atomic across API replicas.
    const count = await this.cache.eval(
      "local n = redis.call('INCR', KEYS[1]); if n == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]); end; return n",
      1,
      key,
      seconds,
    );
    if (typeof count !== 'number') throw new Error('Invalid rate counter');
    return count;
  }
  async close() {
    if (this.cache.status !== 'end') {
      const ended = new Promise<void>((resolve) => this.cache.once('end', resolve));
      this.cache.disconnect();
      await ended;
    }
    await this.database.close();
  }
}
export function rateKey(ip: string, window: number) {
  return 'hsm:rate:' + createHash('sha256').update(ip).digest('hex') + ':' + window;
}

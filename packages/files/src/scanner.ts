import { createConnection, type Socket } from 'node:net';
import { once } from 'node:events';
import { z } from 'zod';
import type { VirusScanner } from './ports.js';
const options = z
  .object({
    host: z.string().min(1),
    port: z.number().int().min(1).max(65535),
    timeoutMs: z.number().int().min(100).max(30000).default(20000),
  })
  .strict();
export class ScanUnavailable extends Error {
  constructor() {
    super('SCAN_UNAVAILABLE');
  }
}
async function write(socket: Socket, bytes: Buffer) {
  if (!socket.write(bytes)) await once(socket, 'drain');
}
async function stream(socket: Socket, bytes: Buffer) {
  await write(socket, Buffer.from('zINSTREAM\0'));
  for (let offset = 0; offset < bytes.length; offset += 65536) {
    const chunk = bytes.subarray(offset, offset + 65536);
    const length = Buffer.alloc(4);
    length.writeUInt32BE(chunk.length);
    await write(socket, length);
    await write(socket, chunk);
  }
  await write(socket, Buffer.alloc(4));
}
export class ClamScanner implements VirusScanner {
  private readonly config: z.infer<typeof options>;
  constructor(input: z.input<typeof options>) {
    this.config = options.parse(input);
  }
  async scan(bytes: Buffer): Promise<'clean' | 'rejected'> {
    if (!bytes.length || bytes.length > 10000000) throw new ScanUnavailable();
    return new Promise((resolve, reject) => {
      const socket = createConnection({ host: this.config.host, port: this.config.port });
      let response = '',
        settled = false;
      const finish = (verdict?: 'clean' | 'rejected') => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        socket.destroy();
        if (verdict) resolve(verdict);
        else reject(new ScanUnavailable());
      };
      const timer = setTimeout(() => finish(), this.config.timeoutMs);
      socket.on('error', () => finish());
      socket.on('end', () => finish());
      socket.on('connect', () => {
        void stream(socket, bytes).catch(() => finish());
      });
      socket.on('data', (chunk: Buffer) => {
        response += chunk.toString('utf8');
        if (response.length > 4096) return finish();
        if (!response.includes('\0')) return;
        if (response === 'stream: OK\0') finish('clean');
        else if (/^stream: [^\r\n\0]+ FOUND\0$/.test(response)) finish('rejected');
        else finish();
      });
    });
  }
}

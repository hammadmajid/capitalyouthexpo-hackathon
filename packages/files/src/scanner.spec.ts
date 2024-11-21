import { createServer, type Socket } from 'node:net';
import { once } from 'node:events';
import { expect, it } from 'vitest';
import { ClamScanner } from './scanner.js';
async function fixture(reply: (socket: Socket, bytes: Buffer) => void) {
  const sockets = new Set<Socket>();
  const server = createServer((socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
    let pending = Buffer.alloc(0),
      started = false;
    const chunks: Buffer[] = [];
    socket.on('data', (chunk: Buffer) => {
      pending = Buffer.concat([pending, chunk]);
      if (!started) {
        if (pending.length < 10) return;
        expect(pending.subarray(0, 10).toString()).toBe('zINSTREAM\0');
        pending = pending.subarray(10);
        started = true;
      }
      while (pending.length >= 4) {
        const size = pending.readUInt32BE(0);
        if (pending.length < size + 4) return;
        if (!size) {
          reply(socket, Buffer.concat(chunks));
          pending = Buffer.alloc(0);
          return;
        }
        chunks.push(pending.subarray(4, size + 4));
        pending = pending.subarray(size + 4);
      }
    });
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Scanner fixture unavailable');
  return {
    port: address.port,
    async close() {
      for (const socket of sockets) socket.destroy();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}
it('SEC-003: the scanner streams framed bytes and accepts only an explicit clean result', async () => {
  const bytes = Buffer.alloc(150000, 65);
  const server = await fixture((socket, received) => {
    expect(received.equals(bytes)).toBe(true);
    socket.write('stream: ');
    setTimeout(() => socket.end('OK\0'), 5);
  });
  try {
    expect(
      await new ClamScanner({ host: '127.0.0.1', port: server.port, timeoutMs: 1000 }).scan(bytes),
    ).toBe('clean');
  } finally {
    await server.close();
  }
});
it('SEC-003: an explicit virus verdict rejects content without disclosing signature details', async () => {
  const server = await fixture((socket) => socket.end('stream: Test-Signature FOUND\0'));
  try {
    expect(
      await new ClamScanner({ host: '127.0.0.1', port: server.port }).scan(Buffer.from('fixture')),
    ).toBe('rejected');
  } finally {
    await server.close();
  }
});
it.each(['stream: Error ERROR\0', 'stream: partial', 'x'.repeat(4097)])(
  'SEC: malformed/partial/oversized scanner responses fail closed',
  async (response) => {
    const server = await fixture((socket) => socket.end(response));
    try {
      await expect(
        new ClamScanner({ host: '127.0.0.1', port: server.port }).scan(Buffer.from('fixture')),
      ).rejects.toThrow('SCAN_UNAVAILABLE');
    } finally {
      await server.close();
    }
  },
);
it('SEC: scanner timeouts, connection failure and out-of-policy sizes cannot become clean', async () => {
  const server = await fixture(() => undefined);
  const port = server.port;
  try {
    await expect(
      new ClamScanner({ host: '127.0.0.1', port, timeoutMs: 100 }).scan(Buffer.from('fixture')),
    ).rejects.toThrow('SCAN_UNAVAILABLE');
  } finally {
    await server.close();
  }
  const scanner = new ClamScanner({ host: '127.0.0.1', port });
  await expect(scanner.scan(Buffer.from('fixture'))).rejects.toThrow('SCAN_UNAVAILABLE');
  await expect(scanner.scan(Buffer.alloc(0))).rejects.toThrow('SCAN_UNAVAILABLE');
  await expect(scanner.scan(Buffer.alloc(10000001))).rejects.toThrow('SCAN_UNAVAILABLE');
});

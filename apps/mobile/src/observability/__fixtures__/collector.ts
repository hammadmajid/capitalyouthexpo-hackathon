import { createServer } from 'node:http';
import { gunzipSync } from 'node:zlib';
export async function telemetryCollector(status = 200) {
  const bodies: string[] = [];
  let closing: Promise<void> | undefined;
  const server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    let size = 0;
    request.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size <= 65536) chunks.push(chunk);
    });
    request.on('end', () => {
      const buffer = Buffer.concat(chunks);
      bodies.push(
        request.headers['content-encoding'] === 'gzip'
          ? gunzipSync(buffer).toString()
          : buffer.toString(),
      );
      response.writeHead(status, { 'content-type': 'application/json' });
      response.end('{}');
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Collector did not bind');
  return {
    bodies,
    dsn: 'http://' + 'a'.repeat(32) + '@127.0.0.1:' + address.port + '/12',
    close: () => {
      closing ??= new Promise<void>((resolve, reject) => {
        server.closeAllConnections();
        server.close((error) => (error ? reject(error) : resolve()));
      });
      return closing;
    },
  };
}

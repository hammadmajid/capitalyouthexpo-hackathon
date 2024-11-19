import { Buffer } from 'node:buffer';
import { it } from 'vitest';
// SEC-001: native component tooling adds DOM definitions through Vitest's environment types.
const payload: Buffer = Buffer.alloc(4);
it('SEC-001: portable fetch body', async () => {
  await fetch('http://localhost:4000', { method: 'PUT', body: Uint8Array.from(payload) });
});

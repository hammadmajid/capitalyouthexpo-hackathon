// @vitest-environment node
import { expect, it, vi } from 'vitest';
import { proxyApi } from './proxy';
import { webConfig } from './config';

it.each(['true', 'false'])(
  'RPT-002 / AUD-007: same-origin report proxy preserves truncated=%s metadata and exact CSV bytes',
  async (truncated) => {
    const csv = '"Resident"\r\n"\'=1+1"\r\n';
    const transport = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(csv, {
        headers: {
          'content-type': 'text/csv; charset=utf-8',
          'content-disposition': 'attachment; filename="r.csv"',
          'x-hsm-report-truncated': truncated,
          'x-private-server': 'never forward',
        },
      }),
    );
    const response = await proxyApi(
      new Request('http://localhost:3000/api/v1/owner/reports/residents?format=csv'),
      ['owner', 'reports', 'residents'],
      webConfig({ APP_ENV: 'test' }),
      transport,
    );
    expect(response.headers.get('x-hsm-report-truncated')).toBe(truncated);
    expect(response.headers.get('content-disposition')).toBe('attachment; filename="r.csv"');
    expect(response.headers.get('x-private-server')).toBeNull();
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.text()).toBe(csv);
  },
);

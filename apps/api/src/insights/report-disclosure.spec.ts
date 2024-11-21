import { expect, it, vi } from 'vitest';
import { reportSchema, toCsv } from '@hsm/contracts';
import { InsightsController } from './insights.controller.js';
// Controller-only boundary test: service authorization has separate real HTTP
// coverage. Supply the actor normally established by AuthGuard.
vi.mock('../access.js', async (original) => ({
  ...(await original<typeof import('../access.js')>()),
  actorOf: () => ({
    userId: '10000000-0000-4000-8000-000000000001',
    sessionId: '10000000-0000-4000-8000-000000000002',
  }),
}));

it.each([
  { format: 'csv', truncated: true },
  { format: 'csv', truncated: false },
  { format: 'pdf', truncated: true },
  { format: 'pdf', truncated: false },
  { format: 'json', truncated: true },
  { format: 'json', truncated: false },
])(
  'RPT-002 / AUD-007: $format discloses actual truncated=$truncated without changing its body or filename',
  async ({ format, truncated }) => {
    const report = reportSchema.parse({
      type: 'residents',
      from: null,
      to: null,
      columns: ['Resident'],
      rows: [['=1+1'], ['Comma, quoted "name"']],
      truncated,
    });
    const body = format === 'csv' ? toCsv(report) : 'synthetic file body';
    const file = {
      report,
      body,
      filename: 'hsm-residents-2026-06-25.' + format,
      contentType: 'text/csv',
    };
    const reports = { owner: vi.fn(async () => file), branch: vi.fn(async () => file) };
    const controller = new InsightsController({
      reports: reports as never,
      dashboards: {} as never,
    });
    for (const role of ['owner', 'branch']) {
      const reply = { header: vi.fn().mockReturnThis() };
      const result =
        role === 'owner'
          ? await controller.ownerReport({} as never, reply as never, 'residents', { format })
          : await controller.branchReport(
              {} as never,
              reply as never,
              '10000000-0000-4000-8000-000000000001',
              'residents',
              { format },
            );
      expect(result).toBe(body);
      expect(reply.header).toHaveBeenCalledWith('X-HSM-Report-Truncated', String(truncated));
      expect(reply.header).toHaveBeenCalledWith(
        'Content-Disposition',
        `attachment; filename="${file.filename}"`,
      );
      expect(reply.header).toHaveBeenCalledWith('Cache-Control', 'no-store');
    }
    if (format === 'csv')
      expect(body).toBe('"Resident"\r\n"\'=1+1"\r\n"Comma, quoted ""name"""\r\n');
  },
);

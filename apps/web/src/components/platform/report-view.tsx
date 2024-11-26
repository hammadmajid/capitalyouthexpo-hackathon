'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { readReport } from '@hsm/api-client';
import { reportTypeSchema, type ReportType } from '@hsm/contracts';
import { browserClient } from '../../lib/client';
import { errorMessage } from '../../lib/messages';
import { Button } from '../ui/button';
import { reportLabels } from './report-filters';
const pageSize = 20;
type Props = { actorId: string; branchId?: string; from: string; to: string };
// RPT-001/002 / OWN-004: the server's exact report rows, read on screen (as on mobile) for the
// same branch scope and dates as the downloads. Nothing is recalculated in the browser.
export function ReportView({ actorId, branchId, from, to }: Props) {
  const [type, setType] = useState<ReportType>(),
    [shown, setShown] = useState(pageSize);
  const scope = {
    ...(branchId ? { branchId } : {}),
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
  };
  const report = useQuery({
    queryKey: ['owner-report', actorId, type, scope],
    enabled: type !== undefined,
    gcTime: 0,
    retry: false,
    queryFn: () => readReport(browserClient(), type, scope),
  });
  const data = report.data;
  return (
    <section aria-label="View report" className="space-y-2">
      <label className="field-label">
        View report on screen
        <select
          className="field-input"
          value={type ?? ''}
          onChange={(event) => {
            const next = reportTypeSchema.safeParse(event.target.value);
            setType(next.success ? next.data : undefined);
            setShown(pageSize);
          }}
        >
          <option value="">Choose a report</option>
          {reportTypeSchema.options.map((option) => (
            <option key={option} value={option}>
              {reportLabels[option]}
            </option>
          ))}
        </select>
      </label>
      {type && report.isPending ? <p role="status">Loading report…</p> : null}
      {report.error ? <p role="alert">{errorMessage(report.error)}</p> : null}
      {data ? (
        <>
          {data.truncated ? <p>More rows exist; narrow the dates or download the file.</p> : null}
          {data.rows.length === 0 ? (
            <p>No records yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead>
                  <tr>
                    {data.columns.map((column) => (
                      <th key={column} scope="col" className="border-b border-hsm-border p-2">
                        {column}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.rows.slice(0, shown).map((row, index) => (
                    <tr key={index}>
                      {data.columns.map((column, cell) => (
                        <td key={column} className="border-b border-hsm-border p-2">
                          {row[cell] || '—'}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {data.rows.length > shown ? (
            <Button variant="secondary" onClick={() => setShown(shown + pageSize)}>
              Show more rows
            </Button>
          ) : null}
        </>
      ) : null}
    </section>
  );
}

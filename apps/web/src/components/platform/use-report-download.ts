'use client';
import { useCallback, useEffect, useRef, useState, type MouseEvent } from 'react';
import { REPORT_TRUNCATED_HEADER, reportTruncationHeaderSchema } from '@hsm/contracts';

function filename(response: Response, path: string) {
  const supplied = response.headers
    .get('content-disposition')
    ?.match(/^attachment;\s*filename="(hsm-[a-z-]+-\d{4}-\d{2}-\d{2}\.(?:csv|pdf))"$/i)?.[1];
  const format = new URL(path, window.location.origin).searchParams.get('format');
  return supplied ?? 'hsm-report.' + (format === 'pdf' ? 'pdf' : 'csv');
}
// RPT-002 / AUD-007: inspect the same authenticated response that is downloaded.
// Keep one blob at most, and abort/release resources when the screen unmounts.
export function useReportDownload() {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const active = useRef<AbortController | null>(null);
  const objectUrl = useRef<string | null>(null);
  const release = useCallback(() => {
    if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    objectUrl.current = null;
  }, []);
  useEffect(
    () => () => {
      active.current?.abort();
      release();
    },
    [release],
  );
  async function download(event: MouseEvent<HTMLAnchorElement>) {
    event.preventDefault();
    if (active.current) return;
    const path = event.currentTarget.getAttribute('href');
    if (!path) return;
    const controller = new AbortController();
    active.current = controller;
    release();
    setPending(true);
    setMessage(null);
    try {
      const response = await fetch(path, {
        credentials: 'same-origin',
        cache: 'no-store',
        redirect: 'error',
        signal: controller.signal,
      });
      if (!response.ok) throw new Error('Report download unavailable');
      const blob = await response.blob();
      if (controller.signal.aborted) return;
      objectUrl.current = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objectUrl.current;
      link.download = filename(response, path);
      document.body.appendChild(link);
      link.click();
      link.remove();
      const metadata = reportTruncationHeaderSchema.safeParse(
        response.headers.get(REPORT_TRUNCATED_HEADER),
      );
      if (!metadata.success)
        setMessage(
          'Report completeness could not be confirmed. Treat this download as potentially incomplete.',
        );
      else if (metadata.data === 'true')
        setMessage(
          'Downloaded report contains only the first 5,000 matching rows. Narrow the filters and export again.',
        );
    } catch {
      if (!controller.signal.aborted)
        setMessage('The report could not be downloaded. Please try again.');
    } finally {
      if (active.current === controller) active.current = null;
      if (!controller.signal.aborted) setPending(false);
    }
  }
  return { download, pending, message };
}

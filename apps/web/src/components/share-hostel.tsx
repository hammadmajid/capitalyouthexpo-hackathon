'use client';
import { useState } from 'react';
import { publicHostelShareUrl } from '@hsm/api-client';
import { Button } from './ui/button';
export function ShareHostel({ branchId }: { branchId: string }) {
  const [status, setStatus] = useState(''),
    [busy, setBusy] = useState(false);
  async function share() {
    if (busy) return;
    setBusy(true);
    setStatus('');
    try {
      const url = publicHostelShareUrl(window.location.origin, branchId);
      if (navigator.share) await navigator.share({ title: 'HSM hostel summary', url });
      else {
        await navigator.clipboard.writeText(url);
        setStatus('Public summary link copied.');
      }
    } catch (error) {
      if (!(error instanceof Error && error.name === 'AbortError'))
        setStatus('Sharing unavailable. Open the public family summary to copy its link.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-2">
      <Button variant="secondary" disabled={busy} onClick={() => void share()}>
        Share hostel with family
      </Button>
      <a href={'/share/' + branchId}>Public family summary</a>
      {status ? <p role="status">{status}</p> : null}
    </div>
  );
}

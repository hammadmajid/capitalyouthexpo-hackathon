'use client';
import { useEffect } from 'react';
import { reportBrowserFailure } from '../lib/telemetry-runtime';
import { Button } from '../components/ui/button';
export default function ErrorPage({ error, reset }: { error: Error; reset: () => void }) {
  useEffect(() => {
    reportBrowserFailure();
  }, [error]);
  return (
    <main id="main" className="mx-auto max-w-lg space-y-5 p-10">
      <h1 className="text-2xl font-bold text-hsm-heading">Something interrupted your visit</h1>
      <p>Please try again in a moment.</p>
      <Button onClick={reset}>Try again</Button>
    </main>
  );
}

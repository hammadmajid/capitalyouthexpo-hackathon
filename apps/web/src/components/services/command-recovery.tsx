'use client';
import { Button } from '../ui/button';
export function CommandRecovery({
  command,
}: {
  command: {
    unresolved: boolean;
    isPending: boolean;
    retryOriginal: () => void;
  };
}) {
  if (!command.unresolved) return null;
  return (
    <div role="status">
      <p>A previous request is unresolved. Retry sends its original details.</p>
      <Button variant="secondary" disabled={command.isPending} onClick={command.retryOriginal}>
        Retry previous request
      </Button>
    </div>
  );
}

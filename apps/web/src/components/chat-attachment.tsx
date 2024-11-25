'use client';
import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { downloadChatAttachment } from '@hsm/api-client';
import { browserClient } from '../lib/client';
import { errorMessage } from '../lib/messages';
import { Button } from './ui/button';
export function ChatAttachment({
  conversationId,
  fileId,
  branchId,
}: {
  conversationId: string;
  fileId: string;
  branchId?: string;
}) {
  const [link, setLink] = useState<{ url: string; expiresAt: string }>();
  const mutation = useMutation({
    retry: false,
    gcTime: 0,
    mutationFn: () => {
      setLink(undefined);
      return downloadChatAttachment(browserClient(), conversationId, fileId, branchId);
    },
    onSuccess: setLink,
  });
  return (
    <div className="space-y-2">
      <Button variant="secondary" disabled={mutation.isPending} onClick={() => mutation.mutate()}>
        Request private attachment
      </Button>
      {mutation.error ? <p role="alert">{errorMessage(mutation.error)}</p> : null}
      {link && Date.parse(link.expiresAt) > Date.now() ? (
        <a
          className="text-link"
          href={link.url}
          target="_blank"
          rel="noopener noreferrer"
          referrerPolicy="no-referrer"
          onClick={() => setLink(undefined)}
        >
          Open attachment (temporary link)
        </a>
      ) : null}
    </div>
  );
}

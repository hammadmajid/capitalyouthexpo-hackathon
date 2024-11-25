'use client';
import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ClientFailure, listChatReports, readChatSafetyContext } from '@hsm/api-client';
import { chatSafetyContextSchema, type SelfProfile } from '@hsm/contracts';
import type { z } from 'zod';
import { errorMessage } from '../lib/messages';
import { Button } from './ui/button';
import { karachiDateTime } from '../lib/karachi-time';
import { useOperationScope, type StaffRole } from './platform/admin-operations';
export function ChatSafety({ profile }: { profile: SelfProfile }) {
  const admin = profile.capabilities.admin;
  if (
    !admin ||
    (!admin.isRoot &&
      !admin.roles.some((role) => role === 'support' || role === 'content_moderator'))
  )
    return null;
  return (
    <Workspace
      key={profile.user.id + ':' + admin.roles.join(',')}
      actorId={profile.user.id}
      role={admin.roles.includes('support') ? 'support' : 'content_moderator'}
    />
  );
}
function Workspace({ actorId, role }: { actorId: string; role: StaffRole }) {
  const scope = useOperationScope(actorId, 'chat-safety', role);
  const focusEpoch = useRef(0);
  const [open, setOpen] = useState(false),
    [cursor, setCursor] = useState<string>(),
    [selected, setSelected] = useState<{ reportId: string; messageId: string }>(),
    [justification, setJustification] = useState(''),
    [context, setContext] = useState<z.infer<typeof chatSafetyContextSchema>>();
  const query = useQuery({
    queryKey: [...scope.key, cursor],
    enabled: open,
    gcTime: 0,
    retry: false,
    queryFn: ({ signal }) =>
      scope.read((client) => listChatReports(client, cursor ? { cursor } : {}), signal),
  });
  const access = useMutation({
    gcTime: 0,
    retry: false,
    mutationFn: async () => {
      setContext(undefined);
      if (!selected) throw new ClientFailure('INVALID_RESPONSE');
      const epoch = focusEpoch.current;
      const result = await scope.read((client) =>
        readChatSafetyContext(client, selected.reportId, { justification }),
      );
      if (epoch !== focusEpoch.current) throw new ClientFailure('INVALID_RESPONSE');
      if (result.reportedMessageId !== selected.messageId)
        throw new ClientFailure('INVALID_RESPONSE');
      return result;
    },
    onSuccess: (result) => {
      setContext(result);
      setJustification('');
    },
  });
  useEffect(() => {
    function clear() {
      focusEpoch.current += 1;
      setContext(undefined);
      setSelected(undefined);
      setJustification('');
    }
    window.addEventListener('blur', clear);
    document.addEventListener('visibilitychange', clear);
    return () => {
      focusEpoch.current += 1;
      window.removeEventListener('blur', clear);
      document.removeEventListener('visibilitychange', clear);
    };
  }, []);
  const hidden = query.isPending || query.isFetching || query.isError;
  return (
    <section aria-label="Reported chat safety cases" className="space-y-4">
      <Button
        variant="secondary"
        disabled={access.isPending}
        onClick={() => {
          setOpen(!open);
          setSelected(undefined);
          setContext(undefined);
          setJustification('');
        }}
      >
        Reported chat safety cases
      </Button>
      {open ? (
        <>
          {query.isError ? (
            <p role="alert">{errorMessage(query.error)}</p>
          ) : hidden ? (
            <p role="status">Loading authorized cases…</p>
          ) : (
            <>
              {!query.data?.data.length ? <p>No reported chat cases on this page.</p> : null}
              {query.data?.data.map((report) => (
                <article
                  key={report.id}
                  className="space-y-2 rounded-card border border-hsm-border p-4"
                >
                  <p>
                    {report.reason.replaceAll('_', ' ')} — {report.status} —{' '}
                    {karachiDateTime(report.createdAt)}
                  </p>
                  {report.details ? (
                    <p className="whitespace-pre-wrap break-words">{report.details}</p>
                  ) : null}
                  <Button
                    variant="secondary"
                    disabled={access.isPending}
                    onClick={() => {
                      setSelected({ reportId: report.id, messageId: report.targetId });
                      setContext(undefined);
                      setJustification('');
                      access.reset();
                    }}
                  >
                    Review reported message
                  </Button>
                </article>
              ))}
              {query.data?.nextCursor ? (
                <Button
                  variant="secondary"
                  disabled={access.isPending}
                  onClick={() => {
                    setCursor(query.data.nextCursor ?? undefined);
                    setContext(undefined);
                    setSelected(undefined);
                  }}
                >
                  More cases
                </Button>
              ) : null}
            </>
          )}
          <Button
            variant="secondary"
            disabled={query.isFetching || access.isPending}
            onClick={() => {
              setContext(undefined);
              void query.refetch();
            }}
          >
            Refresh case access
          </Button>
          {selected && !hidden ? (
            <form
              className="space-y-3"
              onSubmit={(event) => {
                event.preventDefault();
                if (!access.isPending && justification.trim()) access.mutate();
              }}
            >
              <p>
                Access is restricted to the reported message and up to two neighbors on each side.
                Every access is audited.
              </p>
              <label className="field-label" htmlFor="chat-safety-purpose">
                Investigation justification
              </label>
              <textarea
                className="field-input"
                id="chat-safety-purpose"
                maxLength={1000}
                disabled={access.isPending}
                value={justification}
                onChange={(event) => setJustification(event.target.value)}
              />
              <Button type="submit" disabled={access.isPending || !justification.trim()}>
                Authorize audited context access
              </Button>
            </form>
          ) : null}
          {access.error ? <p role="alert">{errorMessage(access.error)}</p> : null}
          {context && !hidden && !access.isPending && !access.isError ? (
            <section aria-label="Audited reported message context" className="space-y-3">
              {context.messages.map((row) => (
                <article key={row.id} className="rounded-card border border-hsm-border p-3">
                  <p>
                    {row.id === context.reportedMessageId
                      ? 'Reported message'
                      : 'Surrounding message'}{' '}
                    — {row.senderSide} — {karachiDateTime(row.createdAt)}
                    {row.removed ? ' — removed from participant history' : ''}
                  </p>
                  {row.body ? <p className="whitespace-pre-wrap break-words">{row.body}</p> : null}
                  <p>
                    {row.attachmentCount} attachment(s); private file access requires separate
                    authority.
                  </p>
                </article>
              ))}
              <Button variant="secondary" onClick={() => setContext(undefined)}>
                Close sensitive context
              </Button>
            </section>
          ) : null}
        </>
      ) : null}
    </section>
  );
}

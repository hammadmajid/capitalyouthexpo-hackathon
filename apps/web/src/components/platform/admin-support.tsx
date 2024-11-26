'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { cancelAnnouncement, createAnnouncement, readAnnouncements } from '@hsm/api-client';
import { browserClient } from '../../lib/client';
import { errorMessage } from '../../lib/messages';
import { Button } from '../ui/button';
import { useCommand } from '../services/use-command';
import { CommandRecovery } from '../services/command-recovery';
// ADM-009/010: support queue and plain-text announcements (Support role or Root).
export { SupportOperations as SupportQueue } from './admin-operations-support';
export function Announcements({ actorId }: { actorId: string }) {
  const key = ['announcements', actorId];
  const list = useQuery({
    queryKey: key,
    gcTime: 0,
    retry: false,
    queryFn: () => readAnnouncements(browserClient()),
  });
  const [form, setForm] = useState({ audience: 'all_managers', title: '', body: '' });
  const create = useCommand(
    'Announcements:create',
    (input: Record<string, unknown>, k) => createAnnouncement(browserClient(), input, k),
    [key],
  );
  const cancel = useCommand(
    'Announcements:cancel',
    (announcementId: string, k) => cancelAnnouncement(browserClient(), announcementId, k),
    [key],
  );
  return (
    <section aria-label="Announcements" className="space-y-1">
      <CommandRecovery command={create} />
      <CommandRecovery command={cancel} />
      <h3 className="font-semibold">Announcements</h3>
      {create.isError || cancel.isError ? (
        <p role="alert">{errorMessage(create.error ?? cancel.error)}</p>
      ) : null}
      <select
        aria-label="Audience"
        className="field-input"
        value={form.audience}
        onChange={(event) => setForm({ ...form, audience: event.target.value })}
      >
        <option value="all_managers">All managers</option>
        <option value="customers">Customers</option>
      </select>
      <input
        aria-label="Announcement title"
        className="field-input"
        maxLength={120}
        value={form.title}
        onChange={(event) => setForm({ ...form, title: event.target.value })}
      />
      <textarea
        aria-label="Announcement text"
        className="field-input"
        maxLength={2000}
        value={form.body}
        onChange={(event) => setForm({ ...form, body: event.target.value })}
      />
      <Button
        disabled={!form.title.trim() || !form.body.trim() || create.isPending}
        onClick={() =>
          create.mutate({
            audience: form.audience,
            title: form.title.trim(),
            body: form.body.trim(),
          })
        }
      >
        Send announcement
      </Button>
      {list.data?.data.map((row) => (
        <p key={row.id}>
          {row.title} · {row.status}
          {row.recipientCount !== null ? ' · ' + row.recipientCount + ' recipients' : ''}
          {row.status === 'scheduled' ? (
            <Button variant="ghost" onClick={() => cancel.mutate(row.id)}>
              Cancel {row.title}
            </Button>
          ) : null}
        </p>
      ))}
    </section>
  );
}

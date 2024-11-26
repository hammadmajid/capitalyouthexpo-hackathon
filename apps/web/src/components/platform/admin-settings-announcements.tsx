'use client';
import { useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { cancelAnnouncement, createAnnouncement, readAdminAnnouncements } from '@hsm/api-client';
import { announcementInputSchema, karachiLocalInstantSchema } from '@hsm/contracts';
import type { z } from 'zod';
import { Button } from '../ui/button';
import { useCommand } from '../services/use-command';
import { CommandRecovery } from '../services/command-recovery';
import { errorMessage } from '../../lib/messages';
import {
  OperationConfirmation,
  OperationPages,
  OperationSection,
  OperationState,
  useOperationScope,
} from './admin-operations';
type Input = z.infer<typeof announcementInputSchema>;
export function AnnouncementsAdministration({ actorId }: { actorId: string }) {
  const scope = useOperationScope(actorId, 'announcements', 'support');
  const [form, setForm] = useState({
    audience: 'all_managers',
    title: '',
    body: '',
    branchIds: '',
    cityId: '',
    scheduledAt: '',
  });
  const [status, setStatus] = useState('all'),
    [preview, setPreview] = useState<Input>(),
    [invalid, setInvalid] = useState(false),
    [cancelId, setCancelId] = useState<string>();
  const list = useInfiniteQuery({
    queryKey: [...scope.key, status],
    initialPageParam: undefined as string | undefined,
    retry: false,
    gcTime: 0,
    queryFn: ({ pageParam, signal }) =>
      scope.read(
        (c) =>
          readAdminAnnouncements(c, {
            ...(status === 'all' ? {} : { status }),
            ...(pageParam ? { cursor: pageParam } : {}),
            limit: 20,
          }),
        signal,
      ),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
  const create = useCommand(
    'AdminAnnouncements:create',
    (input: Input, key) => scope.read((c) => createAnnouncement(c, input, key)),
    [scope.key],
  );
  const cancel = useCommand(
    'AdminAnnouncements:cancel',
    (id: string, key) => scope.read((c) => cancelAnnouncement(c, id, key)),
    [scope.key],
  );
  const locked = create.isPending || cancel.isPending || create.unresolved || cancel.unresolved;
  function review() {
    try {
      const scheduledAt = form.scheduledAt
        ? karachiLocalInstantSchema.parse(form.scheduledAt)
        : undefined;
      const parsed = announcementInputSchema.parse({
        audience: form.audience,
        title: form.title,
        body: form.body,
        branchIds:
          form.audience === 'selected_branches'
            ? form.branchIds.split(/[\s,]+/).filter(Boolean)
            : [],
        ...(form.audience === 'city' ? { cityId: form.cityId.trim() } : {}),
        ...(scheduledAt ? { scheduledAt } : {}),
      });
      if (scheduledAt && new Date(scheduledAt).getTime() <= Date.now())
        throw new Error('Past schedule');
      setPreview(parsed);
      setInvalid(false);
    } catch {
      setInvalid(true);
    }
  }
  const rows =
    list.isError || (list.isFetching && !list.isFetchingNextPage)
      ? []
      : (list.data?.pages.flatMap((p) => p.data) ?? []);
  return (
    <OperationSection title="Announcements">
      <p>Plain-text in-app notices. Sent means internal delivery, not external push delivery.</p>
      <CommandRecovery command={create} />
      <CommandRecovery command={cancel} />
      {create.error || cancel.error ? (
        <p role="alert">{errorMessage(create.error ?? cancel.error)}</p>
      ) : null}
      <fieldset disabled={locked || Boolean(preview)} className="space-y-3">
        <label className="field-label">
          Audience
          <select
            aria-label="Announcement audience"
            className="field-input"
            value={form.audience}
            onChange={(e) => setForm({ ...form, audience: e.target.value })}
          >
            <option value="all_managers">All managers</option>
            <option value="selected_branches">Selected hostels</option>
            <option value="customers">Customers</option>
            <option value="city">City group</option>
          </select>
        </label>
        {form.audience === 'selected_branches' ? (
          <label className="field-label">
            Approved branch IDs
            <input
              aria-label="Announcement branch IDs"
              className="field-input"
              value={form.branchIds}
              onChange={(e) => setForm({ ...form, branchIds: e.target.value })}
            />
          </label>
        ) : null}
        {form.audience === 'city' ? (
          <label className="field-label">
            City ID
            <input
              aria-label="Announcement city ID"
              className="field-input"
              value={form.cityId}
              onChange={(e) => setForm({ ...form, cityId: e.target.value })}
            />
          </label>
        ) : null}
        <label className="field-label">
          Title
          <input
            aria-label="Announcement title"
            className="field-input"
            maxLength={120}
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
          />
        </label>
        <label className="field-label">
          Text
          <textarea
            aria-label="Announcement body"
            className="field-input"
            maxLength={2000}
            value={form.body}
            onChange={(e) => setForm({ ...form, body: e.target.value })}
          />
        </label>
        <label className="field-label">
          Schedule (Asia/Karachi, optional)
          <input
            aria-label="Announcement Karachi schedule"
            type="datetime-local"
            className="field-input"
            value={form.scheduledAt}
            onChange={(e) => setForm({ ...form, scheduledAt: e.target.value })}
          />
        </label>
        <Button disabled={!form.title.trim() || !form.body.trim()} onClick={review}>
          Preview announcement
        </Button>
      </fieldset>
      {invalid ? (
        <p role="alert">Check audience identifiers, title, text and a future Karachi schedule.</p>
      ) : null}
      {preview ? (
        <div aria-label="Announcement preview">
          <h4>{preview.title}</h4>
          <p>{preview.body}</p>
          <p>
            {preview.audience} ·{' '}
            {preview.scheduledAt
              ? new Date(preview.scheduledAt).toLocaleString('en-PK', { timeZone: 'Asia/Karachi' })
              : 'Deliver when processed'}
          </p>
          <OperationConfirmation
            label="schedule announcement"
            pending={locked}
            confirm={() =>
              create.mutate(preview, {
                onSuccess: () => {
                  setPreview(undefined);
                  setForm({ ...form, title: '', body: '' });
                },
              })
            }
            cancel={() => setPreview(undefined)}
          />
        </div>
      ) : null}
      <label className="field-label">
        Delivery status
        <select
          aria-label="Announcement status"
          className="field-input"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="all">All</option>
          {['scheduled', 'sent', 'cancelled'].map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      </label>
      <OperationState
        pending={list.isPending || list.isFetching}
        error={list.error}
        retry={() => {
          void list.refetch();
        }}
        empty={!rows.length}
      />
      {rows.map((row) => (
        <article key={row.id}>
          <h4>{row.title}</h4>
          <p>{row.body}</p>
          <p>
            {row.audience} · {row.status} · Scheduled{' '}
            {new Date(row.scheduledAt).toLocaleString('en-PK', { timeZone: 'Asia/Karachi' })}
          </p>
          <p>
            {row.recipientCount === null
              ? 'Delivery count unavailable until sent'
              : row.recipientCount + ' recipients'}
          </p>
          {row.sentAt ? (
            <p>Sent {new Date(row.sentAt).toLocaleString('en-PK', { timeZone: 'Asia/Karachi' })}</p>
          ) : null}
          {row.status === 'scheduled' ? (
            <Button disabled={locked} variant="secondary" onClick={() => setCancelId(row.id)}>
              Cancel {row.title}
            </Button>
          ) : null}
        </article>
      ))}
      {cancelId ? (
        <OperationConfirmation
          label="cancel announcement"
          pending={locked}
          confirm={() => cancel.mutate(cancelId, { onSuccess: () => setCancelId(undefined) })}
          cancel={() => setCancelId(undefined)}
        />
      ) : null}
      <OperationPages
        hasMore={Boolean(list.hasNextPage)}
        fetching={list.isFetching}
        more={() => {
          void list.fetchNextPage();
        }}
        refresh={() => {
          void list.refetch();
        }}
      />
    </OperationSection>
  );
}

'use client';
import { useState } from 'react';
import { InstitutionHistory } from './institution-history';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { listAdminInstitutions, readAdminInstitution, saveAdminInstitution } from '@hsm/api-client';
import { institutionGovernanceInputSchema } from '@hsm/contracts';
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
type Input = z.infer<typeof institutionGovernanceInputSchema>;
export function InstitutionAdministration({ actorId }: { actorId: string }) {
  const scope = useOperationScope(actorId, 'institutions', 'root');
  const [search, setSearch] = useState(''),
    [q, setQ] = useState(''),
    [active, setActive] = useState('all');
  const [selected, setSelected] = useState<string>();
  const list = useInfiniteQuery({
    queryKey: [...scope.key, q, active],
    initialPageParam: undefined as string | undefined,
    retry: false,
    gcTime: 0,
    queryFn: ({ pageParam, signal }) =>
      scope.read(
        (c) =>
          listAdminInstitutions(c, {
            ...(q ? { q } : {}),
            active,
            ...(pageParam ? { cursor: pageParam } : {}),
            limit: 20,
          }),
        signal,
      ),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
  const detail = useQuery({
    queryKey: [...scope.key, 'detail', selected],
    enabled: Boolean(selected && selected !== 'new'),
    retry: false,
    gcTime: 0,
    queryFn: ({ signal }) => scope.read((c) => readAdminInstitution(c, selected), signal),
  });
  const rows =
    list.isError || (list.isFetching && !list.isFetchingNextPage)
      ? []
      : (list.data?.pages.flatMap((p) => p.data) ?? []);
  const record = detail.isError || detail.isFetching ? undefined : detail.data;
  return (
    <OperationSection title="Institution directory">
      <p>
        Root-only directory identities. Withdraw approval or deactivate to preserve historical
        references; records are never deleted here.
      </p>
      <label className="field-label">
        Search name
        <input
          aria-label="Institution search"
          className="field-input"
          maxLength={180}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </label>
      <Button variant="secondary" onClick={() => setQ(search.trim())}>
        Search institutions
      </Button>
      <select
        aria-label="Institution active filter"
        className="field-input"
        value={active}
        onChange={(e) => setActive(e.target.value)}
      >
        {['all', 'active', 'inactive'].map((v) => (
          <option key={v}>{v}</option>
        ))}
      </select>
      <Button onClick={() => setSelected('new')}>Create institution</Button>
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
          <h4>{row.name}</h4>
          <p>
            {row.isActive ? 'Active' : 'Inactive'} ·{' '}
            {row.publicApproved ? 'Public approval recorded' : 'Not approved publicly'}
          </p>
          <Button variant="secondary" onClick={() => setSelected(row.id)}>
            Edit {row.name}
          </Button>
        </article>
      ))}
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
      {selected && selected !== 'new' ? (
        <OperationState
          pending={detail.isPending || detail.isFetching}
          error={detail.error}
          retry={() => {
            void detail.refetch();
          }}
        />
      ) : null}
      {selected === 'new' || record ? (
        <InstitutionEditor
          key={selected + ':' + record?.id}
          actorId={actorId}
          {...(record ? { record: { ...record, type: record.type ?? 'university' } } : {})}
          close={() => setSelected(undefined)}
        />
      ) : null}
    </OperationSection>
  );
}
function InstitutionEditor({
  actorId,
  record,
  close,
}: {
  actorId: string;
  record?: Omit<Input, 'changeReason' | 'reapprove'> & { id: string; revision: string };
  close: () => void;
}) {
  const scope = useOperationScope(actorId, 'institution-edit', 'root');
  const [form, setForm] = useState({
    name: record?.name ?? '',
    shortName: record?.shortName ?? '',
    cityId: record?.cityId ?? '',
    areaId: record?.areaId ?? '',
    address: record?.address ?? '',
    latitude: record ? String(record.latitude) : '',
    longitude: record ? String(record.longitude) : '',
    aliases: record?.aliases.join('\n') ?? '',
    isActive: record?.isActive ?? true,
    publicApproved: record?.publicApproved ?? false,
    changeReason: '',
    reapprove: false,
  });
  const [preview, setPreview] = useState<Input>(),
    [invalid, setInvalid] = useState(false);
  const command = useCommand(
    'AdminInstitution:save:' + (record?.id ?? 'new'),
    (input: Input, key) =>
      scope.read((c) =>
        saveAdminInstitution(
          c,
          record ? { ...input, expectedRevision: record.revision } : input,
          key,
          record?.id,
        ),
      ),
    [['platform-admin-web', actorId, 'institutions']],
  );
  const locked = command.isPending || command.unresolved;
  function review() {
    const result = institutionGovernanceInputSchema.safeParse({
      ...form,
      shortName: form.shortName.trim() || null,
      areaId: form.areaId.trim() || null,
      address: form.address.trim() || null,
      latitude: form.latitude.trim() ? Number(form.latitude) : NaN,
      longitude: form.longitude.trim() ? Number(form.longitude) : NaN,
      aliases: form.aliases
        .split('\n')
        .map((a) => a.trim())
        .filter(Boolean),
    });
    setInvalid(!result.success);
    if (result.success) setPreview(result.data);
  }
  return (
    <div className="space-y-3" aria-label="Institution editor">
      <h4>{record ? 'Edit institution' : 'New institution'}</h4>
      {record ? <InstitutionHistory id={record.id} actorId={actorId} /> : null}
      <CommandRecovery command={command} />
      {command.error ? <p role="alert">{errorMessage(command.error)}</p> : null}
      <fieldset disabled={locked || Boolean(preview)} className="space-y-3">
        {(
          ['name', 'shortName', 'cityId', 'areaId', 'address', 'latitude', 'longitude'] as const
        ).map((field) => (
          <label className="field-label" key={field}>
            {field.replace(/([A-Z])/g, ' $1')}
            <input
              aria-label={'Institution ' + field}
              className="field-input"
              value={form[field]}
              onChange={(e) => setForm({ ...form, [field]: e.target.value })}
            />
          </label>
        ))}
        <label className="field-label">
          Aliases (one per line)
          <textarea
            aria-label="Institution aliases"
            className="field-input"
            value={form.aliases}
            onChange={(e) => setForm({ ...form, aliases: e.target.value })}
          />
        </label>
        <label>
          <input
            type="checkbox"
            checked={form.isActive}
            onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
          />
          Active institution
        </label>
        <label>
          <input
            type="checkbox"
            checked={form.publicApproved}
            onChange={(e) => setForm({ ...form, publicApproved: e.target.checked })}
          />
          Accurate data approved for public discovery
        </label>
        <label className="field-label">
          Change reason
          <textarea
            aria-label="Institution change reason"
            className="field-input"
            maxLength={500}
            value={form.changeReason}
            onChange={(e) => setForm({ ...form, changeReason: e.target.value })}
          />
        </label>
        <label>
          <input
            type="checkbox"
            checked={form.reapprove}
            onChange={(e) => setForm({ ...form, reapprove: e.target.checked })}
          />{' '}
          Explicitly reapprove identity, aliases and location
        </label>
        <p>
          Material changes to approved institutions require reapproval or withdrawal. On a revision
          conflict, close and reopen the latest record before reviewing again.
        </p>
        <Button onClick={review}>Review institution changes</Button>
      </fieldset>
      {invalid ? (
        <p role="alert">
          Check name, references, coordinates, aliases and a reason of at least 8 characters.
        </p>
      ) : null}
      {preview ? (
        <>
          <p>
            {preview.name} · {preview.isActive ? 'Active' : 'Inactive'} ·{' '}
            {preview.publicApproved ? 'Approve public discovery' : 'Withdraw public approval'}
          </p>
          <p>
            Reason: {preview.changeReason} � Reapproval: {preview.reapprove ? 'Yes' : 'No'} �{' '}
            {preview.latitude}, {preview.longitude} · {preview.aliases.join(', ') || 'No aliases'}
          </p>
          <OperationConfirmation
            label="institution changes"
            pending={locked}
            confirm={() => command.mutate(preview, { onSuccess: close })}
            cancel={() => setPreview(undefined)}
          />
        </>
      ) : null}
      <Button variant="secondary" disabled={locked} onClick={close}>
        Close institution editor
      </Button>
    </div>
  );
}

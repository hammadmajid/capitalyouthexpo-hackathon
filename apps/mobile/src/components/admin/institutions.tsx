import { useEffect, useState } from 'react';
import { InstitutionHistory } from './institution-history';
import { listAdminInstitutions, readAdminInstitution, saveAdminInstitution } from '@hsm/api-client';
import { institutionGovernanceInputSchema } from '@hsm/contracts';
import type { z } from 'zod';
import { useStaffPages, useStaffRecord } from './staff-data';
import { useAdminCommand } from './data';
import { StaffPage, Choices, ReadState, Continuation } from './staff-ui';
import { AdminCard, AdminField, AdminHeading } from './ui';
import { NativeCommandRecovery } from '../services/command-recovery';
import { Copy } from '../ui';
import {
  ArrowRight,
  Check,
  FileText,
  Info,
  Map as MapIcon,
  Pencil,
  Plus,
  RefreshCw,
  X,
} from 'lucide-react-native';
import { Modal } from 'react-native';
import { placeKinds, placeTypes, type PlaceType } from '../place-kinds';
import { MapLoader } from '../marketplace/nearby-actions';
const typeLabels = {
  all: 'All',
  ...Object.fromEntries(placeTypes.map((t) => [t, placeKinds[t].label])),
} as Record<'all' | PlaceType, string>;
import { ActionButton, ButtonRow, Fact, RecordRow } from './admin-list';
import { safeMessage } from '../../lib/messages';
type Input = z.infer<typeof institutionGovernanceInputSchema>;
export function AdminInstitutions() {
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [active, setActive] = useState('all');
  const [type, setType] = useState<'all' | PlaceType>('all');
  const [selected, setSelected] = useState<string>();
  const [editorLocked, setEditorLocked] = useState(false);
  const list = useStaffPages(
    'institutions',
    (c, cursor) =>
      listAdminInstitutions(c, {
        limit: 20,
        active,
        ...(type === 'all' ? {} : { type }),
        ...(q ? { q } : {}),
        ...(cursor ? { cursor } : {}),
      }),
    { q, active, type },
  );
  if (selected)
    return (
      <StaffPage
        title={selected === 'new' ? 'Add place' : 'Edit place'}
        onBack={() => {
          if (!editorLocked) setSelected(undefined);
        }}
        backDisabled={editorLocked}
      >
        <InstitutionEditor
          key={selected}
          id={selected}
          close={() => setSelected(undefined)}
          onLockChange={setEditorLocked}
        />
      </StaffPage>
    );
  return (
    <StaffPage
      title="Places"
      search={{
        label: 'Place search',
        value: search,
        onChange: setSearch,
        onSubmit: () => setQ(search.trim()),
        submitLabel: 'Search places',
        maxLength: 180,
      }}
    >
      <Choices
        label="Place type"
        values={['all', ...placeTypes] as ('all' | PlaceType)[]}
        labels={typeLabels}
        value={type}
        onChange={setType}
      />
      <Choices
        label="Shown in search"
        values={['all', 'active', 'inactive']}
        labels={{ all: 'All', active: 'Shown', inactive: 'Hidden' }}
        value={active}
        onChange={setActive}
      />
      <ActionButton
        icon={Plus}
        text="Add place"
        label="Add place"
        tone="solid"
        onPress={() => setSelected('new')}
      />
      <ReadState query={list} empty={list.rows.length === 0} />
      {list.rows.map((row) => (
        <RecordRow
          key={row.id}
          icon={placeKinds[row.type ?? 'university'].Icon}
          title={row.name}
          subtitle={
            placeKinds[row.type ?? 'university'].label +
            ' · ' +
            (row.isActive && row.publicApproved ? 'In search' : 'Hidden')
          }
          status={row.isActive ? 'active' : 'inactive'}
          label={'Edit place: ' + row.name}
          onPress={() => setSelected(row.id)}
        />
      ))}
      <Continuation query={list} />
    </StaffPage>
  );
}
function InstitutionEditor({
  id,
  close,
  onLockChange,
}: {
  id: string;
  close: () => void;
  onLockChange: (locked: boolean) => void;
}) {
  const query = useStaffRecord('institution', id === 'new' ? '' : id, (c) =>
    readAdminInstitution(c, id),
  );
  return id === 'new' ? (
    <InstitutionForm close={close} onLockChange={onLockChange} />
  ) : (
    <>
      <ReadState query={query} />
      {query.record ? (
        <InstitutionForm
          id={id}
          initial={{ ...query.record, type: query.record.type ?? 'university' }}
          close={close}
          onLockChange={onLockChange}
        />
      ) : null}
      <InstitutionHistory id={id} />
    </>
  );
}
function InstitutionForm({
  id,
  initial,
  close,
  onLockChange,
}: {
  id?: string;
  initial?: Omit<Input, 'changeReason' | 'reapprove'> & { revision: string };
  close: () => void;
  onLockChange: (locked: boolean) => void;
}) {
  const [baseRevision] = useState(initial?.revision);
  const [fields, setFields] = useState({
    name: initial?.name ?? '',
    shortName: initial?.shortName ?? '',
    address: initial?.address ?? '',
    aliases: initial?.aliases.join(', ') ?? '',
  });
  const [type, setType] = useState<PlaceType>(initial?.type ?? 'locality');
  const [cityId, setCityId] = useState(initial?.cityId ?? '');
  const [pin, setPin] = useState(
    initial ? { latitude: initial.latitude, longitude: initial.longitude } : undefined,
  );
  const [mapOpen, setMapOpen] = useState(false);
  const cities = useStaffRecord('place-cities', 'all', (c) =>
    listAdminInstitutions(c, { limit: 1 }),
  ).record?.cities;
  const [isActive, setIsActive] = useState(initial?.isActive ?? true);
  const [approved, setApproved] = useState(initial?.publicApproved ?? false);
  const [changeReason, setReason] = useState('');
  const [reapprove, setReapprove] = useState(false);
  const [preview, setPreview] = useState<Input>();
  const [invalid, setInvalid] = useState(false);
  const command = useAdminCommand(
    'Admin:institution:' + (id ?? 'new'),
    (c, input: Input, key) =>
      saveAdminInstitution(c, id ? { ...input, expectedRevision: baseRevision } : input, key, id),
    true,
    'institutions',
  );
  const locked = command.isPending || command.unresolved;
  useEffect(() => {
    onLockChange(locked);
    return () => onLockChange(false);
  }, [locked, onLockChange]);
  function review() {
    const parsed = institutionGovernanceInputSchema.safeParse({
      ...fields,
      type,
      cityId,
      // Area stays as stored; new places are found by their pin, not an area id.
      areaId: initial?.areaId ?? null,
      shortName: fields.shortName.trim() || null,
      address: fields.address.trim() || null,
      latitude: pin?.latitude ?? Number.NaN,
      longitude: pin?.longitude ?? Number.NaN,
      aliases: fields.aliases
        .split(',')
        .map((v) => v.trim())
        .filter(Boolean),
      isActive,
      publicApproved: approved,
      changeReason,
      reapprove,
    });
    setInvalid(!parsed.success);
    if (parsed.success) setPreview(parsed.data);
  }
  const labels = {
    name: 'Name',
    shortName: 'Short name (optional)',
    address: 'Address (optional)',
    aliases: 'Other names, comma separated',
  };
  return (
    <AdminCard>
      <AdminHeading>{id ? 'Edit place' : 'Add place'}</AdminHeading>
      <NativeCommandRecovery command={command} />
      {command.isError ? <Copy alert>{safeMessage(command.error)}</Copy> : null}
      {preview ? (
        <>
          <Fact icon={placeKinds[preview.type].Icon}>
            {placeKinds[preview.type].label + ' · ' + preview.name}
          </Fact>
          <Fact icon={preview.isActive ? Check : X}>
            {(preview.isActive ? 'Shown' : 'Hidden') +
              ' · ' +
              (preview.publicApproved ? 'Public' : 'Not public') +
              (preview.reapprove ? ' · Reapproved' : '')}
          </Fact>
          <Fact icon={FileText}>{preview.changeReason}</Fact>
          <ButtonRow>
            <ActionButton
              icon={Pencil}
              text="Edit"
              label="Revise institution"
              disabled={locked}
              onPress={() => setPreview(undefined)}
            />
            <ActionButton
              icon={Check}
              text="Save"
              label="Confirm institution save"
              tone="solid"
              disabled={locked}
              onPress={() => command.mutate(preview, { onSuccess: close })}
            />
          </ButtonRow>
        </>
      ) : (
        <>
          <Choices
            label="Place type"
            values={placeTypes}
            labels={typeLabels}
            value={type}
            onChange={setType}
            disabled={locked}
          />
          {cities?.length ? (
            <Choices
              label="City"
              values={cities.map((city) => city.id)}
              labels={Object.fromEntries(cities.map((city) => [city.id, city.name]))}
              value={cityId}
              onChange={setCityId}
              disabled={locked}
            />
          ) : null}
          <ActionButton
            icon={MapIcon}
            text={pin ? 'Pin set · move on map' : 'Pick on map'}
            label={pin ? 'Move place pin on map' : 'Pick place on map'}
            disabled={locked}
            onPress={() => setMapOpen(true)}
          />
          <Modal visible={mapOpen} animationType="slide" onRequestClose={() => setMapOpen(false)}>
            {mapOpen ? (
              <MapLoader
                pin={pin}
                confirmLabel="Use this spot"
                pick={setPin}
                close={() => setMapOpen(false)}
              />
            ) : null}
          </Modal>
          {(Object.keys(labels) as (keyof typeof labels)[]).map((key) => (
            <AdminField
              key={key}
              label={labels[key]}
              value={fields[key]}
              onChange={(value) => setFields({ ...fields, [key]: value })}
              disabled={locked}
              maxLength={key === 'aliases' ? 2500 : 300}
            />
          ))}
          <ButtonRow>
            <ActionButton
              icon={isActive ? Check : X}
              text="Show in search"
              label={isActive ? 'Shown in search: Yes' : 'Shown in search: No'}
              tone={isActive ? 'solid' : 'outline'}
              disabled={locked}
              onPress={() => setIsActive(!isActive)}
            />
            <ActionButton
              icon={approved ? Check : X}
              text="Public"
              label={approved ? 'Public approval: Yes' : 'Public approval: No'}
              tone={approved ? 'solid' : 'outline'}
              disabled={locked}
              onPress={() => setApproved(!approved)}
            />
          </ButtonRow>
          <AdminField
            label="Reason for this change"
            value={changeReason}
            onChange={setReason}
            maxLength={500}
            disabled={locked}
            multiline
          />
          <ActionButton
            icon={reapprove ? Check : RefreshCw}
            text="Reapprove changes"
            label={reapprove ? 'Explicit reapproval: Yes' : 'Explicit reapproval: No'}
            tone={reapprove ? 'solid' : 'outline'}
            disabled={locked}
            onPress={() => setReapprove(!reapprove)}
          />
          <Fact icon={Info}>Name, alias or location changes need reapproval.</Fact>
          {invalid ? (
            <Copy alert>
              Add a name, city, map pin and a reason of at least 8 characters. Other names must not
              repeat.
            </Copy>
          ) : null}
        </>
      )}
      <ButtonRow>
        <ActionButton
          icon={X}
          text="Close"
          label="Cancel institution edit"
          disabled={locked}
          onPress={close}
        />
        {!preview ? (
          <ActionButton
            icon={ArrowRight}
            text="Review"
            label="Review institution save"
            tone="solid"
            disabled={locked}
            onPress={review}
          />
        ) : null}
      </ButtonRow>
    </AdminCard>
  );
}

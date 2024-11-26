import { NumericTextInput as TextInput } from './grouped-number-input';
import { AppHeader } from './navigation/header';
import { FilterChip, useToolOpen } from './inventory-tools';
import { stayWorkspaceKeys } from '../lib/stay-workspace-keys';
import { useRef, useState } from 'react';
import { View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { randomUUID } from 'expo-crypto';
import type { z } from 'zod';
import { DISPLAY_TIME_ZONE, type branchInventorySchema } from '@hsm/contracts';
import {
  billingFormRupees,
  createManualStay,
  readBillingSettings,
  readBranchOccupancy,
} from '@hsm/api-client';
import { actorClient } from '../lib/runtime';
import { safeMessage } from '../lib/messages';
import {
  defaultRent,
  manualAdmissionCommand,
  manualFirstRent,
} from '../lib/manual-admission-input';
import { Copy } from './ui';
import { mobileColors as colors } from '@hsm/ui';
import { Banknote, BedDouble, CalendarDays, ShieldCheck, User } from 'lucide-react-native';
import { PriceSection } from './price-form-parts';
import { AdmissionDone } from './admission-done';
import { toE164 } from './resident-edit';
import { AdmissionAgreement, attachAdmissionAgreement } from './admission-agreement';
import { MarketplaceAction as Button } from './marketplace/action';
import { DateField } from './date-field';
import { cnicComplete } from './cnic-field';
import { AdmissionCnicPhoto } from './admission-cnic-photo';
import { ManualAdmissionResident, type ExistingResident } from './manual-admission-resident';
type Inventory = z.infer<typeof branchInventorySchema>;
type Props = {
  actorId: string;
  branchId: string;
  inventory: Inventory;
  disabled: boolean;
  initialBedId?: string;
  // The Bed Board sheet already shows an "Add resident" header with Back.
  hideHeader?: boolean;
};
const field =
  'min-h-12 rounded-input border border-border bg-inputSurface px-4 py-3 font-body text-body text-text';
// STAY-001 / RES-001: staff hold all three grants before a walk-in admission is offered.
export function canAdmitResidents(inventory: Inventory) {
  return ['stay_manage', 'rent_manage', 'finance_view'].every((grant) =>
    inventory.permissions.includes(grant as Inventory['permissions'][number]),
  );
}
function Field(props: {
  money?: boolean;
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <TextInput
      keyboardType={props.money ? 'decimal-pad' : 'default'}
      accessibilityLabel={props.label}
      placeholder={props.label}
      placeholderTextColor={colors.secondary}
      value={props.value}
      onChangeText={props.onChange}
      maxLength={120}
      className={field}
    />
  );
}
function todayKarachi() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: DISPLAY_TIME_ZONE }).format(new Date());
}
function openBeds(inventory: Inventory) {
  return inventory.rooms.flatMap((room) =>
    room.status !== 'active' || room.archivedAt !== null
      ? []
      : room.seats
          .filter((seat) => seat.status === 'active' && seat.archivedAt === null)
          .map((seat) => ({ room, seat })),
  );
}
// STAY-001: walk-in admission of a new branch resident into one bed, atomically with its
// agreement and first obligations. The server rejects an occupied or reserved bed (ACC-001).
function initialBedRent(inventory: Inventory, bedId?: string) {
  const entry = openBeds(inventory).find((row) => row.seat.id === bedId);
  const type = inventory.roomTypes.find((row) => row.id === entry?.room.roomTypeId);
  return entry && type
    ? entry.seat.monthlyRentPaisa !== undefined && entry.seat.monthlyRentPaisa !== null
      ? billingFormRupees(entry.seat.monthlyRentPaisa)
      : defaultRent(type, { kind: 'bed', roomId: entry.room.id, bedId: entry.seat.id })
    : '';
}
function initialBedSecurity(inventory: Inventory, bedId?: string) {
  const entry = openBeds(inventory).find((row) => row.seat.id === bedId);
  const type = inventory.roomTypes.find((row) => row.id === entry?.room.roomTypeId);
  return billingFormRupees(entry?.seat.depositPaisa ?? type?.depositPaisa ?? 0);
}
export function NativeManualAdmission({
  actorId,
  branchId,
  inventory,
  disabled,
  initialBedId,
  hideHeader = false,
}: Props) {
  const cache = useQueryClient(),
    keys = useRef(new Map<string, string>()),
    [open, setOpen] = useToolOpen(Boolean(initialBedId)),
    [bedId, setBedId] = useState<string | undefined>(initialBedId),
    [existing, setExisting] = useState<ExistingResident>(),
    [mode, setMode] = useState<'new' | 'existing'>('new'),
    [name, setName] = useState(''),
    [phone, setPhone] = useState(''),
    [email, setEmail] = useState(''),
    [cnic, setCnic] = useState(''),
    [cnicPhoto, setCnicPhoto] = useState<string>(),
    [cnicUploading, setCnicUploading] = useState(false),
    [cnicPending, setCnicPending] = useState(false),
    [moveIn, setMoveIn] = useState(todayKarachi),
    [leave, setLeave] = useState(''),
    [rent, setRent] = useState(() => initialBedRent(inventory, initialBedId)),
    [deposit, setDeposit] = useState(() => initialBedSecurity(inventory, initialBedId)),
    [agreementFile, setAgreementFile] = useState<string>(),
    [uploading, setUploading] = useState(false),
    [agreementSaved, setAgreementSaved] = useState<boolean>(),
    [firstRent, setFirstRent] = useState(() => initialBedRent(inventory, initialBedId));
  // ACC-001: offer only beds the server reports as free, so a full form is never refused for
  // an occupied or reserved bed (the server still re-checks).
  const free = useQuery({
    queryKey: ['bed-board', actorId, branchId, 'available-for-admission'],
    enabled: open && !initialBedId,
    gcTime: 0,
    retry: false,
    queryFn: async () =>
      readBranchOccupancy(await actorClient(actorId), branchId, { state: 'available', limit: 50 }),
  });
  const freeIds = new Set(free.data?.data.flatMap((room) => room.beds.map((bed) => bed.id)));
  const beds = openBeds(inventory).filter((entry) =>
      initialBedId ? entry.seat.id === initialBedId : freeIds.has(entry.seat.id),
    ),
    chosen = beds.find((entry) => entry.seat.id === bedId),
    roomType = inventory.roomTypes.find((type) => type.id === chosen?.room.roomTypeId);
  const billing = useQuery({
    queryKey: ['manual-admission-policy', actorId, branchId, roomType?.id],
    enabled: open && roomType !== undefined,
    gcTime: 0,
    retry: false,
    queryFn: async () =>
      readBillingSettings(await actorClient(actorId), { branchId, roomTypeId: roomType?.id }),
  });
  const submit = useMutation({
    gcTime: 0,
    mutationFn: async (body: ReturnType<typeof manualAdmissionCommand>) => {
      const intent = JSON.stringify(body),
        key = keys.current.get(intent) ?? randomUUID();
      keys.current.set(intent, key);
      return createManualStay(await actorClient(actorId), branchId, body, key);
    },
    onSuccess: async (result) => {
      keys.current.clear();
      if (agreementFile)
        setAgreementSaved(
          await attachAdmissionAgreement(
            actorId,
            { branchId, stayId: result.stayId, agreementId: result.agreementId },
            agreementFile,
            randomUUID(),
          ).then(
            () => true,
            () => false,
          ),
        );
      await Promise.allSettled(
        [
          ['branch-inventory-pages', actorId, branchId],
          ...stayWorkspaceKeys(actorId, branchId),
        ].map((queryKey) => cache.invalidateQueries({ queryKey })),
      );
    },
  });
  if (!open)
    return (
      <Button
        secondary
        label="Admit walk-in resident"
        disabled={disabled}
        onPress={() => setOpen(true)}
      />
    );
  if (submit.data)
    return (
      <AdmissionDone
        actorId={actorId}
        branchId={branchId}
        stayId={submit.data.stayId}
        agreementSaved={agreementSaved}
        close={() => setOpen(false)}
      />
    );
  const version = billing.data?.effectiveVersion;
  let command: ReturnType<typeof manualAdmissionCommand> | undefined;
  let invalid: string | undefined;
  // A new resident needs a complete CNIC before Confirm turns on; the card shows what is missing.
  if (chosen && roomType && version && (mode === 'existing' || cnicComplete(cnic)))
    try {
      command = manualAdmissionCommand(
        {
          resident:
            mode === 'existing'
              ? { kind: 'existing', residentId: existing?.residentId ?? '' }
              : {
                  kind: 'new',
                  profile: {
                    displayName: name,
                    ...(phone.trim() ? { phone: toE164(phone) ?? phone } : {}),
                    ...(email.trim() ? { email } : {}),
                    // CHG-054: a new resident's CNIC is required here.
                    cnic,
                  },
                },
          ...(mode === 'new' && cnicPhoto ? { cnicPhotoFileId: cnicPhoto } : {}),
          roomType,
          target: { kind: 'bed', roomId: chosen.room.id, bedId: chosen.seat.id },
          moveInDate: moveIn,
          expectedLeaveDate: leave,
          rent,
          deposit,
          firstRentAmount: firstRent,
        },
        version,
      );
    } catch {
      invalid = 'Check the name, dates (YYYY-MM-DD) and amounts.';
    }
  return (
    <View className="gap-2" accessibilityLabel="Walk-in admission">
      {hideHeader ? null : (
        <AppHeader
          title="Add resident"
          backLabel="Cancel admission"
          backDisabled={submit.isPending}
          onBack={() => setOpen(false)}
        />
      )}
      {initialBedId ? null : (
        <PriceSection Icon={BedDouble} title="Bed">
          {free.isPending ? <Copy>Loading free beds…</Copy> : null}
          {free.error ? <Copy alert>{safeMessage(free.error)}</Copy> : null}
          {free.isSuccess && beds.length === 0 ? <Copy>No free beds</Copy> : null}
          <View className="flex-row flex-wrap gap-2">
            {beds.map(({ room, seat }) => (
              <FilterChip
                key={seat.id}
                text={room.label + ' · ' + seat.label}
                label={room.label + ' · ' + seat.label}
                selected={seat.id === bedId}
                onPress={() => {
                  if (submit.isPending) return;
                  setBedId(seat.id);
                  const type = inventory.roomTypes.find((entry) => entry.id === room.roomTypeId);
                  if (type) {
                    const price = initialBedRent(inventory, seat.id);
                    setDeposit(initialBedSecurity(inventory, seat.id));
                    setRent(price);
                    setFirstRent(price);
                  }
                }}
              />
            ))}
          </View>
        </PriceSection>
      )}
      <PriceSection Icon={User} title="Resident">
        {initialBedId ? null : (
          <View className="flex-row flex-wrap gap-2">
            {(['new', 'existing'] as const).map((value) => (
              <FilterChip
                key={value}
                text={value === 'new' ? 'New' : 'Existing'}
                label={value === 'new' ? 'New resident' : 'Existing resident'}
                selected={mode === value}
                onPress={() => {
                  if (!submit.isPending) setMode(value);
                }}
              />
            ))}
          </View>
        )}
        {mode === 'existing' ? (
          <ManualAdmissionResident
            actorId={actorId}
            branchId={branchId}
            disabled={disabled || submit.isPending}
            selected={existing}
            onChoose={setExisting}
          />
        ) : (
          <>
            <Field label="Resident name" value={name} onChange={setName} />
            <Field label="Resident phone (optional)" value={phone} onChange={setPhone} />
            <Field label="Resident email (optional)" value={email} onChange={setEmail} />
            <AdmissionCnicPhoto
              actorId={actorId}
              value={cnic}
              onChange={setCnic}
              fileId={cnicPhoto}
              onReady={setCnicPhoto}
              onBusy={setCnicUploading}
              onPending={setCnicPending}
              disabled={disabled || submit.isPending}
            />
          </>
        )}
        {mode === 'existing' && existing ? <Copy>Selected: {existing.displayName}</Copy> : null}
      </PriceSection>
      <PriceSection Icon={CalendarDays} title="Stay">
        <DateField label="Move-in date" value={moveIn} onChange={setMoveIn} />
        <DateField
          label="Expected leave date (optional)"
          value={leave}
          onChange={setLeave}
          optional
        />
      </PriceSection>
      {/* The first rent becomes a due invoice; "Paid" needs an approved payment and receipt. */}
      <PriceSection Icon={Banknote} title="Rent" note="First rent is due from move-in">
        <Field money label="Agreed monthly rent (PKR)" value={rent} onChange={setRent} />
        {version && manualFirstRent(version) ? (
          <Field money label="First rent charge (PKR)" value={firstRent} onChange={setFirstRent} />
        ) : null}
      </PriceSection>
      <PriceSection
        Icon={ShieldCheck}
        title="Security deposit"
        note="One-time · refunded when the resident leaves"
      >
        <Field money label="Security deposit (PKR)" value={deposit} onChange={setDeposit} />
      </PriceSection>
      <AdmissionAgreement
        actorId={actorId}
        fileId={agreementFile}
        disabled={disabled || submit.isPending}
        onBusy={setUploading}
        onReady={setAgreementFile}
      />
      {billing.isError ? <Copy alert>{safeMessage(billing.error)}</Copy> : null}
      {chosen && billing.isSuccess && !version ? (
        <Copy alert>No billing policy applies to this room type. Configure one first.</Copy>
      ) : null}
      {invalid && (mode === 'existing' ? existing : name.trim()) && moveIn ? (
        <Copy alert>{invalid}</Copy>
      ) : null}
      {submit.isError ? <Copy alert>{safeMessage(submit.error)}</Copy> : null}
      <Button
        label={submit.isPending ? 'Admitting…' : 'Confirm admission'}
        disabled={
          disabled ||
          submit.isPending ||
          uploading ||
          (mode === 'new' && (cnicUploading || cnicPending)) ||
          command === undefined
        }
        onPress={() => {
          if (command) submit.mutate(command);
        }}
      />
    </View>
  );
}

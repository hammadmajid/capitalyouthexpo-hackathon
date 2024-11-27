import { NumericTextInput as TextInput } from './grouped-number-input';
import { stayWorkspaceKeys } from '../lib/stay-workspace-keys';
import { useState } from 'react';
import { View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import {
  billingFormPaisa,
  checkoutStay,
  extendStay,
  marketplacePrice,
  readBranchOccupancy,
  readStaySettlement,
  recordStayFundMovement,
  transferStay,
} from '@hsm/api-client';
import { actorClient } from '../lib/runtime';
import { safeMessage } from '../lib/messages';
import { Copy } from './ui';
import { PriceSection } from './price-form-parts';
import { FilterChip, IconChip } from './inventory-tools';
import type { LucideIcon } from 'lucide-react-native';
// Small right-aligned action with an icon; keeps the full accessible name.
function ActionChip(props: {
  Icon: LucideIcon;
  text: string;
  label: string;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <View style={{ alignSelf: 'flex-end' }}>
      <IconChip
        Icon={props.Icon}
        text={props.text}
        label={props.label}
        disabled={props.disabled ?? false}
        onPress={props.onPress}
      />
    </View>
  );
}
import {
  ArrowLeftRight,
  BedDouble,
  Check,
  MinusCircle,
  CalendarClock,
  LogOut,
  PenLine,
  ShieldCheck,
  Wallet,
} from 'lucide-react-native';
import { mobileColors as colors } from '@hsm/ui';
import { MarketplaceAction as Button } from './marketplace/action';
import { NativeSettlement } from './stay-settlement';
import { useNativeCommand } from './services/use-command';
import { DateField } from './date-field';
import { NativeCommandRecovery } from './services/command-recovery';
export { NativeSettlement };
const field =
  'min-h-12 rounded-input border border-border bg-inputSurface px-4 py-3 font-body text-body text-text';
function toPaisa(value: string) {
  try {
    return value ? billingFormPaisa(value) : undefined;
  } catch {
    return undefined;
  }
}
// The server's own result, stated plainly.
function outcome(result: unknown) {
  const value = (result ?? {}) as {
    agreement?: {
      previousRentPaisa: number;
      rentAmountPaisa: number;
      effectiveFrom: string;
    } | null;
    billing?: { result: string }[];
    depositApplied?: { amountPaisa: number }[];
  };
  if (value.agreement)
    return `Transferred. Rent changes from ${marketplacePrice(value.agreement.previousRentPaisa)} to ${marketplacePrice(value.agreement.rentAmountPaisa)} from ${value.agreement.effectiveFrom}.`;
  if (value.billing?.some((row) => row.result.startsWith('manual')))
    return 'Departure changed. A billing amount needs manual review.';
  if (value.billing?.length) return 'Departure changed and billing continues to the new date.';
  const applied = value.depositApplied?.reduce((sum, row) => sum + row.amountPaisa, 0) ?? 0;
  if (applied > 0) return `Checked out. ${marketplacePrice(applied)} of deposit applied to rent.`;
  return 'Saved by the server.';
}
type Command = { kind: 'transfer' | 'extend' | 'checkout' | 'fund'; body: Record<string, unknown> };
// RES-005 / OUT-003..006: staff actions; the server re-checks each grant and the version.
export function NativeStayLifecycle(props: {
  actorId: string;
  branchId: string;
  stayId: string;
  version: number;
  closed: boolean;
  canStay: boolean;
  canTransfer?: boolean;
  // The server's extension rule needs stay_manage + rent_manage.
  canExtend?: boolean;
  canSettle: boolean;
  canViewFinance?: boolean;
  canReprice?: boolean;
  canApplyDeposit?: boolean;
}) {
  const { actorId, branchId, stayId, version } = props;
  const canReadFinance = props.canViewFinance ?? props.canSettle;
  const [reason, setReason] = useState(''),
    [leave, setLeave] = useState(''),
    [amount, setAmount] = useState(''),
    [source, setSource] = useState(''),
    [rent, setRent] = useState(''),
    [agreed, setAgreed] = useState(false),
    [applyDeposit, setApplyDeposit] = useState(false),
    // A bed move and checkout ask once before running (checkout cannot be undone).
    [pending, setPending] = useState<{ question: string; command: Command }>();
  const free = useQuery({
    queryKey: ['bed-board', actorId, branchId, 'available-for-transfer'],
    enabled: props.canStay && props.canTransfer !== false && !props.closed,
    gcTime: 0,
    queryFn: async () =>
      readBranchOccupancy(await actorClient(actorId), branchId, { state: 'available', limit: 50 }),
  });
  const sources = useQuery({
    queryKey: ['stay-settlement', actorId, branchId, stayId, 'sources'],
    enabled: props.canSettle && !props.closed,
    gcTime: 0,
    queryFn: async () => readStaySettlement(await actorClient(actorId), stayId, branchId),
  });
  // SEC-003: the retained retry belongs to this one Stay, so "Retry" on another resident can
  // never resend this Stay's checkout/transfer, and one stuck command does not block the branch.
  const run = useNativeCommand(
    'NativeStayLifecycle:run:' + stayId,
    actorId,
    async (client, command: Command, key: string): Promise<unknown> => {
      if (command.kind === 'transfer')
        return transferStay(client, branchId, stayId, command.body, key);
      if (command.kind === 'extend') return extendStay(client, branchId, stayId, command.body, key);
      if (command.kind === 'fund')
        return recordStayFundMovement(client, branchId, stayId, command.body, key);
      return checkoutStay(client, branchId, stayId, command.body, key);
    },
    stayWorkspaceKeys(actorId, branchId),
  );
  if (props.closed)
    return (
      <View>
        <NativeCommandRecovery command={run} />
        {run.isError ? <Copy alert>{safeMessage(run.error)}</Copy> : null}
        {canReadFinance ? (
          <NativeSettlement actorId={actorId} branchId={branchId} stayId={stayId} closed />
        ) : null}
      </View>
    );
  const paisa = toPaisa(amount),
    rentPaisa = toPaisa(rent);
  // P9-FIX-01: a new rent is sent only with the resident's recorded agreement.
  const repricing =
    !props.canReprice || !rent
      ? undefined
      : rentPaisa !== undefined && agreed
        ? { rentAmountPaisa: rentPaisa, residentAgreed: true }
        : null;
  const ready = reason.trim().length > 0 && !run.isPending;
  return (
    <View className="gap-3" accessibilityLabel="Stay lifecycle">
      {canReadFinance ? (
        <PriceSection Icon={Wallet} title="Money">
          <NativeSettlement actorId={actorId} branchId={branchId} stayId={stayId} closed={false} />
        </PriceSection>
      ) : null}
      <NativeCommandRecovery command={run} />
      {run.isError ? <Copy alert>{safeMessage(run.error)}</Copy> : null}
      {run.isSuccess ? <Copy>{outcome(run.data)}</Copy> : null}
      <PriceSection Icon={PenLine} title="Reason" note="Required for any action">
        <TextInput
          accessibilityLabel="Lifecycle reason"
          placeholder="Why?"
          value={reason}
          onChangeText={setReason}
          maxLength={500}
          className={field}
          placeholderTextColor={colors.secondary}
        />
      </PriceSection>
      {props.canStay && props.canTransfer !== false ? (
        <PriceSection Icon={ArrowLeftRight} title="Move bed">
          <View className="flex-row flex-wrap gap-2">
            {free.data?.data.flatMap((room) =>
              room.beds.map((bed) => (
                <IconChip
                  key={bed.id}
                  Icon={BedDouble}
                  text={bed.label}
                  disabled={!ready || repricing === null}
                  label={'Transfer to room ' + room.label + ' bed ' + bed.label}
                  onPress={() =>
                    setPending({
                      question: 'Move to room ' + room.label + ', bed ' + bed.label + '?',
                      command: {
                        kind: 'transfer',
                        body: {
                          expectedVersion: version,
                          target: { kind: 'bed', roomId: room.id, bedId: bed.id },
                          reason: reason.trim(),
                          ...(repricing ? { repricing } : {}),
                        },
                      },
                    })
                  }
                />
              )),
            )}
          </View>
          {pending?.command.kind === 'transfer' ? (
            <Confirm pending={pending} run={run.mutate} cancel={() => setPending(undefined)} />
          ) : null}
          {free.data && !free.data.data.some((room) => room.beds.length) ? (
            <Copy>No free bed</Copy>
          ) : null}
          {props.canReprice ? (
            <>
              <TextInput
                accessibilityLabel="New monthly rent with transfer (PKR, optional)"
                placeholder="New rent Rs (optional)"
                value={rent}
                onChangeText={setRent}
                keyboardType="decimal-pad"
                className={field}
                placeholderTextColor={colors.secondary}
              />
              {/* P9-FIX-01: a new rent needs the resident's recorded agreement. */}
              <View style={{ alignSelf: 'flex-start' }}>
                <FilterChip
                  text={agreed ? '✓ Resident agreed' : 'Resident agreed?'}
                  label={
                    agreed
                      ? 'Resident agreed to the new rent (yes)'
                      : 'Resident agreed to the new rent'
                  }
                  selected={agreed}
                  onPress={() => setAgreed(!agreed)}
                />
              </View>
            </>
          ) : null}
        </PriceSection>
      ) : null}
      {props.canExtend ? (
        <PriceSection Icon={CalendarClock} title="Leaving date">
          <DateField label="New expected departure" value={leave} onChange={setLeave} />
          <ActionChip
            Icon={Check}
            text="Update"
            label="Change departure date"
            disabled={!ready || !leave}
            onPress={() =>
              run.mutate({
                kind: 'extend',
                body: { expectedVersion: version, expectedLeaveDate: leave, reason: reason.trim() },
              })
            }
          />
        </PriceSection>
      ) : null}
      {props.canSettle ? (
        <>
          <PriceSection Icon={ShieldCheck} title="Deposit">
            {sources.data?.fundSources.map((row) => (
              <Button
                key={row.paymentId}
                secondary={source !== row.paymentId}
                label={
                  'Use receipt ' +
                  row.receiptNumber +
                  ' (deposit ' +
                  marketplacePrice(row.depositPaisa) +
                  ')'
                }
                onPress={() => setSource(row.paymentId)}
              />
            ))}
            <TextInput
              accessibilityLabel="Deduction amount (PKR)"
              placeholder="Deduct Rs"
              value={amount}
              onChangeText={setAmount}
              keyboardType="decimal-pad"
              className={field}
              placeholderTextColor={colors.secondary}
            />
            <ActionChip
              Icon={MinusCircle}
              text="Deduct"
              label="Deduct from deposit"
              disabled={!ready || !source || !paisa}
              onPress={() =>
                run.mutate({
                  kind: 'fund',
                  body: {
                    paymentId: source,
                    movement: { kind: 'deposit_deduct', amountPaisa: paisa, reason: reason.trim() },
                  },
                })
              }
            />
            {props.canApplyDeposit ? (
              <View style={{ alignSelf: 'flex-start' }}>
                <FilterChip
                  text={applyDeposit ? '✓ Use for unpaid rent' : 'Use for unpaid rent'}
                  label={
                    applyDeposit
                      ? 'Apply held deposit to unpaid rent (yes)'
                      : 'Apply held deposit to unpaid rent'
                  }
                  selected={applyDeposit}
                  onPress={() => setApplyDeposit(!applyDeposit)}
                />
              </View>
            ) : null}
          </PriceSection>
          <PriceSection Icon={LogOut} title="Checkout" note="Frees the bed">
            <Button
              label="Complete checkout"
              disabled={!ready}
              onPress={() =>
                setPending({
                  question: 'Check out this resident? This cannot be undone.',
                  command: {
                    kind: 'checkout',
                    body: {
                      expectedVersion: version,
                      reason: reason.trim(),
                      applyAvailableDeposit: Boolean(props.canApplyDeposit) && applyDeposit,
                    },
                  },
                })
              }
            />
            {pending?.command.kind === 'checkout' ? (
              <Confirm pending={pending} run={run.mutate} cancel={() => setPending(undefined)} />
            ) : null}
          </PriceSection>
        </>
      ) : null}
    </View>
  );
}

function Confirm({
  pending,
  run,
  cancel,
}: {
  pending: { question: string; command: Command };
  run: (command: Command) => void;
  cancel: () => void;
}) {
  return (
    <View className="gap-2">
      <Copy>{pending.question}</Copy>
      <View className="flex-row gap-2">
        <View className="flex-1">
          <Button
            label="Yes"
            onPress={() => {
              cancel();
              run(pending.command);
            }}
          />
        </View>
        <View className="flex-1">
          <Button secondary label="Cancel" onPress={cancel} />
        </View>
      </View>
    </View>
  );
}

import { AppHeader } from './navigation/header';
import { Clock } from 'lucide-react-native';
import { IconChip } from './inventory-tools';
import { mobileSurfaces } from '@hsm/ui';
import { useRef, useState } from 'react';
import { View } from 'react-native';
import * as Crypto from 'expo-crypto';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ApiFailure,
  marketplacePrice,
  readInventoryPrices,
  scheduleInventoryPrice,
  RetainedInventoryPrice,
} from '@hsm/api-client';
import type { RoomPriceInput, RoomTypeInput } from '@hsm/contracts';
import { actorClient } from '../lib/runtime';
import { safeMessage } from '../lib/messages';
import { Button, Copy } from './ui';
import { InventoryPriceForm } from './inventory-price-form';
import { useNativeInventoryNavigationLock } from './native-inventory-navigation';
type Props = {
  actorId: string;
  branchId: string;
  type: RoomTypeInput & { id: string };
  canEdit: boolean;
  unavailable: boolean;
  blocked: boolean;
  // Launcher text; the bed screen calls it "Set rent".
  launchText?: string;
  initialOpen?: boolean;
  onClose?: () => void;
};
export function NativeInventoryPricing(props: Props) {
  return <Panel key={props.actorId + ':' + props.branchId + ':' + props.type.id} {...props} />;
}
function Panel({
  actorId,
  branchId,
  type,
  canEdit,
  unavailable,
  blocked,
  launchText = 'Prices',
  initialOpen = false,
  onClose,
}: Props) {
  const [open, setOpen] = useState(initialOpen),
    [editing, setEditing] = useState(false),
    [cursor, setCursor] = useState<string>();
  const cache = useQueryClient(),
    queryKey = ['inventory-prices', actorId, branchId, type.id],
    retained = useRef<RetainedInventoryPrice | null>(null);
  retained.current ??= new RetainedInventoryPrice(async (input, key) =>
    scheduleInventoryPrice(await actorClient(actorId), branchId, type.id, input, key),
  );
  const intent = retained.current;
  const history = useQuery({
    queryKey: [...queryKey, cursor],
    enabled: open && !unavailable,
    retry: false,
    queryFn: async () =>
      readInventoryPrices(await actorClient(actorId), branchId, type.id, {
        ...(cursor ? { cursor } : {}),
      }),
  });
  const mutation = useMutation({
    retry: false,
    gcTime: 0,
    mutationFn: (input: RoomPriceInput | undefined) =>
      input ? intent.send(input, Crypto.randomUUID()) : intent.retry(),
    onSuccess: async () => {
      intent.reset();
      setEditing(false);
      setCursor(undefined);
      await cache.invalidateQueries({ queryKey });
      await cache.invalidateQueries({ queryKey: ['branch-inventory-pages', actorId, branchId] });
      await cache.invalidateQueries({ queryKey: ['marketplace'] });
    },
  });
  const locked = intent.locked || mutation.isPending;
  useNativeInventoryNavigationLock(open || locked);
  const denied =
    mutation.error instanceof ApiFailure && [401, 403, 404].includes(mutation.error.problem.status);
  const sourceUnavailable = unavailable || history.isError || history.isFetching || !history.data;
  const missing = sourceUnavailable || denied;
  if (!open)
    return (
      <IconChip
        Icon={Clock}
        text={launchText}
        disabled={blocked || unavailable}
        label={'Dated prices and history for ' + type.name}
        onPress={() => setOpen(true)}
      />
    );
  return (
    <View
      style={mobileSurfaces.icyCard}
      className="gap-3 rounded-input border border-border p-3 frosted-card"
    >
      <AppHeader
        title={launchText === 'Prices' ? 'Prices · ' + type.name : 'Rent'}
        backLabel="Close price history"
        backDisabled={locked}
        onBack={() => {
          setOpen(false);
          setEditing(false);
          mutation.reset();
          onClose?.();
        }}
      />
      {/* BKG-004: new prices apply from their date; existing bookings and bills keep theirs. */}
      {missing ? (
        <Copy>Price history unavailable.</Copy>
      ) : (
        <>
          {!history.data.data.length ? <Copy>No price changes yet</Copy> : null}
          {history.data.data.map((price) => (
            <View key={price.id} className="gap-1">
              <Copy>Effective {price.effectiveFrom}</Copy>
              <Copy>
                {[
                  price.bedMonthlyRentPaisa === null
                    ? null
                    : marketplacePrice(price.bedMonthlyRentPaisa) + '/bed',
                  price.roomMonthlyRentPaisa === null
                    ? null
                    : marketplacePrice(price.roomMonthlyRentPaisa) + '/room',
                  'Deposit ' + marketplacePrice(price.depositPaisa),
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </Copy>
              {price.fees.map((fee) => (
                <Copy key={fee.code + fee.cadence}>
                  {fee.code}: {marketplacePrice(fee.amountPaisa)} ({fee.cadence})
                </Copy>
              ))}
            </View>
          ))}
        </>
      )}
      {cursor ? (
        <Button
          secondary
          label="First price page"
          disabled={locked}
          onPress={() => setCursor(undefined)}
        />
      ) : null}
      {!missing && history.data?.nextCursor ? (
        <Button
          secondary
          label="Older price versions"
          disabled={locked}
          onPress={() => setCursor(history.data?.nextCursor ?? undefined)}
        />
      ) : null}
      {mutation.isError ? <Copy alert>{safeMessage(mutation.error)}</Copy> : null}
      {mutation.isSuccess ? <Copy>Rent saved.</Copy> : null}
      {canEdit && !editing ? (
        <Button
          label="Change rent"
          disabled={missing || locked}
          onPress={() => {
            mutation.reset();
            setEditing(true);
          }}
        />
      ) : null}
      {editing ? (
        <InventoryPriceForm
          type={type}
          locked={locked}
          disabled={missing || !canEdit}
          onSave={(input) => mutation.mutate(input)}
          onCancel={() => {
            if (!locked) setEditing(false);
          }}
        />
      ) : null}
      {locked && !mutation.isPending ? (
        <Button
          label="Retry original price publication"
          disabled={sourceUnavailable || !canEdit}
          onPress={() => mutation.mutate(undefined)}
        />
      ) : null}
    </View>
  );
}

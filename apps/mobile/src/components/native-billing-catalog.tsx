import { AppHeader } from './navigation/header';
import { Skeleton } from './loading/skeleton';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { marketplacePrice } from '@hsm/api-client';
import {
  billingCatalogInputSchema,
  billingCatalogArchiveSchema,
  type BillingCatalogEntry,
} from '@hsm/contracts';
import { billingPaisa } from '../lib/billing-money';
import { safeMessage } from '../lib/messages';
import { Button, Copy } from './ui';
import {
  NativeCatalogCreateForm,
  NativeCatalogArchiveForm,
  emptyNativeCatalogDraft,
} from './native-billing-catalog-forms';
import { useNativeBillingCatalog } from './use-native-billing-catalog';
// standalone: on its own screen (Manager tool) it starts open; the screen's Back closes it.
type Props = {
  actorId: string;
  branchId: string;
  accessUnavailable?: boolean;
  standalone?: boolean;
};
export function NativeBillingCatalog(props: Props) {
  return <Catalog key={props.actorId + ':' + props.branchId} {...props} />;
}
function Catalog({ actorId, branchId, accessUnavailable = false, standalone = false }: Props) {
  const [open, setOpen] = useState(standalone),
    [cursor, setCursor] = useState<string>(),
    [history, setHistory] = useState(false),
    [draft, setDraft] = useState({ ...emptyNativeCatalogDraft }),
    [target, setTarget] = useState<BillingCatalogEntry>(),
    [reason, setReason] = useState(''),
    [validation, setValidation] = useState(''),
    [notice, setNotice] = useState('');
  const { query, mutation } = useNativeBillingCatalog(
    actorId,
    branchId,
    open,
    accessUnavailable,
    cursor,
    history,
    (action) => {
      setValidation('');
      setNotice(
        action.kind === 'create' ? 'Approved charge created.' : 'Approved charge archived.',
      );
      setDraft({ ...emptyNativeCatalogDraft });
      setTarget(undefined);
      setReason('');
    },
  );
  const busy = mutation.isPending || query.isFetching,
    // A failed load hides the data until a pull; a failed save keeps the form beside its message.
    error = query.error;
  const current =
    !accessUnavailable && !query.isPending && !query.isFetching && !error ? query.data : undefined;
  function create() {
    if (!current?.canEdit || busy) return;
    setNotice('');
    setValidation('');
    try {
      const input = billingCatalogInputSchema.parse({
        code: draft.code,
        name: draft.name,
        unitLabel: draft.unitLabel,
        unitAmountPaisa: billingPaisa(draft.price),
      });
      mutation.mutate({ kind: 'create', input });
    } catch {
      setValidation('Enter a valid charge code, name, unit and positive exact PKR price.');
    }
  }
  function archive() {
    if (
      !current?.canEdit ||
      busy ||
      !target ||
      !current.data.some((row) => row.id === target.id && row.archivedAt === null)
    )
      return;
    setValidation('');
    setNotice('');
    const input = billingCatalogArchiveSchema.safeParse({ reason });
    if (!input.success) {
      setValidation('Enter a reason before archiving this charge.');
      return;
    }
    mutation.mutate({ kind: 'archive', id: target.id, reason: input.data.reason });
  }
  function close() {
    if (mutation.isPending) return;
    setOpen(false);
    setCursor(undefined);
    setHistory(false);
    setDraft({ ...emptyNativeCatalogDraft });
    setTarget(undefined);
    setReason('');
    setValidation('');
    setNotice('');
    mutation.reset();
  }
  if (!open)
    return (
      <Button
        secondary
        label="Approved charges"
        disabled={accessUnavailable}
        onPress={() => setOpen(true)}
      />
    );
  return (
    <View className="gap-4">
      {standalone ? null : (
        <>
          <AppHeader
            title="approved charges"
            backLabel="Close approved charges"
            onBack={close}
            backDisabled={mutation.isPending}
          />
          <Text accessibilityRole="header" className="font-heading text-body text-text">
            Approved charges
          </Text>
        </>
      )}

      {notice ? <Copy>{notice}</Copy> : null}
      {mutation.error && !error ? <Copy alert>{safeMessage(mutation.error)}</Copy> : null}
      {accessUnavailable ? (
        <Copy alert>Pull down to load branch access before viewing approved charges.</Copy>
      ) : error ? (
        <View className="gap-3">
          <Copy alert>{safeMessage(error)}</Copy>
        </View>
      ) : !current ? (
        <Skeleton kind="list" label="Loading approved charges…" />
      ) : (
        <>
          {!current.canEdit ? <Copy>View only · the Owner edits charges</Copy> : null}
          {!current.data.length ? <Copy>No approved charges on this page.</Copy> : null}
          {current.data.map((row) => (
            <View key={row.id} className="gap-2 rounded-input border border-border p-4">
              <Copy>{row.name}</Copy>
              <Copy>
                {marketplacePrice(row.unitAmountPaisa)} per {row.unitLabel}
              </Copy>
              <Copy>
                {row.archivedAt
                  ? 'Archived; retained for existing agreements.'
                  : 'Active approved charge'}
              </Copy>
              {current.canEdit && row.archivedAt === null ? (
                <Button
                  secondary
                  label={'Archive ' + row.name}
                  disabled={busy || Boolean(target)}
                  onPress={() => {
                    setTarget(row);
                    setReason('');
                    setValidation('');
                    setNotice('');
                  }}
                />
              ) : null}
            </View>
          ))}
          {validation ? <Copy alert>{validation}</Copy> : null}
          {current.canEdit && !target ? (
            <NativeCatalogCreateForm
              draft={draft}
              change={setDraft}
              disabled={busy}
              save={create}
            />
          ) : null}
          {current.canEdit && target ? (
            current.data.some((row) => row.id === target.id && row.archivedAt === null) ? (
              <NativeCatalogArchiveForm
                name={target.name}
                reason={reason}
                change={setReason}
                disabled={busy}
                save={archive}
                cancel={() => {
                  setTarget(undefined);
                  setReason('');
                  setValidation('');
                }}
              />
            ) : (
              <View className="gap-3">
                <Copy alert>The selected charge is no longer active on this page.</Copy>
                <Button
                  secondary
                  label="Cancel charge archive"
                  onPress={() => {
                    setTarget(undefined);
                    setReason('');
                    setValidation('');
                  }}
                />
              </View>
            )
          ) : null}
          <Button
            secondary
            label={history ? 'Hide archived charges' : 'Include archived charges'}
            disabled={busy || Boolean(target)}
            onPress={() => {
              setHistory(!history);
              setCursor(undefined);
              setNotice('');
            }}
          />
          {cursor ? (
            <Button
              secondary
              label="First approved charges page"
              disabled={busy || Boolean(target)}
              onPress={() => setCursor(undefined)}
            />
          ) : null}
          {current.nextCursor ? (
            <Button
              secondary
              label="Next approved charges page"
              disabled={busy || Boolean(target)}
              onPress={() => setCursor(current.nextCursor ?? undefined)}
            />
          ) : null}
        </>
      )}
    </View>
  );
}

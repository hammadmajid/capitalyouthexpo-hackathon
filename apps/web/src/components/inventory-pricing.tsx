'use client';
import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ApiFailure,
  marketplacePrice,
  readInventoryPrices,
  scheduleInventoryPrice,
  RetainedInventoryPrice,
} from '@hsm/api-client';
import { roomPriceInputSchema, type RoomTypeInput, type RoomPriceInput } from '@hsm/contracts';
import { browserClient } from '../lib/client';
import { errorMessage } from '../lib/messages';
import { Button } from './ui/button';
import { RoomTypeEditor } from './room-type-editor';
import { useInventoryNavigationLock } from './inventory-navigation';
type Props = {
  actorId: string;
  branchId: string;
  type: RoomTypeInput & { id: string };
  canEdit: boolean;
  unavailable: boolean;
  blocked: boolean;
};
export function InventoryPricing(props: Props) {
  return <Panel key={props.actorId + ':' + props.branchId + ':' + props.type.id} {...props} />;
}
function Panel({ actorId, branchId, type, canEdit, unavailable, blocked }: Props) {
  const [open, setOpen] = useState(false),
    [editing, setEditing] = useState(false),
    [date, setDate] = useState(''),
    [cursor, setCursor] = useState<string>(),
    [invalid, setInvalid] = useState(false);
  const cache = useQueryClient(),
    queryKey = ['inventory-prices', actorId, branchId, type.id],
    retained = useRef<RetainedInventoryPrice | null>(null);
  retained.current ??= new RetainedInventoryPrice((input, key) =>
    scheduleInventoryPrice(browserClient(), branchId, type.id, input, key),
  );
  const intent = retained.current;
  const history = useQuery({
    queryKey: [...queryKey, cursor],
    enabled: open && !unavailable,
    retry: false,
    queryFn: () =>
      readInventoryPrices(browserClient(), branchId, type.id, { ...(cursor ? { cursor } : {}) }),
  });
  const mutation = useMutation({
    retry: false,
    gcTime: 0,
    mutationFn: (input: RoomPriceInput | undefined) =>
      input ? intent.send(input, crypto.randomUUID()) : intent.retry(),
    onSuccess: async () => {
      intent.reset();
      setEditing(false);
      setDate('');
      setCursor(undefined);
      await cache.invalidateQueries({ queryKey });
      await cache.invalidateQueries({ queryKey: ['branch-inventory-pages', actorId, branchId] });
      await cache.invalidateQueries({ queryKey: ['marketplace'] });
    },
  });
  const locked = intent.locked || mutation.isPending;
  useInventoryNavigationLock(open || locked);
  const denied =
    mutation.error instanceof ApiFailure && [401, 403, 404].includes(mutation.error.problem.status);
  const sourceUnavailable = unavailable || history.isError || history.isFetching || !history.data;
  const missing = sourceUnavailable || denied;
  function publish(input: RoomTypeInput) {
    const parsed = roomPriceInputSchema.safeParse({
      effectiveFrom: date,
      bedMonthlyRentPaisa: input.bedMonthlyRentPaisa,
      roomMonthlyRentPaisa: input.roomMonthlyRentPaisa,
      depositPaisa: input.depositPaisa,
      fees: input.fees,
    });
    setInvalid(!parsed.success);
    if (parsed.success && !missing && !locked) mutation.mutate(parsed.data);
  }
  if (!open)
    return (
      <Button variant="secondary" disabled={blocked || unavailable} onClick={() => setOpen(true)}>
        Dated prices and history for {type.name}
      </Button>
    );
  return (
    <section
      className="space-y-3 rounded-input border border-hsm-border p-3"
      aria-label={'Dated prices for ' + type.name}
    >
      <h4 className="font-semibold">Dated prices: {type.name}</h4>
      <p>
        Dates use Pakistan time. The latest effective version applies to new quotes. Existing
        booking prices and issued invoices stay unchanged. One retained version per effective date.
      </p>
      {missing ? (
        <p role="status">Price history unavailable.</p>
      ) : (
        <>
          {!history.data.data.length ? (
            <p>
              No dated versions on this page. Existing configured prices apply until a dated version
              takes effect.
            </p>
          ) : null}
          {history.data.data.map((price) => (
            <article key={price.id} className="space-y-1">
              <p>Effective {price.effectiveFrom}</p>
              <p>
                {price.bedMonthlyRentPaisa === null
                  ? ''
                  : 'Bed ' + marketplacePrice(price.bedMonthlyRentPaisa) + '. '}
                {price.roomMonthlyRentPaisa === null
                  ? ''
                  : 'Room ' + marketplacePrice(price.roomMonthlyRentPaisa) + '. '}
                Deposit {marketplacePrice(price.depositPaisa)}.
              </p>
              {price.fees.map((fee) => (
                <p key={fee.code + fee.cadence}>
                  {fee.code}: {marketplacePrice(fee.amountPaisa)} ({fee.cadence})
                </p>
              ))}
            </article>
          ))}
        </>
      )}
      <Button
        variant="secondary"
        disabled={mutation.isPending || unavailable}
        onClick={() => void history.refetch()}
      >
        Refresh price history
      </Button>
      {cursor ? (
        <Button variant="secondary" disabled={locked} onClick={() => setCursor(undefined)}>
          First price page
        </Button>
      ) : null}
      {!missing && history.data?.nextCursor ? (
        <Button
          variant="secondary"
          disabled={locked}
          onClick={() => setCursor(history.data?.nextCursor ?? undefined)}
        >
          Older price versions
        </Button>
      ) : null}
      {mutation.isError ? <p role="alert">{errorMessage(mutation.error)}</p> : null}
      {mutation.isSuccess ? <p role="status">Dated price version published.</p> : null}
      {canEdit && !editing ? (
        <Button
          disabled={missing || locked}
          onClick={() => {
            mutation.reset();
            setEditing(true);
          }}
        >
          Publish dated price
        </Button>
      ) : null}
      {editing ? (
        <>
          <label className="field-label">
            Effective date
            <input
              className="field-input"
              type="date"
              value={date}
              disabled={locked}
              onChange={(event) => setDate(event.target.value)}
            />
          </label>
          {invalid ? <p role="alert">Enter a valid effective date.</p> : null}
          <RoomTypeEditor
            initial={type}
            priceOnly
            pending={locked}
            unavailable={missing || !canEdit}
            onSave={publish}
            onCancel={() => {
              if (!locked) setEditing(false);
            }}
          />
        </>
      ) : null}
      {locked && !mutation.isPending ? (
        <Button disabled={sourceUnavailable || !canEdit} onClick={() => mutation.mutate(undefined)}>
          Retry original price publication
        </Button>
      ) : null}
      <Button
        variant="secondary"
        disabled={locked}
        onClick={() => {
          setOpen(false);
          setEditing(false);
          mutation.reset();
        }}
      >
        Close price history
      </Button>
    </section>
  );
}

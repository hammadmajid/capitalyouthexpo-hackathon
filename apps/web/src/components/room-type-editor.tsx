'use client';
import { useState, type FormEvent } from 'react';
import { roomTypeInputSchema, type RoomTypeInput } from '@hsm/contracts';
import { inventoryPaisa, inventoryRupees } from '../lib/inventory-money';
import { Button } from './ui/button';
import { GroupedNumberInput } from './ui/grouped-number-input';
type Fee = { code: string; cadence: string; amount: string };
export function RoomTypeEditor({
  initial,
  pending,
  unavailable = false,
  priceOnly = false,
  configurationOnly = false,
  onSave,
  onCancel,
}: {
  initial?: RoomTypeInput;
  pending: boolean;
  unavailable?: boolean;
  priceOnly?: boolean;
  configurationOnly?: boolean;
  onSave: (input: RoomTypeInput) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [mode, setMode] = useState<string>(initial?.inventoryMode ?? '');
  const [capacity, setCapacity] = useState(initial ? String(initial.capacity) : '');
  const [bed, setBed] = useState(
    initial?.bedMonthlyRentPaisa == null ? '' : inventoryRupees(initial.bedMonthlyRentPaisa),
  );
  const [room, setRoom] = useState(
    initial?.roomMonthlyRentPaisa == null ? '' : inventoryRupees(initial.roomMonthlyRentPaisa),
  );
  const [deposit, setDeposit] = useState(initial ? inventoryRupees(initial.depositPaisa) : '');
  const [fees, setFees] = useState<Fee[]>(
    initial?.fees.map((fee) => ({
      code: fee.code,
      cadence: fee.cadence,
      amount: inventoryRupees(fee.amountPaisa),
    })) ?? [],
  );
  const [invalid, setInvalid] = useState(false);
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || unavailable) return;
    try {
      if (!/^[1-9][0-9]*$/.test(capacity)) throw new Error('Invalid capacity');
      const input = roomTypeInputSchema.parse({
        name,
        inventoryMode: mode,
        capacity: Number(capacity),
        bedMonthlyRentPaisa: mode === 'whole_room' ? null : inventoryPaisa(bed),
        roomMonthlyRentPaisa: mode === 'per_bed' ? null : inventoryPaisa(room),
        depositPaisa: inventoryPaisa(deposit),
        fees: fees.map((fee) => ({
          code: fee.code,
          cadence: fee.cadence,
          amountPaisa: inventoryPaisa(fee.amount),
        })),
      });
      setInvalid(false);
      onSave(input);
    } catch {
      setInvalid(true);
    }
  }
  function feeChange(index: number, patch: Partial<Fee>) {
    setFees((current) =>
      current.map((fee, position) => (position === index ? { ...fee, ...patch } : fee)),
    );
  }
  return (
    <form className="space-y-4" onSubmit={submit}>
      <fieldset disabled={pending} className="space-y-4">
        <legend className="font-semibold">
          {priceOnly
            ? 'Publish dated prices'
            : initial
              ? 'Edit room type configuration'
              : 'Create room type'}
        </legend>
        <label className="field-label">
          Room type name
          <input
            className="field-input"
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={120}
            disabled={priceOnly}
            required
          />
        </label>
        <label className="field-label">
          Booking inventory
          <select
            className="field-input"
            value={mode}
            disabled={priceOnly || configurationOnly}
            onChange={(event) => setMode(event.target.value)}
            required
          >
            <option value="">Choose inventory</option>
            <option value="per_bed">Individual beds</option>
            <option value="whole_room">Whole room</option>
            <option value="both">Beds or whole room</option>
          </select>
        </label>
        <label className="field-label">
          Room capacity
          <input
            className="field-input"
            inputMode="numeric"
            maxLength={10}
            value={capacity}
            disabled={priceOnly}
            onChange={(event) => setCapacity(event.target.value)}
            required
          />
        </label>
        <fieldset disabled={configurationOnly} className="space-y-4">
          <legend>Rent, deposit and disclosed fees</legend>
          {mode && mode !== 'whole_room' ? (
            <label className="field-label">
              Monthly bed rent (Rs)
              <GroupedNumberInput
                className="field-input"
                maxLength={17}
                value={bed}
                onValueChange={(value) => setBed(value)}
                required
              />
            </label>
          ) : null}
          {mode && mode !== 'per_bed' ? (
            <label className="field-label">
              Monthly room rent (Rs)
              <GroupedNumberInput
                className="field-input"
                maxLength={17}
                value={room}
                onValueChange={(value) => setRoom(value)}
                required
              />
            </label>
          ) : null}
          <label className="field-label">
            Security deposit (Rs)
            <GroupedNumberInput
              className="field-input"
              maxLength={17}
              value={deposit}
              onValueChange={(value) => setDeposit(value)}
              required
            />
          </label>
          <p>
            Enter 0 when no deposit is required. Existing bookings keep their agreed prices and
            terms.
          </p>
          {fees.map((fee, index) => (
            <div key={index} className="space-y-2 rounded-input border border-hsm-border p-3">
              <label className="field-label">
                Fee {index + 1} code
                <select
                  className="field-input"
                  value={fee.code}
                  onChange={(event) => feeChange(index, { code: event.target.value })}
                  required
                >
                  <option value="">Choose fee</option>
                  <option value="mess">Mess</option>
                  <option value="utilities">Utilities</option>
                  <option value="admission">Admission</option>
                </select>
              </label>
              <label className="field-label">
                Fee {index + 1} frequency
                <select
                  className="field-input"
                  value={fee.cadence}
                  onChange={(event) => feeChange(index, { cadence: event.target.value })}
                  required
                >
                  <option value="">Choose frequency</option>
                  <option value="one_time">One time</option>
                  <option value="monthly">Monthly</option>
                </select>
              </label>
              <label className="field-label">
                Fee {index + 1} amount (Rs)
                <GroupedNumberInput
                  className="field-input"
                  maxLength={17}
                  value={fee.amount}
                  onValueChange={(value) => feeChange(index, { amount: value })}
                  required
                />
              </label>
              <Button
                type="button"
                variant="secondary"
                onClick={() =>
                  setFees((current) => current.filter((_, position) => position !== index))
                }
              >
                Remove fee {index + 1}
              </Button>
            </div>
          ))}
          <Button
            type="button"
            variant="secondary"
            disabled={fees.length >= 32}
            onClick={() =>
              setFees((current) => [...current, { code: '', cadence: '', amount: '' }])
            }
          >
            Add disclosed fee
          </Button>
        </fieldset>
        {configurationOnly ? <p>Publish price changes through dated prices and history.</p> : null}
        {invalid ? (
          <p role="alert">
            Check the name, capacity and prices. Amounts must be non-negative rupees with at most
            two decimal places. Fee codes and frequencies must be valid and unique.
          </p>
        ) : null}
        <div className="flex flex-wrap gap-3">
          <Button type="submit" disabled={unavailable}>
            {pending ? 'Saving room type…' : priceOnly ? 'Publish price version' : 'Save room type'}
          </Button>
          <Button type="button" variant="secondary" onClick={onCancel}>
            Cancel edit
          </Button>
        </div>
      </fieldset>
    </form>
  );
}

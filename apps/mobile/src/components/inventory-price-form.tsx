import { useState } from 'react';
import { View } from 'react-native';
import { billingFormPaisa, billingFormRupees } from '@hsm/api-client';
import {
  DISPLAY_TIME_ZONE,
  roomPriceInputSchema,
  type RoomPriceInput,
  type RoomTypeInput,
} from '@hsm/contracts';
import { Button, Copy } from './ui';
import { BedDouble, CalendarDays, Plus, Receipt, ShieldCheck } from 'lucide-react-native';
import { IconChip } from './inventory-tools';
import { DateField } from './date-field';
import { FeeRow, MoneyInput, PriceSection, type Fee } from './price-form-parts';
function todayKarachi() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: DISPLAY_TIME_ZONE }).format(new Date());
}
export function InventoryPriceForm({
  type,
  disabled,
  locked,
  onSave,
  onCancel,
}: {
  type: RoomTypeInput;
  disabled: boolean;
  locked: boolean;
  onSave: (input: RoomPriceInput) => void;
  onCancel: () => void;
}) {
  // Starts today (Asia/Karachi) unless the owner picks another date.
  const [date, setDate] = useState(todayKarachi()),
    [bed, setBed] = useState(
      type.bedMonthlyRentPaisa === null ? '' : billingFormRupees(type.bedMonthlyRentPaisa),
    ),
    [room, setRoom] = useState(
      type.roomMonthlyRentPaisa === null ? '' : billingFormRupees(type.roomMonthlyRentPaisa),
    ),
    [deposit, setDeposit] = useState(billingFormRupees(type.depositPaisa)),
    [invalid, setInvalid] = useState(false);
  const [fees, setFees] = useState<Fee[]>(
    type.fees.map((fee) => ({
      code: fee.code,
      cadence: fee.cadence,
      amount: billingFormRupees(fee.amountPaisa),
    })),
  );
  function change(index: number, patch: Partial<Fee>) {
    setFees((current) =>
      current.map((fee, position) => (position === index ? { ...fee, ...patch } : fee)),
    );
  }
  function publish() {
    if (disabled || locked) return;
    try {
      const input = roomPriceInputSchema.parse({
        effectiveFrom: date,
        bedMonthlyRentPaisa: type.inventoryMode === 'whole_room' ? null : billingFormPaisa(bed),
        roomMonthlyRentPaisa: type.inventoryMode === 'per_bed' ? null : billingFormPaisa(room),
        depositPaisa: billingFormPaisa(deposit),
        fees: fees.map((fee) => ({
          code: fee.code,
          cadence: fee.cadence,
          amountPaisa: billingFormPaisa(fee.amount),
        })),
      });
      setInvalid(false);
      onSave(input);
    } catch {
      setInvalid(true);
    }
  }
  const inputClass =
    'min-h-12 rounded-input border border-border bg-inputSurface px-3 font-body text-body text-text';
  const lockedInput = { editable: !locked, className: inputClass };
  return (
    <View className="gap-3">
      <PriceSection Icon={CalendarDays} title="Starts on">
        <DateField label="Starts on" value={date} onChange={setDate} disabled={locked} optional />
      </PriceSection>
      <PriceSection Icon={BedDouble} title="Monthly rent">
        {type.inventoryMode !== 'whole_room' ? (
          <MoneyInput
            label="Monthly bed rent (Rs)"
            hint="Per bed"
            value={bed}
            set={setBed}
            input={lockedInput}
          />
        ) : null}
        {type.inventoryMode !== 'per_bed' ? (
          <MoneyInput
            label="Monthly room rent (Rs)"
            hint="Whole room"
            value={room}
            set={setRoom}
            input={lockedInput}
          />
        ) : null}
      </PriceSection>
      {/* The deposit is the one-time refundable amount: the hostel holds it and returns it at
          checkout settlement after any approved deductions (the platform never holds it). */}
      <PriceSection
        Icon={ShieldCheck}
        title="Security deposit"
        note="One-time · refunded when the resident leaves"
      >
        <MoneyInput
          label="Security deposit (Rs)"
          value={deposit}
          set={setDeposit}
          input={lockedInput}
        />
      </PriceSection>
      <PriceSection Icon={Receipt} title="Other fees">
        {fees.map((fee, index) => (
          <FeeRow
            key={index}
            index={index}
            fee={fee}
            locked={locked}
            input={lockedInput}
            change={(patch) => change(index, patch)}
            remove={() => setFees((current) => current.filter((_, position) => position !== index))}
          />
        ))}
        <View style={{ alignSelf: 'flex-start' }}>
          <IconChip
            Icon={Plus}
            text="Add fee"
            label="Add disclosed fee"
            disabled={locked || fees.length >= 32}
            onPress={() =>
              setFees((current) => [...current, { code: '', cadence: '', amount: '' }])
            }
          />
        </View>
      </PriceSection>
      {invalid ? <Copy alert>Check the date, amounts and fee choices.</Copy> : null}
      <Button label="Save rent" disabled={disabled || locked} onPress={publish} />
      <Button secondary label="Cancel price edit" disabled={locked} onPress={onCancel} />
    </View>
  );
}

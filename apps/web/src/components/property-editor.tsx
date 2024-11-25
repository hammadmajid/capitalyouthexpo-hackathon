'use client';
import { useState } from 'react';
import {
  propertyArchiveInputSchema,
  propertyBuildingInputSchema,
  propertyFloorInputSchema,
} from '@hsm/contracts';
import type { PropertyCommand } from './property-command';
import { Button } from './ui/button';
export type PropertyEdit =
  | { kind: 'building' }
  | { kind: 'floor'; buildingId: string; name: string }
  | { kind: 'archive-building' | 'archive-floor'; id: string; name: string; version: number };
export function PropertyEditor({
  edit,
  disabled,
  save,
  cancel,
}: {
  edit: PropertyEdit;
  disabled: boolean;
  save: (body: PropertyCommand) => void;
  cancel: () => void;
}) {
  const [name, setName] = useState(''),
    [number, setNumber] = useState('0'),
    [reason, setReason] = useState('');
  const [error, setError] = useState(false);
  const create = edit.kind === 'building' || edit.kind === 'floor';
  const title =
    edit.kind === 'building'
      ? 'New building'
      : edit.kind === 'floor'
        ? 'New floor in ' + edit.name
        : 'Archive ' + edit.name;
  function submit() {
    if (edit.kind === 'building') {
      const result = propertyBuildingInputSchema.safeParse({
        name,
        sortOrder: number.trim() ? Number(number) : Number.NaN,
      });
      if (result.success) {
        save({ kind: 'building', input: result.data });
        return;
      }
    } else if (edit.kind === 'floor') {
      const result = propertyFloorInputSchema.safeParse({
        buildingId: edit.buildingId,
        label: name,
        levelNumber: number.trim() ? Number(number) : Number.NaN,
      });
      if (result.success) {
        save({ kind: 'floor', input: result.data });
        return;
      }
    } else {
      const result = propertyArchiveInputSchema.safeParse({
        expectedVersion: edit.version,
        reason,
      });
      if (result.success) {
        save({ kind: edit.kind, id: edit.id, input: result.data });
        return;
      }
    }
    setError(true);
  }
  return (
    <form
      aria-label={title}
      className="space-y-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (!disabled) submit();
      }}
    >
      <h4 className="font-semibold">{title}</h4>
      {create ? (
        <>
          <label className="field-label">
            {edit.kind === 'building' ? 'Building name' : 'Floor label'}
            <input
              className="field-input"
              aria-label={edit.kind === 'building' ? 'Building name' : 'Floor label'}
              maxLength={120}
              required
              disabled={disabled}
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <label className="field-label">
            {edit.kind === 'building' ? 'Sort order' : 'Floor level'}
            <input
              className="field-input"
              aria-label={edit.kind === 'building' ? 'Sort order' : 'Floor level'}
              type="number"
              step="1"
              required
              disabled={disabled}
              value={number}
              onChange={(event) => setNumber(event.target.value)}
            />
          </label>
        </>
      ) : (
        <label className="field-label">
          Reason
          <input
            className="field-input"
            aria-label="Property archive reason"
            maxLength={500}
            required
            disabled={disabled}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
        </label>
      )}
      {error ? <p role="alert">Enter a valid name, whole number or archive reason.</p> : null}
      <Button type="submit" disabled={disabled}>
        {create ? 'Save property metadata' : 'Confirm property archive'}
      </Button>{' '}
      <Button type="button" variant="secondary" disabled={disabled} onClick={cancel}>
        Cancel property edit
      </Button>
    </form>
  );
}

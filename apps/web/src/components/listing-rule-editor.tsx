import { useState } from 'react';
import {
  listingRuleArchiveSchema,
  listingRuleInputSchema,
  type PrivateListingRule,
} from '@hsm/contracts';
import type { RuleCommand } from './use-listing-rules';
import { Button } from './ui/button';
export type RuleDraft = { kind: 'create' } | { kind: 'edit' | 'archive'; row: PrivateListingRule };
export function ListingRuleEditor({
  draft,
  disabled,
  busy,
  submit,
  cancel,
}: {
  draft: RuleDraft;
  disabled: boolean;
  busy: boolean;
  submit: (command: RuleCommand) => void;
  cancel: () => void;
}) {
  const [body, setBody] = useState(draft.kind === 'create' ? '' : draft.row.body);
  const [sortOrder, setSortOrder] = useState(
    draft.kind === 'create' ? '' : String(draft.row.sortOrder),
  );
  const [reason, setReason] = useState(''),
    [invalid, setInvalid] = useState(false);
  const archive = draft.kind === 'archive';
  function save() {
    if (disabled || busy) return;
    if (draft.kind === 'archive') {
      const input = listingRuleArchiveSchema.safeParse({ reason });
      setInvalid(!input.success);
      if (input.success)
        submit({
          kind: 'archive',
          id: draft.row.id,
          version: draft.row.version,
          reason: input.data.reason,
        });
      return;
    }
    const input = listingRuleInputSchema.safeParse({
      body,
      sortOrder: sortOrder.trim() === '' ? undefined : Number(sortOrder),
    });
    setInvalid(!input.success);
    if (!input.success) return;
    submit(
      draft.kind === 'create'
        ? { kind: 'create', input: input.data }
        : { kind: 'edit', id: draft.row.id, version: draft.row.version, input: input.data },
    );
  }
  return (
    <form
      aria-label={archive ? 'Archive hostel rule' : 'Hostel rule editor'}
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        save();
      }}
    >
      <fieldset disabled={disabled || busy} className="space-y-4">
        {archive ? (
          <>
            <p className="whitespace-pre-wrap break-words">{draft.row.body}</p>
            <label className="field-label">
              Reason for archival
              <textarea
                className="field-input"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                maxLength={500}
                required
              />
            </label>
          </>
        ) : (
          <>
            <label className="field-label">
              Rule text
              <textarea
                className="field-input"
                value={body}
                onChange={(event) => setBody(event.target.value)}
                maxLength={4000}
                required
              />
            </label>
            <label className="field-label">
              Display order
              <input
                className="field-input"
                type="number"
                min={0}
                max={2147483647}
                step={1}
                value={sortOrder}
                onChange={(event) => setSortOrder(event.target.value)}
                required
              />
            </label>
            <p className="text-sm text-muted">
              Informational text; booking requirements are configured separately.
            </p>
          </>
        )}
        {invalid ? (
          <p role="alert">Enter valid rule text and display order, or a reason for archival.</p>
        ) : null}
        <Button type="submit">
          {busy ? 'Saving…' : archive ? 'Confirm archival' : 'Save hostel rule'}
        </Button>
      </fieldset>
      <Button type="button" variant="secondary" disabled={busy} onClick={cancel}>
        Cancel rule changes
      </Button>
    </form>
  );
}

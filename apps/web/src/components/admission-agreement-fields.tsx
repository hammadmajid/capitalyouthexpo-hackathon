'use client';
import { GroupedNumberInput } from './ui/grouped-number-input';
export type AdmissionAgreementDraft = {
  moveInDate: string;
  expectedLeaveDate: string;
  rent: string;
  deposit: string;
  openEnded: boolean;
};
type Props = {
  draft: AdmissionAgreementDraft;
  allowOpenEnded: boolean;
  onChange: (draft: AdmissionAgreementDraft) => void;
};
export function AdmissionAgreementFields({ draft, allowOpenEnded, onChange }: Props) {
  return (
    <div className="space-y-3">
      <label className="field-label">
        Agreed move-in date
        <input
          className="field-input"
          type="date"
          value={draft.moveInDate}
          onChange={(event) => onChange({ ...draft, moveInDate: event.target.value })}
        />
      </label>
      {allowOpenEnded ? (
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={draft.openEnded}
            onChange={(event) => onChange({ ...draft, openEnded: event.target.checked })}
          />
          Explicitly agree an open-ended Stay
        </label>
      ) : null}
      {!draft.openEnded ? (
        <label className="field-label">
          Agreed expected leave date
          <input
            className="field-input"
            type="date"
            value={draft.expectedLeaveDate}
            onChange={(event) => onChange({ ...draft, expectedLeaveDate: event.target.value })}
          />
        </label>
      ) : null}
      <label className="field-label">
        Agreed rent per billing period (PKR)
        <GroupedNumberInput
          className="field-input"
          value={draft.rent}
          onValueChange={(value) => onChange({ ...draft, rent: value })}
        />
      </label>
      <label className="field-label">
        Agreed deposit (PKR)
        <GroupedNumberInput
          className="field-input"
          value={draft.deposit}
          onValueChange={(value) => onChange({ ...draft, deposit: value })}
        />
      </label>
    </div>
  );
}

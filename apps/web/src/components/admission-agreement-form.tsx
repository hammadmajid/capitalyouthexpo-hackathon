'use client';
import { useState, type FormEvent } from 'react';
import {
  type ManualStayInput,
  type BillingAgreementTerms,
  type BillingCatalogEntry,
  type billingSettingsReadSchema,
} from '@hsm/contracts';
import { admissionAgreementInput } from './admission-agreement-input';
import type { z } from 'zod';
import {
  AdmissionAgreementFields,
  type AdmissionAgreementDraft,
} from './admission-agreement-fields';
import { AdmissionAgreementChoices } from './admission-agreement-choices';
import { BillingPolicySummary } from './billing-policy-summary';
import { Button } from './ui/button';
type Props = {
  actorId: string;
  branchId: string;
  roomTypeId: string;
  resident: ManualStayInput['resident'];
  target: ManualStayInput['target'];
  settings: z.infer<typeof billingSettingsReadSchema>;
  fees: BillingAgreementTerms['fees'];
  catalog: BillingCatalogEntry[];
  disabled: boolean;
  unavailable: boolean;
  onReview: (manual: ManualStayInput) => void;
  onBack: () => void;
};
export function AdmissionAgreementForm(props: Props) {
  const effective = props.settings.effectiveVersion;
  const scoped =
    props.settings.target.branchId === props.branchId &&
    props.settings.target.roomTypeId === props.roomTypeId &&
    effective &&
    (effective.level !== 'branch' || effective.scopeId === props.branchId) &&
    (effective.level !== 'room_type' || effective.scopeId === props.roomTypeId);
  if (props.unavailable || !scoped)
    return (
      <p role="alert">
        Refresh the current branch and room-type billing agreement before continuing.
      </p>
    );
  return (
    <CatalogAgreement
      key={
        props.actorId +
        ':' +
        props.branchId +
        ':' +
        JSON.stringify([props.resident, props.target, props.settings, props.fees])
      }
      {...props}
    />
  );
}
// ACC-004 / FIN-004: appended pages may add choices; altered or removed source
// entries require a fresh agreement before previously entered money can be used.
function CatalogAgreement(props: Props) {
  const [source, setSource] = useState({ entries: props.catalog, revision: 0 });
  if (source.entries !== props.catalog) {
    const current = new Set(props.catalog.map((entry) => JSON.stringify(entry)));
    const unchanged = source.entries.every((entry) => current.has(JSON.stringify(entry)));
    setSource({ entries: props.catalog, revision: source.revision + (unchanged ? 0 : 1) });
  }
  return <Agreement key={source.revision} {...props} />;
}
function useAgreement(props: Props) {
  const [draft, setDraft] = useState<AdmissionAgreementDraft>({
      moveInDate: '',
      expectedLeaveDate: '',
      rent: '',
      deposit: '',
      openEnded: false,
    }),
    [selected, setSelected] = useState<string[]>([]),
    [invalid, setInvalid] = useState(false);
  const effective = props.settings.effectiveVersion;
  const catalog =
    effective?.policy.customCharges === 'catalog_only'
      ? props.catalog.filter((row) => row.branchId === props.branchId && row.archivedAt === null)
      : [];
  function change(value: AdmissionAgreementDraft) {
    if (!props.disabled) {
      setDraft(value);
      setInvalid(false);
    }
  }
  function toggle(key: string) {
    if (!props.disabled) {
      setSelected((current) =>
        current.includes(key) ? current.filter((value) => value !== key) : [...current, key],
      );
      setInvalid(false);
    }
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    if (props.disabled || !effective) return;
    try {
      const manual = admissionAgreementInput(props, draft, selected, catalog);
      setInvalid(false);
      props.onReview(manual);
    } catch {
      setInvalid(true);
    }
  }
  return { draft, change, selected, toggle, submit, invalid, catalog, effective };
}
function Agreement(props: Props) {
  const state = useAgreement(props),
    policy = state.effective?.policy;
  if (!policy) return null;
  return (
    <form aria-label="Agree resident Stay terms" onSubmit={state.submit} className="space-y-4">
      <h3 className="text-lg font-semibold">Agree Stay dates and financial terms</h3>
      <p>
        Enter the original agreed dates and exact amounts. No current date, rent amount or deposit
        is assumed. Enter 0 explicitly when an agreed amount is zero.
      </p>
      <BillingPolicySummary policy={policy} />
      {state.invalid ? (
        <p role="alert">
          Enter valid agreed dates and exact PKR amounts, with a permitted Stay end.
        </p>
      ) : null}
      <fieldset disabled={props.disabled} className="space-y-4">
        <legend>Original admission agreement</legend>
        <AdmissionAgreementFields
          draft={state.draft}
          allowOpenEnded={policy.allowOpenEnded && policy.cycle.kind !== 'term'}
          onChange={state.change}
        />
        <AdmissionAgreementChoices
          fees={props.fees}
          catalog={state.catalog}
          selected={state.selected}
          onToggle={state.toggle}
        />
        <Button type="submit" disabled={props.disabled}>
          Review agreed terms
        </Button>
      </fieldset>
      <Button variant="ghost" disabled={props.disabled} onClick={props.onBack}>
        Back to admission target
      </Button>
    </form>
  );
}

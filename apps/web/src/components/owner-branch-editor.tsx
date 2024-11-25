'use client';
import { LocationPicker } from './location-picker';
import { OwnerManagerReset } from './owner-manager-reset';
import { OwnerManagerRemove } from './residents/owner-manager-remove';
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ownerBranchSetupActions, readOwnerBranchSetup, readOwnerHostel } from '@hsm/api-client';
import type { HostelOnboarding } from '@hsm/contracts';
import { withRevision } from './hostel-revision/revision-fields';
import { editorSaves, type EditorTarget } from './owner-editor-saves';
import { setupHostelKey } from './setup-wizard/use-setup-draft';
import { errorMessage } from '../lib/messages';
import { FlowForm } from './auth/flow-form';
import { Button } from './ui/button';
import { OwnerGeography } from './owner-geography';
import { OwnerInvitation } from './owner-invitation';
import { PrivateFileInput } from './private-file-input';
const categories = [
  { value: '', label: 'Choose category' },
  ...['boys', 'girls', 'working_male', 'working_female'].map((value) => ({
    value,
    label: value.replaceAll('_', ' '),
  })),
];
type Props = EditorTarget & {
  userId: string;
  // HSM-SETUP: a wizard step shows one part; without it the whole draft shows on one page.
  section?: 'basics' | 'location' | 'review';
  onSaved?: () => void;
};
export function OwnerBranchEditor(props: Props) {
  // Same cache entry as the wizard. A branch being added reads the hostel as its template.
  const branchId = props.target?.branchId;
  const query = useQuery({
    queryKey: setupHostelKey(props.userId, props.brandId, branchId),
    queryFn: () =>
      branchId
        ? readOwnerBranchSetup(props.client, props.brandId, branchId)
        : readOwnerHostel(props.client, props.brandId),
    gcTime: 0,
    retry: false,
    refetchOnWindowFocus: false,
  });
  if (query.isError)
    return (
      <>
        <p role="alert">Unable to load this hostel.</p>
        <Button
          onClick={() => {
            void query.refetch();
          }}
        >
          Retry hostel
        </Button>
      </>
    );
  if (!query.data) return <p role="status">Loading hostel…</p>;
  async function refresh() {
    const result = await query.refetch();
    if (result.error) throw result.error;
  }
  return <OwnerDraft {...props} data={query.data} refresh={refresh} />;
}
function OwnerDraft({
  data: live,
  refresh,
  ...props
}: Props & { data: HostelOnboarding; refresh: () => Promise<void> }) {
  const { revise } = props;
  // Unsent revision edits show on top of the live values.
  const data = revise ? withRevision(live, revise.open) : live,
    branch = data.mainBranch;
  const branchApi = useMemo(
      () => ownerBranchSetupActions(props.client, () => crypto.randomUUID()),
      [props.client],
    ),
    saves = editorSaves(props, data, branchApi);
  const [geography, setGeography] = useState({
    cityId: branch?.cityId ?? null,
    areaId: branch?.areaId ?? null,
    subAreaId: branch?.subAreaId ?? null,
  });
  const [logo, setLogo] = useState<string | undefined>(data.logoFileId ?? undefined),
    [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false),
    [error, setError] = useState<string>();
  const editable =
    Boolean(revise) ||
    Boolean(props.target?.adding) ||
    !branch ||
    ['draft', 'changes_requested', 'rejected'].includes(branch.verificationStatus);
  const shows = (part: NonNullable<Props['section']>) => !props.section || props.section === part;
  async function submit() {
    setSubmitting(true);
    setError(undefined);
    try {
      await saves.submit();
      await refresh();
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setSubmitting(false);
    }
  }
  return (
    <section className="space-y-6">
      <h2 className="text-2xl font-bold">{data.name}</h2>
      <p>Status: {branch?.verificationStatus ?? 'Incomplete draft'}</p>
      <p>Submission requests review. The platform does not hold rent or deposits.</p>
      {editable ? (
        <>
          {shows('basics') ? (
            <>
              {saves.branchMode ? (
                // BRN-001: a branch belongs to this hostel, so its name and logo stay fixed here.
                <p>Branch of {data.name}</p>
              ) : (
                <PrivateFileInput
                  id="hostel-logo"
                  label="Hostel logo (optional)"
                  purpose="listing_photo"
                  onReady={setLogo}
                  onBusy={setUploading}
                />
              )}
              <FlowForm
                resetAfterSubmit={false}
                label={saves.branchMode ? 'Save branch basics' : 'Save hostel basics'}
                disabled={uploading || submitting}
                initialValues={{
                  hostelName: data.name,
                  hostelCategory: branch?.category ?? '',
                  hostelDescription: branch?.description ?? '',
                  hostelPhone: branch?.phone ?? '',
                }}
                fields={[
                  ...(saves.branchMode ? [] : [{ name: 'hostelName', label: 'Hostel name' }]),
                  { name: 'hostelCategory', label: 'Hostel category', options: categories },
                  { name: 'hostelDescription', label: 'Hostel description' },
                  { name: 'hostelPhone', label: 'Hostel contact number', type: 'tel' },
                ]}
                submit={async (input) => {
                  const message = await saves.basics(input, logo);
                  // A new branch moves the wizard to that branch; its own read replaces this one.
                  if (!props.target?.adding) await refresh();
                  props.onSaved?.();
                  return message;
                }}
              />
            </>
          ) : null}
          {shows('location') ? (
            <>
              <h3 className="text-xl font-semibold">
                {saves.branchMode ? 'Branch location' : 'Main branch'}
              </h3>
              <OwnerGeography
                userId={props.userId}
                client={props.client}
                value={geography}
                change={setGeography}
              />
              <p>Enter latitude and longitude for the main branch.</p>
              <FlowForm
                resetAfterSubmit={false}
                label={saves.branchMode ? 'Save branch location' : 'Save main branch'}
                extra={(values, set, busy) => (
                  <LocationPicker
                    values={values}
                    disabled={busy}
                    change={(pin) => {
                      set('latitude', String(pin.latitude));
                      set('longitude', String(pin.longitude));
                    }}
                  />
                )}
                disabled={submitting}
                initialValues={{
                  branchName: branch?.name ?? data.name,
                  branchCategory: branch?.category ?? '',
                  branchDescription: branch?.description ?? '',
                  branchPhone: branch?.phone ?? '',
                  address: branch?.addressLine ?? '',
                  landmark: branch?.nearbyLandmark ?? '',
                  latitude: branch?.location?.latitude.toString() ?? '',
                  longitude: branch?.location?.longitude.toString() ?? '',
                }}
                fields={[
                  { name: 'branchName', label: 'Branch name' },
                  { name: 'branchCategory', label: 'Branch category', options: categories },
                  { name: 'branchDescription', label: 'Branch description' },
                  { name: 'branchPhone', label: 'Branch contact number', type: 'tel' },
                  { name: 'address', label: 'Complete branch address' },
                  { name: 'landmark', label: 'Nearby landmark (optional)' },
                  { name: 'latitude', label: 'Latitude' },
                  { name: 'longitude', label: 'Longitude' },
                ]}
                submit={async (input) => {
                  const message = await saves.main(input, geography);
                  await refresh();
                  props.onSaved?.();
                  return message;
                }}
              />
            </>
          ) : null}
          {shows('review') && !revise ? (
            <>
              <p>
                Still required: {data.missingFields.length ? data.missingFields.join(', ') : 'None'}
              </p>
              <Button
                disabled={submitting || uploading || data.missingFields.length > 0}
                onClick={() => {
                  void submit();
                }}
              >
                Submit for verification
              </Button>
            </>
          ) : null}
        </>
      ) : (
        <p>This setup is awaiting review or is no longer editable.</p>
      )}
      {error ? <p role="alert">{error}</p> : null}
      {branch && shows('review') ? (
        <>
          <OwnerInvitation key={branch.id} branchId={branch.id} actions={props.actions} />
          <OwnerManagerReset
            key={'reset:' + branch.id}
            userId={props.userId}
            branchId={branch.id}
            actions={props.actions}
          />
          <OwnerManagerRemove
            key={'remove:' + branch.id}
            userId={props.userId}
            branchId={branch.id}
          />
        </>
      ) : null}
    </section>
  );
}

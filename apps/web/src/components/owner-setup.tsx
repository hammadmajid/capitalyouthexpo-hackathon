'use client';
import { useMemo, useState } from 'react';
import {
  listOwnerOrganizations,
  listOwnerHostels,
  ownerSetupActions,
  ownerBasicsForm,
} from '@hsm/api-client';
import { browserClient } from '../lib/client';
import { useSession } from './providers';
import { OwnerChoice } from './owner-choice';
import { SetupWizard } from './setup-wizard/setup-wizard';
import { FlowForm } from './auth/flow-form';
export const ownerCategoryOptions = [
  { value: '', label: 'Choose category' },
  ...['boys', 'girls', 'working_male', 'working_female'].map((value) => ({
    value,
    label: value.replaceAll('_', ' '),
  })),
];
export function OwnerSetup() {
  const session = useSession(),
    profile = session.data;
  if (!profile?.capabilities.owner || !profile.user.emailVerified)
    return <p role="alert">Complete your verified Owner profile first.</p>;
  return <OwnerWorkspace key={profile.user.id} userId={profile.user.id} />;
}
function OwnerWorkspace({ userId }: { userId: string }) {
  const client = useMemo(() => browserClient(), []),
    actions = useMemo(() => ownerSetupActions(client, () => crypto.randomUUID()), [client]);
  const [organization, setOrganization] = useState<{ id: string; name: string }>(),
    [brandId, setBrandId] = useState<string>();
  if (brandId)
    return (
      <SetupWizard
        key={brandId}
        actorId={userId}
        brandId={brandId}
        actions={actions}
        client={client}
        leave={() => setBrandId(undefined)}
      />
    );
  return (
    <section className="space-y-6">
      <h2 className="text-2xl font-bold">Set up your hostel</h2>
      <p>
        Drafts stay private. Submission requests platform verification and does not approve or
        publish a listing.
      </p>
      <OwnerChoice
        label="My organizations"
        selectedId={organization?.id}
        queryKey={['owner-organizations', userId]}
        load={(cursor) =>
          listOwnerOrganizations(client, { limit: 20, ...(cursor ? { cursor } : {}) })
        }
        choose={setOrganization}
      />
      {organization ? (
        <section key={organization.id} className="space-y-6">
          <h3 className="text-xl font-semibold">{organization.name}</h3>
          <OwnerChoice
            label="My hostels"
            queryKey={['owner-hostels', userId, organization.id]}
            load={(cursor) =>
              listOwnerHostels(client, organization.id, {
                limit: 20,
                ...(cursor ? { cursor } : {}),
              })
            }
            choose={(item) => setBrandId(item.id)}
          />
          <h3 className="text-xl font-semibold">Create a hostel</h3>
          <FlowForm
            label="Create private hostel"
            fields={[
              { name: 'hostelName', label: 'Hostel name' },
              { name: 'hostelCategory', label: 'Hostel category', options: ownerCategoryOptions },
              { name: 'hostelDescription', label: 'Hostel description (optional)' },
              { name: 'hostelPhone', label: 'Hostel contact number (optional)', type: 'tel' },
            ]}
            submit={async (input) => {
              const saved = await actions.create(organization.id, ownerBasicsForm(input));
              setBrandId(saved.id);
            }}
          />
        </section>
      ) : (
        <p>Select your organization to resume or create a hostel.</p>
      )}
    </section>
  );
}

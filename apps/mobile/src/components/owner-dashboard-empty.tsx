import { router } from 'expo-router';

import { SetupButton, SetupCard, SetupHeading, SetupText } from './owner-wizard-ui';

// OWN-001: one onboarding entry, without invented operational totals.

export function OwnerDashboardEmpty() {
  return (
    <SetupCard>
      <SetupHeading>Create your first hostel</SetupHeading>

      <SetupButton
        label="Create Your First Hostel"
        onPress={() => router.push({ pathname: '/owner-setup', params: { step: 'basics' } })}
      />

      <SetupButton secondary label="Invite Manager" disabled onPress={() => undefined} />

      <SetupText muted>Save hostel Basic Information before inviting a Manager.</SetupText>
    </SetupCard>
  );
}

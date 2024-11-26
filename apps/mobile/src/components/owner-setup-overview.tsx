import { router } from 'expo-router';
import {
  BedDouble,
  Building2,
  CalendarClock,
  CreditCard,
  ClipboardList,
  Image as ImageIcon,
  MapPin,
  ShieldCheck,
  Users,
  type LucideIcon,
} from 'lucide-react-native';
import { safeMessage } from '../lib/messages';
import { OwnerRevisionPanel } from './owner-revision-panel';
import {
  SetupButton,
  SetupCard,
  SetupShell,
  SetupStepCard,
  SetupText,
  StatusChip,
} from './owner-wizard-ui';
import { leaveSetup, openSetupStep, type SetupBranch } from './owner-setup-nav';
import { verificationLabel } from './owner-status';
import {
  canAddBranch,
  draftProgress,
  setupStepKeys,
  useOwnerDraftDetails,
  useOwnerHostel,
  useOwnerHostels,
  useOwnerOrganization,
  type DraftProgress,
  type SetupStep,
} from './use-owner-draft';
export const stepCopy: Record<
  SetupStep,
  { title: string; description: string; Icon: LucideIcon; optional: boolean }
> = {
  basics: {
    title: 'Basic Information',
    description: 'Name, type and about',
    Icon: Building2,
    optional: false,
  },
  location: {
    title: 'Location & Address',
    description: 'Select location on map and add details',
    Icon: MapPin,
    optional: false,
  },
  rooms: {
    title: 'Building & Rooms',
    description: 'Buildings, floors, rooms and beds',
    Icon: BedDouble,
    optional: true,
  },
  photos: {
    title: 'Photos & Gallery',
    description: 'Upload photos of your property and rooms',
    Icon: ImageIcon,
    optional: true,
  },
  amenities: {
    title: 'Amenities & Services',
    description: 'Select available amenities',
    Icon: ClipboardList,
    optional: true,
  },
  policies: {
    title: 'Hostel Policies & Agreements',
    description: 'Rent terms and policies',
    Icon: ClipboardList,
    optional: true,
  },
  visits: {
    title: 'Visiting Hours',
    description: 'Days and times customers can visit',
    Icon: CalendarClock,
    optional: true,
  },
  payments: {
    title: 'Payment Methods',
    description: 'Accounts residents pay into',
    Icon: CreditCard,
    optional: true,
  },
  staff: {
    title: 'Staff',
    description: 'Add staff · salary optional',
    Icon: Users,
    optional: true,
  },
  review: {
    title: 'Review & Submit',
    description: 'Check details and submit for verification',
    Icon: ShieldCheck,
    optional: false,
  },
};
function nextStep(progress: DraftProgress): SetupStep {
  return setupStepKeys.find((key) => !progress[key]) ?? 'review';
}
export function OwnerSetupOverview({
  actorId,
  brandId,
  branch = {},
}: {
  actorId: string;
  brandId: string | undefined;
  branch?: SetupBranch;
}) {
  if (brandId && branch.addBranch) return <AddBranchOverview actorId={actorId} brandId={brandId} />;
  return brandId ? (
    <DraftOverview actorId={actorId} brandId={brandId} branchId={branch.branchId} />
  ) : (
    <NewOverview actorId={actorId} />
  );
}
function DraftOverview({
  actorId,
  brandId,
  branchId,
}: {
  actorId: string;
  brandId: string;
  branchId: string | undefined;
}) {
  const hostel = useOwnerHostel(actorId, brandId, branchId);
  const details = useOwnerDraftDetails(actorId, hostel.data?.mainBranch?.id);
  const progress = draftProgress(hostel.data, details);
  const active = nextStep(progress);
  const status = hostel.data?.mainBranch?.verificationStatus;
  return (
    <SetupShell
      title={branchId ? 'Branch Setup' : 'Hostel Setup'}
      subtitle={
        hostel.data
          ? hostel.data.name +
            (branchId && hostel.data.mainBranch ? ' · ' + hostel.data.mainBranch.name : '')
          : 'Loading your saved draft…'
      }
      back={leaveSetup}
    >
      {hostel.isError ? (
        <SetupCard>
          <SetupText alert>{safeMessage(hostel.error)}</SetupText>
        </SetupCard>
      ) : null}
      {status ? <StatusChip label={verificationLabel(status)} tone="info" /> : null}
      {status === 'approved' && !branchId ? (
        <OwnerRevisionPanel actorId={actorId} brandId={brandId} />
      ) : null}
      {setupStepKeys.map((key, index) => (
        <SetupStepCard
          key={key}
          number={index + 1}
          {...stepCopy[key]}
          active={key === active && !progress.review}
          completed={progress[key]}
          status={progress[key] ? 'Saved' : stepCopy[key].optional ? 'Optional' : 'Required'}
          onPress={() => openSetupStep(key, brandId)}
        />
      ))}
      <SetupButton
        label={progress.review ? 'Review status' : 'Continue'}
        disabled={!hostel.data}
        onPress={() => openSetupStep(progress.review ? 'review' : active, brandId)}
      />
    </SetupShell>
  );
}
function NewOverview({ actorId }: { actorId: string }) {
  const organizations = useOwnerOrganization(actorId);
  const organization = organizations.data?.[0];
  const hostels = useOwnerHostels(actorId, organization?.id);
  const failure = organizations.error ?? hostels.error;
  return (
    <SetupShell title="Hostel Setup" subtitle={`${setupStepKeys.length} steps`} back={leaveSetup}>
      {failure ? (
        <SetupCard>
          <SetupText alert>{safeMessage(failure)}</SetupText>
        </SetupCard>
      ) : null}
      {organizations.data && !organization ? (
        <SetupCard>
          <SetupText>Complete your Owner profile first.</SetupText>
          <SetupButton label="Owner profile" onPress={() => router.push('/owner-profile')} />
        </SetupCard>
      ) : null}
      {setupStepKeys.map((key, index) => (
        <SetupStepCard
          key={key}
          number={index + 1}
          {...stepCopy[key]}
          active={index === 0}
          status={index === 0 ? 'Start here' : 'Available after step 1'}
          onPress={() => openSetupStep('basics')}
        />
      ))}
      <SetupButton
        label="Start a new hostel"
        disabled={!organization}
        onPress={() => openSetupStep('basics')}
      />
    </SetupShell>
  );
}
// BRN-001: a new branch of an existing hostel follows the same six steps; the hostel name
// is fixed and the first save creates the branch draft.
function AddBranchOverview({ actorId, brandId }: { actorId: string; brandId: string }) {
  const hostel = useOwnerHostel(actorId, brandId);
  const ready = canAddBranch(hostel.data);
  return (
    <SetupShell
      title="Add Branch"
      subtitle={hostel.data ? 'New branch of ' + hostel.data.name : 'Loading your hostel…'}
      back={leaveSetup}
    >
      {hostel.isError ? (
        <SetupCard>
          <SetupText alert>{safeMessage(hostel.error)}</SetupText>
        </SetupCard>
      ) : null}
      {hostel.data && !ready ? (
        <SetupCard>
          <SetupText>Submit the main branch first.</SetupText>
        </SetupCard>
      ) : null}
      {setupStepKeys.map((key, index) => (
        <SetupStepCard
          key={key}
          number={index + 1}
          {...stepCopy[key]}
          active={ready && index === 0}
          status={index === 0 ? 'Start here' : 'Available after step 1'}
          onPress={() => (ready ? openSetupStep('basics', brandId) : undefined)}
        />
      ))}
      <SetupText muted>Verified separately · private until approved</SetupText>
      <SetupButton
        label="Start the new branch"
        disabled={!ready}
        onPress={() => openSetupStep('basics', brandId)}
      />
    </SetupShell>
  );
}

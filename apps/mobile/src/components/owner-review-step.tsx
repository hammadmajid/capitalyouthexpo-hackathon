import type { ReactNode } from 'react';
import { View } from 'react-native';
import {
  AlignLeft,
  BedDouble,
  Building2,
  CalendarClock,
  CalendarDays,
  CreditCard,
  House,
  IdCard,
  Images,
  LayoutDashboard,
  Landmark,
  LocateFixed,
  MapPinned,
  Pencil,
  Phone,
  ScrollText,
  ShieldCheck,
  Sparkles,
  Star,
  UserRound,
  Users,
  type LucideIcon,
} from 'lucide-react-native';
import { mobileColors as colors } from '@hsm/ui';
import { IconChip, InvFact } from './inventory-tools';
import { plural } from './owner-floor-rooms';
import { router } from 'expo-router';
import type { HostelOnboarding } from '@hsm/contracts';
import { safeMessage } from '../lib/messages';
import { useAreaNames } from './owner-area-picker';
import { replaceSetupStep } from './owner-setup-nav';
import { hostelTypeLabels, tierLabels, verificationLabel, verificationTone } from './owner-status';
import { SetupButton, SetupCard, SetupHeading, SetupText, StatusChip } from './owner-wizard-ui';
import { draftProgress, isEditable, type DraftDetails, type SetupStep } from './use-owner-draft';
const missingLabels: Record<string, string> = {
  main_branch: 'Main branch',
  category: 'Hostel type (Male or Female)',
  city: 'City',
  area: 'Sector or area',
  address: 'Complete address',
  location: 'Map location',
};
// One review card: icon badge, title, pencil to edit, then short facts.
function Section({
  title,
  Icon,
  step,
  brandId,
  editable,
  children,
}: {
  title: string;
  Icon: LucideIcon;
  step: SetupStep;
  brandId: string;
  editable: boolean;
  children: ReactNode;
}) {
  return (
    <SetupCard>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View className="h-11 w-11 items-center justify-center rounded-pill bg-aqua">
          <Icon size={22} color={colors.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <SetupHeading>{title}</SetupHeading>
        </View>
        {editable ? (
          <IconChip
            Icon={Pencil}
            label={'Edit ' + title}
            onPress={() => replaceSetupStep(step, brandId)}
          />
        ) : null}
      </View>
      {children}
    </SetupCard>
  );
}
// A fact row with an icon; hidden when empty so the card stays short.
function Fact({ Icon, text }: { Icon: LucideIcon; text: string | null | undefined }) {
  if (!text) return null;
  return <InvFact Icon={Icon}>{text}</InvFact>;
}
// HSM-SETUP / OWN-001: everything shown here is re-read from the server. Submission requests
// verification only; approval and publication remain platform decisions.
export function OwnerReviewStep({
  actorId,
  data,
  details,
  submitting,
  error,
  submit,
}: {
  actorId: string;
  data: HostelOnboarding;
  details: DraftDetails;
  submitting: boolean;
  error: unknown;
  submit: () => Promise<void>;
}) {
  const branch = data.mainBranch;
  const progress = draftProgress(data, details);
  const editable = isEditable(data);
  const place = useAreaNames(actorId, {
    cityId: branch?.cityId ?? null,
    areaId: branch?.areaId ?? null,
    subAreaId: branch?.subAreaId ?? null,
  });
  const status = branch?.verificationStatus ?? 'draft';
  const amenities = details.listing.data?.amenities ?? [];
  const section = { brandId: data.id, editable };
  const missing = data.missingFields.map((field) => missingLabels[field] ?? field);
  const photos = details.gallery.data?.data.length;
  const accounts = details.payments.data?.data.length ?? 0;
  const openDays = new Set((details.visits.data?.windows ?? []).map((w) => w.dayOfWeek)).size;
  return (
    <>
      <SetupCard>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View className="h-11 w-11 items-center justify-center rounded-pill bg-aqua">
            <ShieldCheck size={22} color={colors.primary} />
          </View>
          <View style={{ flex: 1, gap: 4 }}>
            <SetupHeading>Verification</SetupHeading>
            <StatusChip label={verificationLabel(status)} tone={verificationTone(status)} />
          </View>
        </View>
        {missing.length ? <SetupText alert>Needed: {missing.join(', ')}</SetupText> : null}
        {status === 'changes_requested' ? (
          <SetupText>Fix below, then submit again</SetupText>
        ) : null}
        {data.verificationNote ? (
          <SetupText alert>
            {(status === 'rejected' ? 'Reason from HSM: ' : 'HSM asked for: ') +
              data.verificationNote}
          </SetupText>
        ) : null}
        {editable ? (
          <View style={{ alignSelf: 'flex-start' }}>
            <IconChip
              Icon={IdCard}
              text="CNIC photos"
              label="Owner verification evidence"
              onPress={() => router.push('/owner-verification')}
            />
          </View>
        ) : null}
      </SetupCard>
      <Section title="Basic Information" Icon={Building2} step="basics" {...section}>
        <Fact Icon={Building2} text={data.name} />
        <Fact
          Icon={Users}
          text={branch?.category ? (hostelTypeLabels[branch.category] ?? branch.category) : null}
        />
        <Fact
          Icon={Star}
          text={
            branch?.propertyTier ? (tierLabels[branch.propertyTier] ?? branch.propertyTier) : null
          }
        />
        <Fact
          Icon={CalendarDays}
          text={branch?.establishmentYear ? 'Since ' + branch.establishmentYear : null}
        />
        <Fact Icon={AlignLeft} text={branch?.description} />
        <Fact Icon={Phone} text={branch?.phone} />
      </Section>
      <Section title="Location" Icon={MapPinned} step="location" {...section}>
        <Fact Icon={MapPinned} text={place || (branch?.cityId ? 'Loading…' : 'Area not set')} />
        <Fact Icon={House} text={branch?.addressLine ?? 'Address not set'} />
        <Fact Icon={Landmark} text={branch?.nearbyLandmark} />
        <Fact Icon={LocateFixed} text={branch?.location ? 'Map pin saved' : 'Map pin not set'} />
      </Section>
      <Section title="Rooms" Icon={BedDouble} step="rooms" {...section}>
        <Fact
          Icon={BedDouble}
          text={
            details.inventory.data
              ? plural(progress.roomCount, 'room') + ' · ' + plural(progress.bedCount, 'bed')
              : 'Loading…'
          }
        />
      </Section>
      <Section title="Photos" Icon={Images} step="photos" {...section}>
        <Fact Icon={Images} text={photos === undefined ? 'Loading…' : plural(photos, 'photo')} />
      </Section>
      <Section title="Amenities" Icon={Sparkles} step="amenities" {...section}>
        <Fact
          Icon={Sparkles}
          text={amenities.length ? amenities.map((row) => row.name).join(' · ') : 'None selected'}
        />
      </Section>
      {/* The remaining steps, so nothing is submitted unseen. */}
      <Section title="Policies" Icon={ScrollText} step="policies" {...section}>
        <Fact
          Icon={ScrollText}
          text={
            details.policy.data
              ? progress.policies
                ? 'Rent policy set'
                : 'Rent policy not set'
              : 'Loading…'
          }
        />
      </Section>
      <Section title="Visiting hours" Icon={CalendarClock} step="visits" {...section}>
        <Fact
          Icon={CalendarClock}
          text={
            details.visits.data
              ? openDays
                ? 'Open ' + plural(openDays, 'day') + ' a week'
                : 'Closed every day'
              : 'Loading…'
          }
        />
      </Section>
      {/* CHG-050: residents need an account to pay into before rent can be paid. */}
      <Section title="Payment methods" Icon={CreditCard} step="payments" {...section}>
        <Fact
          Icon={CreditCard}
          text={
            details.payments.data
              ? accounts
                ? plural(accounts, 'account')
                : 'No account yet · residents cannot pay'
              : 'Loading…'
          }
        />
      </Section>
      <Section title="Staff" Icon={UserRound} step="staff" {...section}>
        <Fact
          Icon={UserRound}
          text={details.staff.data ? (progress.staff ? 'Staff added' : 'No staff yet') : 'Loading…'}
        />
      </Section>
      {error ? <SetupText alert>{safeMessage(error)}</SetupText> : null}
      {editable ? (
        <SetupButton
          label={submitting ? 'Submitting…' : 'Submit for verification'}
          disabled={submitting || data.missingFields.length > 0}
          onPress={() => void submit().catch(() => undefined)}
        />
      ) : status === 'approved' ? (
        <SetupText muted>Approved · live on HSM</SetupText>
      ) : (
        <SetupText muted>Not public · you will be notified of the decision.</SetupText>
      )}
      {/* Leaves setup for the dashboard (the header arrow goes to the previous step). */}
      <View style={{ alignSelf: 'center' }}>
        <IconChip
          Icon={LayoutDashboard}
          text="Dashboard"
          label="Back to Owner dashboard"
          onPress={() => router.replace('/owner')}
        />
      </View>
    </>
  );
}

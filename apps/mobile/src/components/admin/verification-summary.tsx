import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import {
  BedDouble,
  CalendarDays,
  Clock,
  Eye,
  EyeOff,
  Gauge,
  IdCard,
  Mail,
  Map,
  MapPin,
  Phone,
  Star,
  User,
} from 'lucide-react-native';
import type { VerificationDossier } from '@hsm/contracts';
import { mobileColors as colors, radii, spacing } from '@hsm/ui';
import { hostelTypeLabels, tierLabels } from '../owner-status';
import { AdminCard, AdminHeading } from './ui';
import { IconFact, StatusPill, karachiTime } from './verification-ui';
// ADM-007: the current server record as icon facts; missing values are omitted, not narrated.
export function DossierSummary({ dossier: d }: { dossier: VerificationDossier }) {
  const facts = [
    { Icon: User, label: 'Owner', value: d.owner.fullName },
    { Icon: IdCard, label: 'CNIC', value: d.owner.cnicLast4 ? '•••• ' + d.owner.cnicLast4 : null },
    { Icon: BedDouble, label: 'Hostel type', value: pick(hostelTypeLabels, d.category) },
    { Icon: Star, label: 'Property tier', value: pick(tierLabels, d.propertyTier) },
    {
      Icon: CalendarDays,
      label: 'Established',
      value: d.establishmentYear ? 'Est. ' + d.establishmentYear : null,
    },
    { Icon: Phone, label: 'Phone', value: d.publicPhone },
    { Icon: Mail, label: 'Email', value: d.publicEmail },
    {
      Icon: d.showPublicContact ? Eye : EyeOff,
      label: 'Public contact',
      value: d.showPublicContact ? 'Contact public' : 'Contact hidden',
    },
    {
      Icon: Clock,
      label: 'Submitted',
      value: d.submittedAt ? karachiTime(d.submittedAt) : null,
    },
    {
      Icon: Gauge,
      label: 'Completeness',
      value: d.completenessScore === null ? null : d.completenessScore + '% complete',
    },
  ];
  return (
    <AdminCard>
      <View style={styles.top}>
        <View style={styles.grow}>
          <AdminHeading>{d.branchName}</AdminHeading>
          <Text className="font-body text-sm text-secondary">{d.organizationName}</Text>
        </View>
        <StatusPill status={d.status} />
      </View>
      {d.addressLine ? (
        <IconFact
          Icon={MapPin}
          label="Address"
          value={d.addressLine}
          {...(d.location ? { action: <MapButton {...d.location} /> } : {})}
        />
      ) : null}
      {facts.map((fact) =>
        fact.value ? (
          <IconFact key={fact.label} Icon={fact.Icon} label={fact.label} value={fact.value} />
        ) : null,
      )}
      {d.description ? (
        <Text className="font-body text-body text-secondary" style={styles.note}>
          {d.description}
        </Text>
      ) : null}
    </AdminCard>
  );
}
function pick(labels: Record<string, string>, value: string | null) {
  return value ? (labels[value] ?? value) : null;
}
function MapButton({ latitude, longitude }: { latitude: number; longitude: number }) {
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel="Open map pin"
      onPress={() =>
        void Linking.openURL(`geo:${latitude},${longitude}?q=${latitude},${longitude}`).catch(
          () => undefined,
        )
      }
      style={styles.map}
    >
      <Map size={18} color={colors.surface} strokeWidth={2} />
    </Pressable>
  );
}
const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  grow: { flex: 1, gap: spacing.xs },
  note: {
    borderLeftWidth: 2,
    borderLeftColor: colors.aqua,
    paddingLeft: spacing.md,
  },
  map: {
    width: spacing.touch,
    height: spacing.touch,
    borderRadius: radii.pill,
    backgroundColor: colors.deep,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

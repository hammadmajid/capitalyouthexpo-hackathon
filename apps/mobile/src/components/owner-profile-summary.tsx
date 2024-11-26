import type { ProfileDetails } from '@hsm/contracts';
import { Building2, Mail, MapPin, Phone, ShieldCheck, UserRound } from 'lucide-react-native';
import { Text, View } from 'react-native';
import { mobileOwnerColors as c, ownerMetrics as m } from '@hsm/ui';
import { SetupCard, SetupHeading, SetupText } from './owner-wizard-ui';

export function OwnerProfileSummary({ details }: { details: ProfileDetails }) {
  const rows = [
    { label: 'Full name', value: details.fullName, Icon: UserRound },
    { label: 'Email', value: details.email, Icon: Mail },
    { label: 'Mobile number', value: details.phone, Icon: Phone },
    {
      label: 'CNIC',
      value: details.cnicLast4 ? '••••• ••••••• ' + details.cnicLast4 : null,
      Icon: ShieldCheck,
    },
    { label: 'Organization', value: details.owner?.organizationName, Icon: Building2 },
    { label: 'Owner address', value: details.owner?.address, Icon: MapPin },
  ];
  return (
    <SetupCard>
      <SetupHeading>Personal details</SetupHeading>
      {rows.map(({ label, value, Icon }) => (
        <View
          key={label}
          style={{
            flexDirection: 'row',
            gap: m.gap,
            alignItems: 'flex-start',
            paddingVertical: m.smallGap,
          }}
        >
          <Icon size={m.stepIcon} color={c.primary} accessible={false} />
          <View style={{ flex: 1, gap: 4 }}>
            <SetupText muted>{label}</SetupText>
            <Text
              selectable
              className="font-heading"
              style={{ color: c.heading, fontSize: m.body + 1 }}
            >
              {value || 'Not provided'}
            </Text>
          </View>
        </View>
      ))}
      <View style={{ flexDirection: 'row', gap: m.gap }}>
        <Building2 size={m.stepIcon} color={c.primary} accessible={false} />
        <SetupText>Owner agreement accepted</SetupText>
      </View>
    </SetupCard>
  );
}

import { Skeleton } from './loading/skeleton';
import { useState } from 'react';
import { ScrollView } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { readReport } from '@hsm/api-client';
import { reportTypeSchema, type ReportType } from '@hsm/contracts';
import { actorClient } from '../lib/runtime';
import { withFreshSession } from '../lib/fresh-session';
import { safeMessage } from '../lib/messages';
import { useSession } from './providers';
import { OwnerScreen } from './owner-screen';
import { ChoiceTile, SetupButton, SetupCard, SetupText } from './owner-wizard-ui';
import { StyleSheet, Text, View } from 'react-native';
import { mobileColors, mobileOwnerColors as oc, ownerMetrics as om } from '@hsm/ui';
// Report cells read as one line each: label on the left, value on the right.
const styles = StyleSheet.create({
  tile: {
    flexBasis: '47%',
    flexGrow: 1,
    gap: 2,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: mobileColors.cardBorder,
    backgroundColor: oc.primarySoft,
  },
  label: { color: oc.secondary, fontSize: om.small },
  value: { color: oc.heading, fontSize: om.body + 1 },
});
const labels: Record<ReportType, string> = {
  occupancy: 'Occupancy',
  residents: 'Residents',
  bookings: 'Bookings',
  'rent-collection': 'Rent collection',
  'outstanding-dues': 'Outstanding dues',
  'payment-history': 'Payment history',
  'security-deposits': 'Security deposits',
  'checkout-history': 'Checkout history',
  complaints: 'Complaints',
  'transport-subscribers': 'Transport subscribers',
};
const pageSize = 20;
// RPT-001/002 / OWN-004: the server's exact report rows across the Owner's own branches.
export function OwnerReports() {
  const profile = useSession().profile;
  const params = useLocalSearchParams<{ type?: string; branchId?: string }>();
  const initial = reportTypeSchema.safeParse(params.type);
  const [type, setType] = useState<ReportType>(initial.success ? initial.data : 'occupancy'),
    [shown, setShown] = useState(pageSize);
  const actorId = profile?.user.id ?? '';
  const report = useQuery({
    queryKey: ['owner-report', actorId, type, params.branchId],
    enabled: Boolean(profile?.capabilities.owner),
    retry: false,
    queryFn: () =>
      withFreshSession(async () =>
        readReport(
          await actorClient(actorId),
          type,
          params.branchId ? { branchId: params.branchId } : {},
        ),
      ),
  });
  const data = report.data;
  return (
    <OwnerScreen title="Reports">
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        accessibilityLabel="Report types"
        contentContainerStyle={{ gap: 8, paddingBottom: 4 }}
      >
        {reportTypeSchema.options.map((option) => (
          <ChoiceTile
            compact
            key={option}
            label={labels[option]}
            selected={option === type}
            disabled={false}
            onPress={() => {
              setType(option);
              setShown(pageSize);
            }}
          />
        ))}
      </ScrollView>
      {report.isPending ? <Skeleton kind="dashboard" label="Loading report…" /> : null}
      {report.error ? (
        <SetupCard>
          <SetupText alert>{safeMessage(report.error)}</SetupText>
        </SetupCard>
      ) : null}
      {data ? (
        <>
          <SetupText muted>
            {data.truncated ? 'More rows exist; narrow the period on Web.' : ''}
          </SetupText>
          {!data.rows.length ? <SetupText muted>No records yet</SetupText> : null}
          {data.rows.slice(0, shown).map((row, index) => (
            <SetupCard key={index}>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {data.columns.map((column, cell) => (
                  <View key={column} style={styles.tile}>
                    <Text className="font-body" style={styles.label}>
                      {column}
                    </Text>
                    <Text className="font-heading" style={styles.value} numberOfLines={2}>
                      {row[cell] || '—'}
                    </Text>
                  </View>
                ))}
              </View>
            </SetupCard>
          ))}
          {data.rows.length > shown ? (
            <SetupButton secondary label="Show more" onPress={() => setShown(shown + pageSize)} />
          ) : null}
        </>
      ) : null}
    </OwnerScreen>
  );
}

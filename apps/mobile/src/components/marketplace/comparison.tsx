import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { comparisonInputSchema, readHostelComparison, type ComparisonInput } from '@hsm/api-client';
import { mobileMarketplaceColors as colors, marketplaceMetrics as metrics } from '@hsm/ui';
import { client } from '../../lib/runtime';
import { safeMessage } from '../../lib/messages';
import { MarketplaceAction } from './action';
import { DateField } from '../date-field';
import { ComparisonColumn } from './comparison-column';
type Candidate = { branchId: string; name: string };
export function HostelComparison({
  listings,
  institutions,
  openListing,
}: {
  listings: Candidate[];
  institutions: { id: string; name: string }[];
  openListing: (id: string) => void;
}) {
  const [selected, setSelected] = useState<Candidate[]>([]),
    [from, setFrom] = useState(''),
    [to, setTo] = useState(''),
    [input, setInput] = useState<ComparisonInput>();
  const [destination, setDestination] = useState('');
  const comparison = useQuery({
    queryKey: ['hostel-comparison', input],
    enabled: Boolean(input),
    retry: false,
    queryFn: () => {
      if (!input) throw new Error('Choose hostels');
      return readHostelComparison(client, input);
    },
  });
  const parsed = comparisonInputSchema.safeParse({
    ids: selected.map((row) => row.branchId),
    ...(destination ? { destinationId: destination } : {}),
    ...(from || to ? { range: { moveInDate: from, moveOutDate: to } } : {}),
  });
  function toggle(listing: Candidate) {
    setInput(undefined);
    setSelected((current) =>
      current.some((row) => row.branchId === listing.branchId)
        ? current.filter((row) => row.branchId !== listing.branchId)
        : current.length < 4
          ? [...current, listing]
          : current,
    );
  }
  if (!listings.length && !selected.length) return null;
  return (
    <View style={{ gap: metrics.md }}>
      <Text accessibilityRole="header" style={{ color: colors.heading, fontSize: metrics.xl }}>
        Compare hostels
      </Text>
      <Text style={{ color: colors.secondary }}>Select 2–4 hostels.</Text>
      {listings.map((listing) => (
        <MarketplaceAction
          key={listing.branchId}
          secondary
          label={
            (selected.some((row) => row.branchId === listing.branchId)
              ? 'Selected for comparison: '
              : 'Compare ') + listing.name
          }
          disabled={
            selected.length === 4 && !selected.some((row) => row.branchId === listing.branchId)
          }
          onPress={() => toggle(listing)}
        />
      ))}
      {selected.map((listing) => (
        <MarketplaceAction
          key={'remove:' + listing.branchId}
          secondary
          label={'Remove ' + listing.name}
          onPress={() => toggle(listing)}
        />
      ))}
      {destination ? (
        <Text style={{ color: colors.secondary }}>Straight-line distance to campus</Text>
      ) : null}
      {destination ? (
        <MarketplaceAction
          secondary
          label="Clear comparison destination"
          onPress={() => {
            setDestination('');
            setInput(undefined);
          }}
        />
      ) : null}
      {institutions.map((place) => (
        <MarketplaceAction
          key={place.id}
          secondary
          label={'Compare distance to ' + place.name}
          onPress={() => {
            setDestination(place.id);
            setInput(undefined);
          }}
        />
      ))}
      <DateField
        label="Move-in"
        value={from}
        optional
        onChange={(value) => {
          setFrom(value);
          setInput(undefined);
        }}
      />
      <DateField
        label="Move-out"
        value={to}
        optional
        onChange={(value) => {
          setTo(value);
          setInput(undefined);
        }}
      />
      <MarketplaceAction
        label="Load current comparison"
        disabled={!parsed.success || comparison.isFetching}
        onPress={() => {
          if (parsed.success) {
            if (JSON.stringify(input) === JSON.stringify(parsed.data)) void comparison.refetch();
            else setInput(parsed.data);
          }
        }}
      />
      {input && comparison.isFetching ? (
        <Text style={{ color: colors.secondary }}>Checking current listings…</Text>
      ) : null}
      {input && comparison.error ? (
        <Text accessibilityRole="alert" style={{ color: colors.error }}>
          {safeMessage(comparison.error)} Pull down to refresh, or remove unavailable hostels.
        </Text>
      ) : null}
      {input && comparison.data && !comparison.isFetching && !comparison.isError ? (
        <ScrollView horizontal contentContainerStyle={{ gap: metrics.lg }}>
          {comparison.data.map((item) => (
            <ComparisonColumn
              key={JSON.stringify([item.listing.branchId, input.range])}
              item={item}
              range={input.range}
              openListing={openListing}
            />
          ))}
        </ScrollView>
      ) : null}
    </View>
  );
}

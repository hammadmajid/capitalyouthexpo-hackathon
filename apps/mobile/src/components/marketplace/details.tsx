import { AppHeader } from '../navigation/header';
import { PullScrollView } from '../pull-refresh';
import { Skeleton } from '../loading/skeleton';
import { VisitRequest } from '../visit-request';
import { WaitlistJoin } from '../waitlist-join';
import { ChatStart } from '../chat-start';
import { PublicListingRules } from './rules';
import { PublicGallery } from './gallery';
import { NativePublicServices } from '../services/staff';
import { PublicFood } from '../menu/public-food';
import { PublicInventoryOptions } from './inventory-options';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NatureBackground } from '../visual-surfaces';
import { Modal, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { marketplaceDetails } from '@hsm/api-client';
import { mobileMarketplaceColors as colors, marketplaceMetrics as metrics } from '@hsm/ui';
import { client } from '../../lib/runtime';
import { safeMessage } from '../../lib/messages';
import { MarketplaceAction } from './action';
import { ShareHostel } from './share-hostel';
export function MarketplaceDetails({
  branchId,
  close,
  signIn,
  signedIn = false,
  actorId,
}: {
  branchId: string;
  close: () => void;
  signIn: () => void;
  signedIn?: boolean;
  actorId?: string;
}) {
  const listing = useQuery({
    queryKey: ['marketplace-details', branchId],
    queryFn: () => marketplaceDetails(client, branchId),
  });
  return (
    <Modal visible onRequestClose={close} presentationStyle="pageSheet">
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
        <NatureBackground />
        <PullScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{
            padding: metrics.xxl,
            gap: metrics.lg,
            width: '100%',
            maxWidth: 920,
            alignSelf: 'center',
          }}
        >
          <AppHeader title="Hostel details" onBack={close} />
          {listing.isPending ? <Skeleton kind="details" label="Loading hostel…" /> : null}
          {listing.isError ? (
            <View style={{ gap: metrics.md }}>
              <Text accessibilityRole="alert" style={{ color: colors.error }}>
                {safeMessage(listing.error)}
              </Text>
              <MarketplaceAction
                label="Try again"
                onPress={() => {
                  void listing.refetch();
                }}
              />
            </View>
          ) : null}
          {listing.data && !listing.isError ? (
            <>
              <Text
                accessibilityRole="header"
                style={{
                  color: colors.heading,
                  fontSize: metrics.headingSize,
                  fontFamily: 'PlusJakartaSans_700Bold',
                }}
              >
                {listing.data.name}
              </Text>
              <Text style={{ color: colors.primary }}>Verified property</Text>
              <ShareHostel key={branchId} branchId={branchId} />
              <Text style={{ color: colors.secondary }}>{listing.data.address}</Text>
              <PublicGallery key={'gallery:' + branchId} branchId={branchId} />
              <PublicInventoryOptions
                key={JSON.stringify([branchId, actorId])}
                branchId={branchId}
                {...(actorId ? { actorId } : {})}
              />
              <PublicListingRules key={'rules:' + branchId} branchId={branchId} />
              <PublicFood key={'food:' + branchId} branchId={branchId} />
              <NativePublicServices key={'services:' + branchId} branchId={branchId} />
              <VisitRequest
                branchId={branchId}
                slug={listing.data.slug}
                {...(actorId ? { actorId } : {})}
                signIn={signIn}
              />
              <WaitlistJoin branchId={branchId} {...(actorId ? { actorId } : {})} signIn={signIn} />
              <ChatStart branchId={branchId} {...(actorId ? { actorId } : {})} signIn={signIn} />
              {listing.data.description ? (
                <Text style={{ color: colors.heading }}>{listing.data.description}</Text>
              ) : null}
              {listing.data.publicPhone ? (
                <Text style={{ color: colors.secondary }}>{listing.data.publicPhone}</Text>
              ) : null}
              {listing.data.publicEmail ? (
                <Text style={{ color: colors.secondary }}>{listing.data.publicEmail}</Text>
              ) : null}
              <MarketplaceAction
                label={signedIn ? 'Booking profile' : 'Sign in to book'}
                onPress={signIn}
              />
            </>
          ) : null}
        </PullScrollView>
      </SafeAreaView>
    </Modal>
  );
}

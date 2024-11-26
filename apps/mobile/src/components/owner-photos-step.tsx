import type { ReactNode } from 'react';
import { View } from 'react-native';
import { ChefHat, ImageIcon, Images, ShieldAlert, UtensilsCrossed } from 'lucide-react-native';
import { mobileColors as colors, mobileSurfaces } from '@hsm/ui';
import { OwnerMediaGallery } from './owner-media-gallery';
import { SetupButton, SetupText } from './owner-wizard-ui';
// ROOM-002/003: hostel-wide photos only (cover, kitchen, dining, other). Room and bed photos are added
// on each room's own screen in Building & Rooms.
function PhotoCard({ children }: { children: ReactNode }) {
  return (
    <View
      style={mobileSurfaces.icyCard}
      className="gap-3 rounded-card border border-cardBorder p-4 frosted-card"
    >
      {children}
    </View>
  );
}
export function OwnerPhotosStep({
  actorId,
  branchId,
  next,
}: {
  actorId: string;
  branchId: string;
  next: () => void;
}) {
  return (
    <View style={{ gap: 14 }}>
      <PhotoCard>
        <OwnerMediaGallery
          actorId={actorId}
          branchId={branchId}
          section="cover"
          title="Display photo"
          Icon={ImageIcon}
          compact
        />
      </PhotoCard>
      {/* Kitchen and dining photos also show with the Food menu on the hostel page. */}
      <PhotoCard>
        <OwnerMediaGallery
          key="kitchen"
          actorId={actorId}
          branchId={branchId}
          roomId={undefined}
          section="kitchen"
          title="Kitchen"
          Icon={ChefHat}
          compact
        />
      </PhotoCard>
      <PhotoCard>
        <OwnerMediaGallery
          key="dining"
          actorId={actorId}
          branchId={branchId}
          roomId={undefined}
          section="dining"
          title="Dining area"
          Icon={UtensilsCrossed}
          compact
        />
      </PhotoCard>
      <PhotoCard>
        <OwnerMediaGallery
          key="hostel"
          actorId={actorId}
          branchId={branchId}
          roomId={undefined}
          section="general"
          title="Hostel photos"
          Icon={Images}
          compact
        />
      </PhotoCard>
      <SetupButton label="Save & Continue" onPress={next} />
      {/* SEC: identity documents never belong in listing photos. */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <ShieldAlert size={16} color={colors.secondary} />
        <SetupText muted>Private until approved · no CNIC or ID photos</SetupText>
      </View>
    </View>
  );
}

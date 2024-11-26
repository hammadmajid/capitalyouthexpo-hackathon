import { OwnerHeroImage } from './owner-hero-image';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Bell } from 'lucide-react-native';
import { ownerColors as c, ownerMetrics as m } from '@hsm/ui';

// OWN-001: Fixed, approved Owner hero. It is identical for empty, draft and active states.
// Approved mosque and supplied heading art stay separate from native controls.
export function OwnerDashboardHero({
  unread,
  bleed,
  onNotifications,
}: {
  name: string;
  bleed?: { top: number; horizontal: number; bottom: number };
  unread: number;
  onMenu: () => void;
  onNotifications: () => void;
}) {
  return (
    <View style={styles.hero}>
      <OwnerHeroImage {...(bleed ? { bleed } : {})} />
      <View style={styles.header}>
        <View style={styles.brandWrap}>
          <Text className="font-heading" style={styles.brand}>
            Dashboard
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={unread ? `Notifications, ${unread} unread` : 'Notifications'}
          onPress={onNotifications}
          style={styles.iconButton}
        >
          <Bell size={m.stepIcon} color={c.heading} />
          {unread > 0 ? <View style={styles.unread} /> : null}
        </Pressable>
      </View>
      <View style={styles.copy}>
        <Image
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          source={require('../../assets/owner-manage-hostel-heading.png')}
          accessible
          accessibilityRole="image"
          accessibilityLabel="Manage Your Hostel"
          resizeMode="contain"
          style={styles.headingArt}
        />
      </View>
    </View>
  );
}
const styles = StyleSheet.create({
  hero: {
    minHeight: 170,
    borderRadius: 0,
    overflow: 'visible',
    backgroundColor: 'transparent',
    padding: 4,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  brandWrap: { flex: 1 },
  brand: {
    color: c.heading,
    fontSize: 30,
    lineHeight: 38,
    fontWeight: '800',
    letterSpacing: -0.9,
    transform: [{ translateY: -16 }],
    textShadowColor: c.surface,
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 5,
  },
  iconButton: {
    width: m.touch - 4,
    height: m.touch - 4,
    borderRadius: m.touch,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.82)',
    borderWidth: 1,
    borderColor: c.border,
  },
  unread: {
    position: 'absolute',
    top: 8,
    right: 9,
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: c.danger,
    borderWidth: 1,
    borderColor: c.surface,
  },
  copy: {
    marginTop: 14,
    width: '58%',
    aspectRatio: 3,
    alignSelf: 'flex-start',
    transform: [{ translateX: -34 }],
  },
  headingArt: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: '100%',
    height: '100%',
  },
});

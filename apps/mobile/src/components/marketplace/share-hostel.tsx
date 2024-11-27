import { useState } from 'react';
import { Share, Text, View } from 'react-native';
import { publicHostelShareUrl } from '@hsm/api-client';
import { mobileMarketplaceColors as marketplaceColors } from '@hsm/ui';
import { config } from '../../lib/runtime';
import { Share2 } from 'lucide-react-native';
import { NavIconButton } from '../navigation/header';
export function ShareHostel({ branchId }: { branchId: string }) {
  const [busy, setBusy] = useState(false),
    [failed, setFailed] = useState(false);
  async function share() {
    if (busy) return;
    setBusy(true);
    setFailed(false);
    try {
      const url = publicHostelShareUrl(config.webUrl, branchId);
      await Share.share({
        title: 'HSM hostel summary',
        message: 'Public hostel summary: ' + url,
        url,
      });
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <View>
      <NavIconButton label="Share hostel with family" disabled={busy} onPress={() => void share()}>
        <Share2 color={marketplaceColors.primary} size={20} />
      </NavIconButton>
      {failed ? (
        <Text accessibilityRole="alert" style={{ color: marketplaceColors.error }}>
          Sharing unavailable. Please try again.
        </Text>
      ) : null}
    </View>
  );
}

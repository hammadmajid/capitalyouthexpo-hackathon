import { useEffect, useRef } from 'react';
import { AccessibilityInfo, Animated, Text, View } from 'react-native';
import { CircleCheck, CircleX } from 'lucide-react-native';
import { mobileColors as c } from '@hsm/ui';
import { residentStyles as s } from './resident-detail-ui';

export function PaymentDecision({ approved }: { approved: boolean }) {
  const progress = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    let active = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((reduced) => {
      if (!active) return;
      if (reduced) progress.setValue(1);
      else Animated.spring(progress, { toValue: 1, friction: 6, useNativeDriver: true }).start();
    });
    return () => {
      active = false;
      progress.stopAnimation();
    };
  }, [progress]);
  const Icon = approved ? CircleCheck : CircleX;
  return (
    <View accessibilityRole="alert" style={[s.card, { alignItems: 'center', padding: 18 }]}>
      <Animated.View
        style={{
          opacity: progress,
          transform: [
            { scale: progress.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) },
          ],
        }}
      >
        <Icon size={54} color={approved ? c.success : c.dangerText} />
      </Animated.View>
      <Text style={s.heading}>{approved ? 'Payment approved' : 'Payment rejected'}</Text>
      <Text style={s.body}>
        {approved
          ? 'Payment recorded and receipt issued.'
          : 'Proof rejected; the invoice remains unpaid.'}
      </Text>
    </View>
  );
}

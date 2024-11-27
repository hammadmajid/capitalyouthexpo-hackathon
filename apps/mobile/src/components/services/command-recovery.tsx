import { View } from 'react-native';
import { Copy } from '../ui';
import { MarketplaceAction } from '../marketplace/action';
export function NativeCommandRecovery({
  command,
}: {
  command: {
    unresolved: boolean;
    isPending: boolean;
    retryOriginal: () => void;
  };
}) {
  if (!command.unresolved) return null;
  return (
    <View>
      <Copy>A previous request is unresolved. Retry sends its original details.</Copy>
      <MarketplaceAction
        secondary
        label="Retry previous request"
        disabled={command.isPending}
        onPress={command.retryOriginal}
      />
    </View>
  );
}

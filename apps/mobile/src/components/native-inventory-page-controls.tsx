import { View } from 'react-native';
import { Button } from './ui';
export function NativeInventoryPageControls({
  label,
  current,
  next,
  disabled,
  onFirst,
  onNext,
}: {
  label: string;
  current: boolean;
  next: boolean;
  disabled: boolean;
  onFirst: () => void;
  onNext: () => void;
}) {
  return (
    <View className="gap-2">
      {current ? (
        <Button
          secondary
          label={'First ' + label + ' page'}
          disabled={disabled}
          onPress={onFirst}
        />
      ) : null}
      {next ? (
        <Button secondary label={'Next ' + label + ' page'} disabled={disabled} onPress={onNext} />
      ) : null}
    </View>
  );
}

import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { MapPin, Plus, X } from 'lucide-react-native';
import type { TransportDestination } from '@hsm/contracts';
import { mobileColors as c, mobileSurfaces } from '@hsm/ui';
import { usePlaceSuggestions } from '../marketplace/place-suggestions';
type Kind = TransportDestination['kind'];
// The server accepts a catalog place only under its matching kind; anything else is custom.
const kindOf: Record<string, Kind> = {
  university: 'university',
  school: 'university',
  office: 'office',
  business_hub: 'office',
  government: 'office',
  locality: 'area',
};
// CHG-049: just "available at": search the HSM places list or type a name; the kind is
// worked out from the place, so the owner never picks a category.
export function DestinationPicker(props: {
  value: TransportDestination[];
  onChange: (value: TransportDestination[]) => void;
  disabled?: boolean;
}) {
  const [text, setText] = useState('');
  const search = usePlaceSuggestions(text);
  const disabled = Boolean(props.disabled);
  function add(item: TransportDestination) {
    if (props.value.some((row) => row.name.toLowerCase() === item.name.toLowerCase())) return;
    props.onChange([...props.value, item]);
    setText('');
  }
  const typed = text.trim();
  const matches = (search.data?.data ?? []).slice(0, 5);
  return (
    <View style={{ gap: 8 }}>
      {props.value.map((item, index) => (
        <View
          key={index + item.name}
          style={[
            mobileSurfaces.icyCard,
            {
              flexDirection: 'row',
              alignItems: 'center',
              gap: 10,
              borderWidth: 1,
              borderRadius: 14,
              paddingHorizontal: 12,
              paddingVertical: 10,
            },
          ]}
        >
          <MapPin color={c.primary} size={20} />
          <Text numberOfLines={1} style={{ flex: 1, color: c.heading, fontSize: 16 }}>
            {item.name}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={'Remove ' + item.name}
            disabled={disabled}
            hitSlop={8}
            onPress={() => props.onChange(props.value.filter((_, at) => at !== index))}
            style={{ padding: 4 }}
          >
            <X color={c.dangerText} size={20} />
          </Pressable>
        </View>
      ))}
      <TextInput
        accessibilityLabel="Add a destination"
        placeholder="Add a place, e.g. Comsats"
        placeholderTextColor={c.secondary}
        value={text}
        editable={!disabled}
        onChangeText={setText}
        maxLength={120}
        className="min-h-12 rounded-input border border-border bg-inputSurface px-4 text-text"
      />
      {matches.map((place) => {
        const kind = kindOf[place.type];
        return (
          <Pressable
            key={place.id}
            accessibilityRole="button"
            accessibilityLabel={'Add ' + place.name}
            disabled={disabled}
            onPress={() =>
              add(
                kind
                  ? { kind, name: place.name, placeId: place.id, areaId: null }
                  : { kind: 'other', name: place.name, placeId: null, areaId: null },
              )
            }
            style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 }}
          >
            <Plus color={c.primary} size={18} />
            <Text style={{ color: c.heading }}>{place.name}</Text>
          </Pressable>
        );
      })}
      {typed.length >= 2 &&
      !matches.some((place) => place.name.toLowerCase() === typed.toLowerCase()) ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={'Add ' + typed}
          disabled={disabled}
          onPress={() => add({ kind: 'other', name: typed, placeId: null, areaId: null })}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 }}
        >
          <Plus color={c.primary} size={18} />
          <Text style={{ color: c.primary, fontWeight: '700' }}>Add “{typed}”</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

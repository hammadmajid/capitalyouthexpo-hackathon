import { useEffect, useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Mail, Phone, User } from 'lucide-react-native';
import { updateResidentContact } from '@hsm/api-client';
import { residentContactUpdateSchema } from '@hsm/contracts';
import { mobileColors as colors, mobileSurfaces } from '@hsm/ui';
import { actorClient } from '../lib/runtime';
import { safeMessage } from '../lib/messages';
import { stayWorkspaceKeys } from '../lib/stay-workspace-keys';
import { AppHeader } from './navigation/header';
import { Button, Copy } from './ui';
const input =
  'min-h-12 flex-1 rounded-input border border-border bg-inputSurface px-4 font-body text-body text-text';
// Local 03XXXXXXXXX is stored in the +92 form the server requires.
export function toE164(value: string) {
  const digits = value.replace(/[\s-]/g, '');
  if (!digits) return null;
  if (/^0[0-9]{10}$/.test(digits)) return '+92' + digits.slice(1);
  if (/^92[0-9]{10}$/.test(digits)) return '+' + digits;
  return digits;
}
function Row(props: {
  Icon: typeof User;
  label: string;
  value: string;
  onChange: (value: string) => void;
  keyboard?: 'phone-pad' | 'email-address';
  placeholder: string;
  hint: string;
}) {
  return (
    <View className="gap-1">
      <Text className="font-body text-sm text-secondary">{props.hint}</Text>
      <View className="flex-row items-center gap-2">
        <props.Icon size={20} color={colors.primary} />
        <TextInput
          accessibilityLabel={props.label}
          value={props.value}
          onChangeText={props.onChange}
          placeholder={props.placeholder}
          placeholderTextColor={colors.secondary}
          keyboardType={props.keyboard ?? 'default'}
          autoCapitalize={props.keyboard === 'email-address' ? 'none' : 'words'}
          maxLength={props.keyboard === 'email-address' ? 254 : 120}
          className={input}
        />
      </View>
    </View>
  );
}
// RES-006: staff correct an offline resident's name and contact; the server audits it and
// refuses linked residents, who manage their own account details (CHG-009).
export function ResidentEdit(props: {
  actorId: string;
  branchId: string;
  residentId: string;
  name: string;
  phone: string | null;
  email: string | null;
  onClose: () => void;
  onPendingChange?: ((pending: boolean) => void) | undefined;
}) {
  const cache = useQueryClient();
  const [name, setName] = useState(props.name),
    [phone, setPhone] = useState(props.phone ?? ''),
    [email, setEmail] = useState(props.email ?? '');
  const parsed = residentContactUpdateSchema.safeParse({
    displayName: name,
    phone: toE164(phone),
    email: email.trim() ? email : null,
  });
  const save = useMutation({
    mutationFn: async () => {
      if (!parsed.success) throw new Error('Invalid resident details');
      return updateResidentContact(
        await actorClient(props.actorId),
        props.branchId,
        props.residentId,
        parsed.data,
      );
    },
    onSuccess: async () => {
      await Promise.allSettled(
        stayWorkspaceKeys(props.actorId, props.branchId).map((queryKey) =>
          cache.invalidateQueries({ queryKey }),
        ),
      );
      props.onClose();
    },
  });
  useEffect(() => {
    props.onPendingChange?.(save.isPending);
  }, [props.onPendingChange, save.isPending]);
  return (
    <View className="gap-3" accessibilityLabel="Edit resident">
      <AppHeader
        title="Edit resident"
        backLabel="Cancel resident edit"
        backDisabled={save.isPending}
        onBack={props.onClose}
      />
      <View
        style={mobileSurfaces.icyCard}
        className="gap-3 rounded-input border border-border p-3 frosted-card"
      >
        <Row
          Icon={User}
          label="Resident name"
          hint="Name"
          placeholder="Name"
          value={name}
          onChange={setName}
        />
        <Row
          Icon={Phone}
          label="Resident phone"
          hint="Phone"
          placeholder="03XX XXXXXXX"
          keyboard="phone-pad"
          value={phone}
          onChange={setPhone}
        />
        <Row
          Icon={Mail}
          label="Resident email"
          hint="Email"
          placeholder="Email (optional)"
          keyboard="email-address"
          value={email}
          onChange={setEmail}
        />
      </View>
      {!parsed.success && name.trim() ? (
        <Text className="font-body text-sm text-secondary">Phone 03XXXXXXXXX · valid email</Text>
      ) : null}
      {save.isError ? <Copy alert>{safeMessage(save.error)}</Copy> : null}
      <Button
        label={save.isPending ? 'Saving…' : 'Save'}
        disabled={!parsed.success || save.isPending}
        onPress={() => save.mutate()}
      />
    </View>
  );
}

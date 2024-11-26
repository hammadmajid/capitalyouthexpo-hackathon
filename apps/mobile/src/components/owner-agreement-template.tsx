import { useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { readBillingSettings, saveAgreementTemplate } from '@hsm/api-client';
import { agreementTemplateSchema, type AgreementTemplateInput } from '@hsm/contracts';
import { actorClient } from '../lib/runtime';
import { safeMessage } from '../lib/messages';
import { PrivateFilePicker } from './private-file-picker';
import { useNativeCommand } from './services/use-command';
import { NativeCommandRecovery } from './services/command-recovery';
import { Skeleton } from './loading/skeleton';
import { SetupButton, SetupCard, SetupText } from './owner-wizard-ui';
import { IconHead } from './owner-icon-head';
import { FileText, Paperclip, Pencil, Trash2, X } from 'lucide-react-native';
import { IconChip, InvFact } from './inventory-tools';
import { mobileColors } from '@hsm/ui';
const field =
  'min-h-12 rounded-input border border-border bg-inputSurface px-4 py-3 font-body text-body text-text';
type Edit = { base: string; title: string; text: string; fileId: string | null };
export function OwnerAgreementTemplate({
  actorId,
  branchId,
  accessUnavailable = false,
}: {
  actorId: string;
  branchId: string;
  accessUnavailable?: boolean;
}) {
  const [editing, setEditing] = useState<Edit>(),
    [uploading, setUploading] = useState(false),
    [message, setMessage] = useState('');
  const query = useQuery({
    queryKey: ['billing-policy', actorId, branchId, 'branch'],
    retry: false,
    enabled: !accessUnavailable,
    queryFn: async () => readBillingSettings(await actorClient(actorId), { branchId }),
  });
  const command = useNativeCommand<AgreementTemplateInput>(
    'agreement-template:' + branchId,
    actorId,
    (client, body, key) => saveAgreementTemplate(client, branchId, body, key),
    [
      ['billing-policy', actorId, branchId],
      ['manual-admission-policy', actorId, branchId],
    ],
  );
  const current = !query.isError ? query.data?.effectiveVersion : undefined,
    editable = !query.isError && query.data?.canEdit === true,
    busy = uploading || command.isPending || command.unresolved,
    conflict = Boolean(editing && current && editing.base !== current.id);
  function start() {
    if (!current || !editable || busy) return;
    const template = current.policy.agreementTemplate;
    setEditing({
      base: current.id,
      title: template?.title ?? '',
      text: template?.text ?? '',
      fileId: template?.fileId ?? null,
    });
    setMessage('');
  }
  async function save(remove = false) {
    if (!editing || !editable || busy || conflict) return;
    const template = agreementTemplateSchema.safeParse({
      title: editing.title,
      text: editing.text,
      fileId: editing.fileId,
    });
    if (!remove && !template.success) {
      setMessage('Add a title and agreement terms or document.');
      return;
    }
    try {
      await command.mutateAsync({
        policyVersionId: editing.base,
        template: remove ? null : (template.data ?? null),
      });
      setEditing(undefined);
      setMessage('Agreement version saved.');
    } catch {
      /* Existing recovery retains the original command. */
    }
  }
  if (accessUnavailable) return <SetupText>Branch access unavailable</SetupText>;
  return (
    <SetupCard>
      <IconHead Icon={FileText} title="Agreement" note="Template for new stays" />
      {query.isPending ? <Skeleton kind="details" label="Loading agreement template" /> : null}
      {query.error || command.error ? (
        <SetupText>{safeMessage(query.error ?? command.error)}</SetupText>
      ) : null}
      <NativeCommandRecovery command={command} />
      {!current && !query.isPending && !query.error ? (
        <SetupText>Save a rent policy first.</SetupText>
      ) : null}
      {current && !editing ? (
        <>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
            <View style={{ flex: 1, gap: 4 }}>
              <Text className="font-heading text-body text-heading">
                {current.policy.agreementTemplate?.title ?? 'No agreement template'}
              </Text>
              {current.policy.agreementTemplate?.text ? (
                <Text className="font-body text-sm text-secondary" numberOfLines={3}>
                  {current.policy.agreementTemplate.text}
                </Text>
              ) : null}
              {current.policy.agreementTemplate?.fileId ? (
                <InvFact Icon={Paperclip}>Document attached</InvFact>
              ) : null}
            </View>
            {editable ? (
              <IconChip
                Icon={Pencil}
                label="Edit agreement template"
                onPress={start}
                disabled={busy}
              />
            ) : null}
          </View>
        </>
      ) : null}
      {editing && editable ? (
        <View className="gap-3">
          {/* One row: what is being edited, remove (only when a template exists), close. */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text className="flex-1 font-heading text-body text-heading">Edit agreement</Text>
            {current?.policy.agreementTemplate ? (
              <IconChip
                Icon={Trash2}
                label="Remove future template"
                disabled={busy || conflict}
                onPress={() => void save(true)}
              />
            ) : null}
            <IconChip
              Icon={X}
              label="Cancel agreement edit"
              disabled={busy}
              onPress={() => setEditing(undefined)}
            />
          </View>
          <TextInput
            accessibilityLabel="Agreement title"
            placeholder="Title"
            placeholderTextColor={mobileColors.secondary}
            className={field}
            value={editing.title}
            maxLength={120}
            onChangeText={(title) => setEditing({ ...editing, title })}
            editable={!command.isPending}
          />
          <TextInput
            accessibilityLabel="Agreement terms"
            placeholder="Terms (optional)"
            placeholderTextColor={mobileColors.secondary}
            className={field}
            style={{ minHeight: 110 }}
            value={editing.text}
            multiline
            textAlignVertical="top"
            maxLength={12000}
            onChangeText={(text) => setEditing({ ...editing, text })}
            editable={!command.isPending}
          />
          {editing.fileId ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={{ flex: 1 }}>
                <InvFact Icon={Paperclip}>Document attached</InvFact>
              </View>
              <IconChip
                Icon={X}
                label="Remove attached template"
                disabled={busy}
                onPress={() => setEditing({ ...editing, fileId: null })}
              />
            </View>
          ) : (
            <PrivateFilePicker
              actorId={actorId}
              purpose="agreement_template"
              label="agreement document"
              hideLabel
              hideHint
              onBusy={setUploading}
              disabled={busy}
              onReady={(fileId) => {
                if (fileId) setEditing((value) => (value ? { ...value, fileId } : value));
              }}
            />
          )}
          {conflict ? (
            <SetupText>Policy changed. Reopen the editor before saving.</SetupText>
          ) : null}
          <SetupButton label="Save" disabled={busy || conflict} onPress={() => void save()} />
        </View>
      ) : null}
      {message ? <SetupText>{message}</SetupText> : null}
    </SetupCard>
  );
}

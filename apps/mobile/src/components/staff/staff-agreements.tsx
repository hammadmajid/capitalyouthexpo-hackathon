import { useState } from 'react';
import { Linking, Pressable, Text, View } from 'react-native';
import { FileText } from 'lucide-react-native';
import { createStaffAgreement, staffAgreementFile } from '@hsm/api-client';
import type { StaffDetail } from '@hsm/contracts';
import { mobileColors as c } from '@hsm/ui';
import { actorClient } from '../../lib/runtime';
import { safeMessage } from '../../lib/messages';
import { PrivateFilePicker } from '../private-file-picker';
import { SetupButton } from '../owner-wizard-ui';
import { DateField } from '../date-field';
import { Field, Panel, pkr, todayKarachi, useStaffCommand } from './staff-shared';
// CHG-039: versioned staff agreements. Text and scans need payroll access; older versions stay
// read-only. A scanned copy is a private file, not proof of a digital signature.
export function StaffAgreements(props: { actorId: string; branchId: string; detail: StaffDetail }) {
  const { detail } = props;
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string>();
  if (!detail.payroll && !detail.agreements.length) return null;
  async function open(agreementId: string) {
    setError(undefined);
    try {
      const file = await staffAgreementFile(
        await actorClient(props.actorId),
        props.branchId,
        agreementId,
      );
      await Linking.openURL(file.url);
    } catch (failure) {
      setError(safeMessage(failure));
    }
  }
  return (
    <Panel>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <FileText color={c.primary} size={20} />
        <Text style={{ flex: 1, color: c.heading, fontSize: 17, fontWeight: '700' }}>
          Agreement
        </Text>
      </View>
      {detail.agreements.map((a, index) => (
        <View key={a.id} style={{ gap: 4, opacity: index ? 0.7 : 1 }}>
          <Text style={{ color: c.heading, fontWeight: '600' }}>
            {a.title} · v{a.version} · from {a.effectiveOn}
            {index ? ' (old)' : ''}
          </Text>
          {a.body ? <Text style={{ color: c.text }}>{a.body}</Text> : null}
          {a.hasFile ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={'Open scanned copy of ' + a.title}
              onPress={() => void open(a.id)}
            >
              <Text style={{ color: c.primary }}>Open scanned copy</Text>
            </Pressable>
          ) : null}
        </View>
      ))}
      {error ? <Text style={{ color: c.dangerText }}>{error}</Text> : null}
      {detail.payroll ? (
        adding ? (
          <NewAgreement {...props} close={() => setAdding(false)} />
        ) : (
          <SetupButton
            secondary
            label={detail.agreements.length ? 'New version' : 'Add agreement'}
            onPress={() => setAdding(true)}
          />
        )
      ) : null}
    </Panel>
  );
}
function NewAgreement(props: {
  actorId: string;
  branchId: string;
  detail: StaffDetail;
  close: () => void;
}) {
  const { detail } = props;
  const terms = detail.terms[0];
  const [title, setTitle] = useState('Employment agreement');
  const [body, setBody] = useState(
    terms ? 'Monthly salary ' + pkr(terms.amountPaisa) + ', paid on day ' + terms.dueDay + '.' : '',
  );
  const [effectiveOn, setEffective] = useState(todayKarachi());
  const [fileId, setFileId] = useState<string>();
  const [uploading, setUploading] = useState(false);
  const save = useStaffCommand<Record<string, unknown>>(
    'staff-agreement:' + detail.staff.id,
    props.actorId,
    props.branchId,
    (client, input, key) =>
      createStaffAgreement(client, props.branchId, detail.staff.id, input, key),
  );
  return (
    <View style={{ gap: 8 }}>
      <Field label="Title" value={title} onChangeText={setTitle} maxLength={120} />
      <Field label="Terms" value={body} onChangeText={setBody} multiline maxLength={5000} />
      <DateField label="Effective date" value={effectiveOn} onChange={setEffective} />
      <PrivateFilePicker
        label="Scanned copy (optional)"
        actorId={props.actorId}
        purpose="staff_agreement"
        onReady={setFileId}
        onBusy={setUploading}
      />
      {save.isError ? <Text style={{ color: c.dangerText }}>{safeMessage(save.error)}</Text> : null}
      <SetupButton
        label={save.isPending ? 'Saving…' : 'Save agreement'}
        disabled={save.isPending || uploading}
        onPress={() =>
          save.mutate(
            { title: title.trim(), body: body.trim(), effectiveOn, ...(fileId ? { fileId } : {}) },
            { onSuccess: props.close },
          )
        }
      />
      <SetupButton secondary label="Cancel" onPress={props.close} />
    </View>
  );
}

import { useState } from 'react';
import { listChatReports, readChatSafetyContext } from '@hsm/api-client';
import { reportStatusSchema } from '@hsm/contracts';
import { useStaffPages } from './staff-data';
import { useSensitiveRead } from './sensitive-read';
import { Text } from 'react-native';
import { Eye, Flag, Lock, X } from 'lucide-react-native';
import { StaffPage, Choices, ReadState, Continuation, sentence } from './staff-ui';
import { AdminCard, AdminField } from './ui';
import { ActionButton, ButtonRow, Fact, RecordRow, pkTime } from './admin-list';
import { Copy } from '../ui';
type Case = { reportId: string; messageId: string };
export function AdminSafety() {
  const [status, setStatus] = useState<'open' | 'investigating' | 'actioned' | 'dismissed'>('open');
  const [selected, setSelected] = useState<Case>();
  const [purpose, setPurpose] = useState('');
  const list = useStaffPages(
    'safety-cases',
    (c, cursor) =>
      listChatReports(c, {
        status,
        ...(cursor ? { cursor } : {}),
        limit: 20,
      }),
    { status },
  );
  const access = useSensitiveRead('safety', async (c, input: Case & { justification: string }) => {
    const result = await readChatSafetyContext(c, input.reportId, {
      justification: input.justification,
    });
    if (result.reportedMessageId !== input.messageId) throw new Error('Case evidence unavailable');
    return result;
  });
  function clear() {
    setSelected(undefined);
    setPurpose('');
    access.reset();
  }
  return (
    <StaffPage title="Chat reports">
      <Choices
        label="Case status"
        values={reportStatusSchema.options}
        value={status}
        disabled={access.isPending}
        onChange={(next) => {
          clear();
          setStatus(next);
        }}
      />
      <ReadState query={list} empty={list.rows.length === 0} />
      {list.rows.map((row) => (
        <RecordRow
          key={row.id}
          icon={Flag}
          title={sentence(row.reason)}
          subtitle={pkTime(row.createdAt)}
          body={row.details}
          status={row.status}
          label="Review reported message"
          {...(access.isPending
            ? {}
            : {
                onPress: () => {
                  access.reset();
                  setPurpose('');
                  setSelected({ reportId: row.id, messageId: row.targetId });
                },
              })}
        />
      ))}
      <Continuation query={list} />
      {selected ? (
        <AdminCard>
          <Fact icon={Lock}>Reported message ± 2 · attachments withheld · audited</Fact>
          <AdminField
            label="Investigation purpose"
            value={purpose}
            onChange={setPurpose}
            disabled={access.isPending}
          />
          <ButtonRow>
            <ActionButton
              icon={X}
              text="Close"
              label="Close sensitive context"
              onPress={clear}
              disabled={access.isPending}
            />
            <ActionButton
              icon={Eye}
              text={access.isPending ? 'Checking…' : 'View'}
              label="Authorize audited context access"
              tone="solid"
              disabled={!purpose.trim() || access.isPending}
              onPress={() => {
                access.mutate({ ...selected, justification: purpose.trim() });
                setPurpose('');
              }}
            />
          </ButtonRow>
          {access.isError ? (
            <Copy alert>Context unavailable. Recheck your purpose and current access.</Copy>
          ) : null}
          {access.data?.reportId === selected.reportId
            ? access.data.messages.map((message) => (
                <AdminCard key={message.id}>
                  <Text className="font-heading text-sm text-secondary">
                    {sentence(message.senderSide)}
                    {message.removed ? ' · Removed' : ''}
                    {message.attachmentCount ? ' · ' + message.attachmentCount + ' withheld' : ''}
                  </Text>
                  <Copy>{message.body ?? 'No text content'}</Copy>
                </AdminCard>
              ))
            : null}
        </AdminCard>
      ) : null}
    </StaffPage>
  );
}

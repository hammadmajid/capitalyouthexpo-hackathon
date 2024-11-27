import { WorkflowTabs, StatusBadge } from './management-ui';
import { useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { actOnSupportTicket, readAdminSupportMessages, readSupportTicket } from '@hsm/api-client';
import {
  supportStaffInputSchema,
  supportStatusSchema,
  supportPrioritySchema,
  supportTicketSchema,
} from '@hsm/contracts';
import type { z } from 'zod';
import { useStaffPages, useStaffRecord } from './staff-data';
import { StaffPage, Choices, ReadState, Continuation, sentence } from './staff-ui';
import { ArrowRight, Eye, Headset, Lock, Send, Tag, User, UserCheck, X } from 'lucide-react-native';
import { ActionButton, ButtonRow, Fact, pkTime } from './admin-list';
import { AdminCard, AdminField, AdminHeading } from './ui';
import { useAdminCommand } from './data';
import { NativeCommandRecovery } from '../services/command-recovery';
import { Copy } from '../ui';
import { safeMessage } from '../../lib/messages';
export function SupportDetail() {
  const params = useLocalSearchParams<{ ticketId?: string }>();
  const ticketId = typeof params.ticketId === 'string' ? params.ticketId : '';
  const detail = useStaffRecord('support-ticket', ticketId, (c) => readSupportTicket(c, ticketId));
  const thread = useStaffPages(
    'support-thread',
    (c, cursor) =>
      readAdminSupportMessages(c, ticketId, {
        limit: 50,
        ...(cursor ? { cursor } : {}),
      }),
    { ticketId },
  );
  return (
    <StaffPage title="Support ticket">
      <ReadState query={detail} />
      {detail.record ? (
        <>
          <AdminCard>
            <AdminHeading>{detail.record.subject}</AdminHeading>
            <StatusBadge value={detail.record.status} />
            <Fact icon={Tag}>
              {sentence(detail.record.priority)} · {sentence(detail.record.category)}
            </Fact>
            <Fact icon={User}>{detail.record.openedByName}</Fact>
            <Fact icon={UserCheck}>{detail.record.assignedToName ?? 'Unassigned'}</Fact>
          </AdminCard>
          <WorkflowTabs
            sections={[
              {
                title: 'Reply',
                content: (
                  <>
                    <SupportActions
                      key={detail.record.id + ':' + detail.record.version}
                      ticket={detail.record}
                    />
                  </>
                ),
              },
              {
                title: 'Conversation',
                content: (
                  <>
                    <ReadState query={thread} empty={thread.rows.length === 0} />
                    {thread.rows.map((message) => (
                      <AdminCard key={message.id}>
                        <Fact icon={message.internal ? Lock : message.fromSupport ? Headset : User}>
                          {(message.internal ? 'Staff note · ' : '') +
                            message.authorName +
                            ' · ' +
                            pkTime(message.createdAt)}
                        </Fact>
                        <Copy>{message.body}</Copy>
                      </AdminCard>
                    ))}
                    <Continuation query={thread} />
                  </>
                ),
              },
            ]}
          />
        </>
      ) : null}
    </StaffPage>
  );
}
function SupportActions({ ticket }: { ticket: z.infer<typeof supportTicketSchema> }) {
  const [body, setBody] = useState('');
  const [kind, setKind] = useState<'reply' | 'internal_note'>('reply');
  const [status, setStatus] = useState(ticket.status);
  const [priority, setPriority] = useState(ticket.priority);
  const [assign, setAssign] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const command = useAdminCommand(
    'Admin:support:' + ticket.id,
    (c, input: z.infer<typeof supportStaffInputSchema>, key) =>
      actOnSupportTicket(c, ticket.id, input, key),
    false,
    'support',
  );
  const locked = command.isPending || command.unresolved;
  const changed = Boolean(
    body.trim() || assign || status !== ticket.status || priority !== ticket.priority,
  );
  const input = {
    expectedVersion: ticket.version,
    ...(status !== ticket.status ? { status } : {}),
    ...(priority !== ticket.priority ? { priority } : {}),
    ...(assign ? { assignToMe: true } : {}),
    ...(body.trim() ? { body: body.trim() } : {}),
    internal: kind === 'internal_note',
  };
  return (
    <AdminCard>
      <NativeCommandRecovery command={command} />
      {command.isError ? <Copy alert>{safeMessage(command.error)}</Copy> : null}
      {confirm ? (
        <>
          <Fact icon={kind === 'internal_note' ? Lock : Eye}>
            {kind === 'internal_note' ? 'Staff only' : 'Visible to participant'}
          </Fact>
          {body.trim() ? <Copy>{body.trim()}</Copy> : null}
          <Fact icon={Tag}>
            {sentence(status)} · {sentence(priority)}
            {assign ? ' · Assigned to me' : ''}
          </Fact>
          <ButtonRow>
            <ActionButton
              icon={X}
              text="Cancel"
              label="Cancel support action"
              disabled={locked}
              onPress={() => setConfirm(false)}
            />
            <ActionButton
              icon={Send}
              text={kind === 'internal_note' ? 'Add note' : 'Send'}
              label="Confirm support action"
              tone="solid"
              disabled={locked || !changed}
              onPress={() => {
                const parsed = supportStaffInputSchema.safeParse(input);
                if (parsed.success) command.mutate(parsed.data);
              }}
            />
          </ButtonRow>
        </>
      ) : (
        <>
          <Choices
            label="Message visibility"
            values={['reply', 'internal_note']}
            labels={{ reply: 'Reply', internal_note: 'Staff note' }}
            value={kind}
            onChange={setKind}
            disabled={locked}
          />
          <AdminField
            label={kind === 'internal_note' ? 'Internal note' : 'Staff reply'}
            value={body}
            onChange={setBody}
            multiline
            maxLength={4000}
            disabled={locked}
          />
          <Choices
            label="New ticket status"
            values={supportStatusSchema.options}
            value={status}
            onChange={setStatus}
            disabled={locked}
          />
          <Choices
            label="New ticket priority"
            values={supportPrioritySchema.options}
            value={priority}
            onChange={setPriority}
            disabled={locked}
          />
          <ButtonRow>
            <ActionButton
              icon={UserCheck}
              text={assign ? 'Assigned to me' : 'Assign to me'}
              label={assign ? 'Selected: Assign to me' : 'Assign to me'}
              tone={assign ? 'solid' : 'outline'}
              disabled={locked}
              onPress={() => setAssign(!assign)}
            />
            <ActionButton
              icon={ArrowRight}
              text="Review"
              label="Review support action"
              tone="solid"
              disabled={locked || !changed}
              onPress={() => setConfirm(true)}
            />
          </ButtonRow>
        </>
      )}
    </AdminCard>
  );
}

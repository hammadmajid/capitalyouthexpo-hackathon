import { useState } from 'react';
import { createAnnouncement } from '@hsm/api-client';
import { announcementInputSchema, karachiLocalInstantSchema } from '@hsm/contracts';
import type { z } from 'zod';
import { useAdminCommand } from './data';
import { StaffPage, Choices } from './staff-ui';
import { AdminCard, AdminField, AdminHeading } from './ui';
import { AnnouncementHistory } from './announcement-history';
import { NativeCommandRecovery } from '../services/command-recovery';
import { Copy } from '../ui';
import { Check, Clock, Eye, Pencil, Send, Users } from 'lucide-react-native';
import { ActionButton, ButtonRow, Fact } from './admin-list';
import { safeMessage } from '../../lib/messages';
import { audienceLabels, type Audience } from './announcement-audience';
export function AdminAnnouncements() {
  return (
    <StaffPage title="Announcements">
      <AnnouncementComposer />
      <AnnouncementHistory />
    </StaffPage>
  );
}
function AnnouncementComposer() {
  const [audience, setAudience] = useState<Audience>('all_managers');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [targets, setTargets] = useState('');
  const [schedule, setSchedule] = useState('');
  const [preview, setPreview] = useState(false);
  const [invalid, setInvalid] = useState(false);
  const command = useAdminCommand(
    'Admin:announcement-create',
    (c, input: z.infer<typeof announcementInputSchema>, key) => createAnnouncement(c, input, key),
    false,
    'announcements',
  );
  const locked = command.isPending || command.unresolved;
  function parse() {
    const local = schedule.trim();
    const scheduleResult = local ? karachiLocalInstantSchema.safeParse(local) : undefined;
    if (scheduleResult && !scheduleResult.success) return undefined;
    const date = scheduleResult?.success ? new Date(scheduleResult.data) : undefined;
    if (date && (!Number.isFinite(date.getTime()) || date.getTime() <= Date.now()))
      return undefined;
    const parsed = announcementInputSchema.safeParse({
      audience,
      title,
      body,
      branchIds:
        audience === 'selected_branches'
          ? targets
              .split(',')
              .map((v) => v.trim())
              .filter(Boolean)
          : [],
      ...(audience === 'city' ? { cityId: targets.trim() } : {}),
      ...(date ? { scheduledAt: date.toISOString() } : {}),
    });
    return parsed.success ? parsed.data : undefined;
  }
  return (
    <AdminCard>
      <AdminHeading>New announcement</AdminHeading>
      <NativeCommandRecovery command={command} />
      {command.isError ? <Copy alert>{safeMessage(command.error)}</Copy> : null}
      {command.isSuccess ? <Fact icon={Check}>Saved</Fact> : null}
      {preview ? (
        <>
          <AdminHeading>{title}</AdminHeading>
          <Copy>{body}</Copy>
          <Fact icon={Users}>
            {audienceLabels[audience]}
            {targets ? ' · ' + targets : ''}
          </Fact>
          <Fact icon={Clock}>{schedule ? schedule.replace('T', ' ') + ' PKT' : 'Send now'}</Fact>
          <ButtonRow>
            <ActionButton
              icon={Pencil}
              text="Edit"
              label="Edit announcement"
              disabled={locked}
              onPress={() => setPreview(false)}
            />
            <ActionButton
              icon={Send}
              text={schedule ? 'Schedule' : 'Send'}
              label="Confirm announcement"
              tone="solid"
              disabled={locked}
              onPress={() => {
                const parsed = parse();
                if (!parsed) {
                  setInvalid(true);
                  setPreview(false);
                  return;
                }
                command.mutate(parsed, {
                  onSuccess: () => {
                    setPreview(false);
                    setTitle('');
                    setBody('');
                  },
                });
              }}
            />
          </ButtonRow>
        </>
      ) : (
        <>
          <Choices
            label="Announcement audience"
            values={['all_managers', 'selected_branches', 'customers', 'city']}
            labels={audienceLabels}
            value={audience}
            disabled={locked}
            onChange={(next) => {
              setAudience(next);
              setTargets('');
            }}
          />
          {audience === 'selected_branches' || audience === 'city' ? (
            <AdminField
              label={audience === 'city' ? 'City ID' : 'Branch IDs (comma separated)'}
              value={targets}
              onChange={setTargets}
              maxLength={8000}
              disabled={locked}
            />
          ) : null}
          <AdminField
            label="Title"
            value={title}
            onChange={setTitle}
            maxLength={120}
            disabled={locked}
          />
          <AdminField
            label="Message"
            value={body}
            onChange={setBody}
            maxLength={2000}
            multiline
            disabled={locked}
          />
          <AdminField
            label="Schedule (YYYY-MM-DDTHH:mm, PKT)"
            value={schedule}
            onChange={setSchedule}
            maxLength={16}
            disabled={locked}
          />
          {invalid ? (
            <Copy alert>Check the title, message, audience IDs and future Pakistan schedule.</Copy>
          ) : null}
          <ActionButton
            icon={Eye}
            text="Preview"
            label="Preview announcement"
            tone="solid"
            disabled={locked}
            onPress={() => {
              const parsed = parse();
              setInvalid(!parsed);
              if (parsed) setPreview(true);
            }}
          />
        </>
      )}
    </AdminCard>
  );
}

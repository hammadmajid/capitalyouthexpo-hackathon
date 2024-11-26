'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { readBookingSettings, saveBookingSettings } from '@hsm/api-client';
import { platformBookingSettingsSchema } from '@hsm/contracts';
import type { z } from 'zod';
import { BookingPolicyEditor } from '../booking-policy-editor';
import { BookingPolicySummary } from '../booking-policy-summary';
import { Button } from '../ui/button';
import { useCommand } from '../services/use-command';
import { CommandRecovery } from '../services/command-recovery';
import { errorMessage } from '../../lib/messages';
import {
  OperationConfirmation,
  OperationSection,
  OperationState,
  useOperationScope,
} from './admin-operations';
export function RootPolicyAdministration({ actorId }: { actorId: string }) {
  const scope = useOperationScope(actorId, 'booking-policy', 'root');
  const [editing, setEditing] = useState(false),
    [preview, setPreview] = useState<z.infer<typeof platformBookingSettingsSchema>>();
  const query = useQuery({
    queryKey: scope.key,
    retry: false,
    gcTime: 0,
    queryFn: ({ signal }) =>
      scope.read((c) => readBookingSettings(c, { level: 'platform' }), signal),
  });
  const command = useCommand(
    'RootPolicy:save',
    (input: z.infer<typeof platformBookingSettingsSchema>, key) =>
      scope.read((c) => saveBookingSettings(c, { level: 'platform' }, input, key)),
    [scope.key],
  );
  const record = query.isError || query.isFetching ? undefined : query.data,
    locked = command.isPending || command.unresolved;
  return (
    <OperationSection title="Root booking defaults">
      <CommandRecovery command={command} />
      <OperationState
        pending={query.isPending || query.isFetching}
        error={query.error}
        retry={() => {
          void query.refetch();
        }}
      />
      {command.error ? (
        <p role="alert">
          {errorMessage(command.error)} Reload current settings before reviewing another change.
        </p>
      ) : null}
      {record ? (
        <>
          {record.configured ? (
            <BookingPolicySummary settings={record} />
          ) : (
            <p>No platform settings configured. Every default and safety limit is required.</p>
          )}
          {!editing ? (
            <Button disabled={!record.canEdit || locked} onClick={() => setEditing(true)}>
              Edit platform booking defaults
            </Button>
          ) : null}
          {editing && !preview ? (
            <BookingPolicyEditor
              settings={record}
              pending={locked}
              disabled={!record.canEdit}
              onSave={(input) => {
                const value = platformBookingSettingsSchema.parse(input);
                setPreview({
                  ...value,
                  expectedCurrentVersionId: record.configured
                    ? (record.localVersion?.id ?? null)
                    : null,
                });
              }}
              onCancel={() => setEditing(false)}
            />
          ) : null}
          {preview ? (
            <>
              <p>
                Review the proposed platform defaults and limits. Existing bookings retain their
                agreed policy snapshots.
              </p>
              <dl aria-label="Proposed platform policy">
                {Object.entries({ ...preview.policy, ...preview.limits }).map(([field, value]) => (
                  <div key={field}>
                    <dt>{field.replace(/([A-Z])/g, ' $1')}</dt>
                    <dd>{Array.isArray(value) ? value.join(', ') || 'None' : String(value)}</dd>
                  </div>
                ))}
              </dl>
              <OperationConfirmation
                label="platform booking policy"
                pending={locked}
                confirm={() =>
                  command.mutate(preview, {
                    onSuccess: () => {
                      setPreview(undefined);
                      setEditing(false);
                    },
                  })
                }
                cancel={() => setPreview(undefined)}
              />
            </>
          ) : null}
        </>
      ) : null}
      <Button
        variant="secondary"
        disabled={query.isFetching || locked}
        onClick={() => {
          setPreview(undefined);
          setEditing(false);
          void query.refetch();
        }}
      >
        Refresh platform policy
      </Button>
    </OperationSection>
  );
}

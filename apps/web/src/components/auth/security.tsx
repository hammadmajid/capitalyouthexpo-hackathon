'use client';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { z } from 'zod';
import { passwordChangeSchema } from '@hsm/contracts';
import { readApi } from '@hsm/api-client';
import { browserClient } from '../../lib/client';
import { FlowForm } from './flow-form';
export function AccountSecurity() {
  const cache = useQueryClient();
  const router = useRouter();
  return (
    <section className="customer-frost space-y-6 p-4 sm:p-6">
      <div>
        <h2 className="text-2xl font-bold text-hsm-heading">Account security</h2>
        <p className="mt-3">
          At least 8 characters. Changing your password signs out other devices.
        </p>
      </div>
      <div className="max-w-lg">
        <h3 className="mb-5 text-lg font-semibold">Change password</h3>
        <FlowForm
          label="Change password"
          fields={[
            {
              name: 'currentPassword',
              label: 'Current password',
              type: 'password',
              autoComplete: 'current-password',
            },
            {
              name: 'newPassword',
              label: 'New password',
              type: 'password',
              autoComplete: 'new-password',
            },
          ]}
          submit={async (values) => {
            await readApi(
              browserClient().POST('/v1/auth/password/change', {
                body: passwordChangeSchema.parse(values),
              }),
              z.object({ changed: z.literal(true) }).strict(),
            );
            await cache.invalidateQueries({ queryKey: ['session'] });
            return 'Password changed. Other signed-in devices have been revoked.';
          }}
        />
      </div>
      <div className="max-w-lg border-t border-hsm-border pt-6">
        <h3 className="mb-3 text-lg font-semibold">Sign out everywhere</h3>
        <p className="mb-5 text-sm">Ends your session on every device.</p>
        <FlowForm
          label="Sign out all devices"
          fields={[]}
          submit={async () => {
            await readApi(
              browserClient().POST('/v1/auth/logout-all', {}),
              z.object({ revoked: z.literal(true) }).strict(),
            );
            cache.clear();
            router.replace('/login');
          }}
        />
      </div>
    </section>
  );
}

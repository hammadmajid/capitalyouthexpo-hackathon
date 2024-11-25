import { useId, useState } from 'react';
import {
  inventoryPermissionSchema,
  managerInventoryGrantInputSchema,
  type InventoryPermission,
} from '@hsm/contracts';
import { Button } from './ui/button';
const labels: Record<InventoryPermission, string> = {
  listing_edit: 'Edit listing details and gallery',
  inventory_edit: 'Edit physical rooms and beds',
  pricing_edit: 'Edit prices (also requires inventory editing)',
  policy_edit: 'Edit booking policies',
  media_publish: 'Publish listing media (also requires listing editing)',
  block_manage: 'Block and release availability',
  booking_manage: 'Manage booking decisions',
  document_review: 'Document review (private evidence remains Owner-only before confirmation)',
  stay_manage: 'Prepare, check in, transfer and extend stays',
  rent_manage: 'Manage agreed rent and controlled charges (also requires Finance view)',
  payment_record: 'Record external hostel payments (also requires Finance view)',
  finance_view: 'View this branch’s financial records',
  checkout_manage: 'Complete checkouts; financial actions require their own permissions',
  // CHG-039: off by default; salary access also needs staff access.
  staff_manage: 'Manage branch staff records',
  staff_payroll_manage: 'Staff salaries, payments and agreements (also requires staff)',
};
export function ManagerGrantsForm({
  initial,
  disabled,
  onSave,
  onCancel,
}: {
  initial: InventoryPermission[];
  disabled: boolean;
  onSave: (permissions: InventoryPermission[]) => void;
  onCancel: () => void;
}) {
  const prefix = useId(),
    [permissions, setPermissions] = useState(initial);
  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (disabled) return;
        onSave(managerInventoryGrantInputSchema.parse({ permissions }).permissions);
      }}
    >
      <fieldset disabled={disabled} className="space-y-3">
        <legend className="font-semibold">Additional Manager permissions</legend>
        {inventoryPermissionSchema.options.map((permission) => (
          <label
            key={permission}
            htmlFor={prefix + permission}
            className="flex min-h-11 items-center gap-3"
          >
            <input
              id={prefix + permission}
              type="checkbox"
              checked={permissions.includes(permission)}
              onChange={(event) =>
                setPermissions((current) =>
                  event.target.checked
                    ? [...current, permission]
                    : current.filter((value) => value !== permission),
                )
              }
            />
            {labels[permission]}
          </label>
        ))}
      </fieldset>
      <p className="text-sm text-hsm-secondary">
        Managers see booking document verification status only. These permissions never allow access
        to private customer booking documents before confirmation.
      </p>
      <p className="text-sm text-hsm-secondary">
        Removing all selections revokes all additional branch permissions. Assignment status and
        branch scope continue to apply.
      </p>
      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={disabled}>
          Save Manager permissions
        </Button>
        <Button type="button" variant="secondary" disabled={disabled} onClick={onCancel}>
          Cancel permission changes
        </Button>
      </div>
    </form>
  );
}

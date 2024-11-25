import type { BookingPolicyRead } from '@hsm/api-client';
import { policyNumbers, policyBooleans, policyLists } from '../lib/booking-policy-form';
export function BookingPolicySummary({
  settings,
}: {
  settings: Extract<BookingPolicyRead, { configured: true }>;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <caption>Effective policy and inherited parent values</caption>
        <thead>
          <tr>
            <th scope="col">Setting</th>
            <th scope="col">Effective</th>
            <th scope="col">Inherited</th>
          </tr>
        </thead>
        <tbody>
          {(
            [
              ['bookingMode', 'Booking mode'],
              ...policyNumbers,
              ...policyBooleans,
              ...policyLists.map(([field, label]) => [field, label] as const),
            ] as const
          ).map(([field, label]) => (
            <tr key={field}>
              <th scope="row">{label}</th>
              <td>{display(settings.effective[field])}</td>
              <td>
                {settings.inherited ? display(settings.inherited[field]) : 'Platform default'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function display(value: unknown) {
  if (Array.isArray(value)) return value.length ? value.join(', ').replaceAll('_', ' ') : 'None';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return String(value).replaceAll('_', ' ');
}

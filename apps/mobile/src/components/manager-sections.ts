import {
  BedDouble,
  Bus,
  CalendarClock,
  CalendarDays,
  ClipboardList,
  MessageCircle,
  MessagesSquare,
  ReceiptText,
  ScrollText,
  UserCog,
  Users,
  type LucideIcon,
} from 'lucide-react-native';
import type { InventoryPermission } from '@hsm/contracts';
// MGRD: one entry per branch tool. `needs` hides a tool only when the live grants prove the
// Manager cannot use it (UI convenience); the server still re-checks every call.
export type ManagerSection = {
  key: string;
  label: string;
  Icon: LucideIcon;
  needs?: readonly InventoryPermission[];
};
export const managerSections: readonly ManagerSection[] = [
  { key: 'bookings', label: 'Bookings', Icon: CalendarDays, needs: ['booking_manage'] },
  { key: 'stays', label: 'Residents', Icon: Users, needs: ['stay_manage'] },
  { key: 'inventory', label: 'Rooms & Rent', Icon: BedDouble },
  { key: 'visits', label: 'Visits', Icon: CalendarClock },
  { key: 'waitlist', label: 'Waitlist', Icon: ClipboardList },
  // CHG-042: routes need listing_edit + pricing_edit; rider decisions stay_manage + rent_manage.
  {
    key: 'transport',
    label: 'Transport',
    Icon: Bus,
    needs: ['listing_edit', 'pricing_edit', 'stay_manage', 'rent_manage', 'finance_view'],
  },
  { key: 'chat', label: 'Messages', Icon: MessagesSquare },
  {
    key: 'services',
    label: 'Complaints & Services',
    Icon: MessageCircle,
    needs: ['stay_manage', 'listing_edit'],
  },
  { key: 'billing-policy', label: 'Rent Rules', Icon: ScrollText },
  { key: 'billing-catalog', label: 'Charges', Icon: ReceiptText },
  // CHG-039: only when the Owner has granted staff_manage.
  { key: 'staff', label: 'Staff', Icon: UserCog, needs: ['staff_manage'] },
];
// Any one listed grant is enough (e.g. Residents opens with stay_manage or finance_view).
export function visibleSections(permissions: readonly InventoryPermission[] | undefined) {
  if (!permissions) return managerSections;
  return managerSections.filter(
    (section) => !section.needs || section.needs.some((grant) => permissions.includes(grant)),
  );
}
export function sectionLabel(key: string | undefined) {
  return managerSections.find((section) => section.key === key)?.label ?? 'Branch';
}

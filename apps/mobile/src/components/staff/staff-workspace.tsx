import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import {
  AlertCircle,
  CalendarClock,
  ChevronLeft,
  CheckCircle,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react-native';
import { listStaff, readStaffDashboard } from '@hsm/api-client';
import { mobileColors as c, mobileOwnerColors, mobileSurfaces } from '@hsm/ui';
import { safeMessage } from '../../lib/messages';
import { Skeleton } from '../loading/skeleton';
import { StaffDetailView } from './staff-detail';
import { Chip, Field, SalaryChip, jobTitles, methods, pkr, useStaffRead } from './staff-shared';
const statuses = { active: 'Active', inactive: 'Inactive', ended: 'Ended' } as const;
type Status = keyof typeof statuses;
// CHG-039: the branch Staff tool for Owners and authorized Managers. Money appears only when the
// server says the viewer has payroll access.
export function StaffWorkspace({
  actorId,
  branchId,
  initialDue = false,
}: {
  actorId: string;
  branchId: string;
  initialDue?: boolean;
}) {
  const [open, setOpen] = useState<string>();
  const [status, setStatus] = useState<Status | undefined>(initialDue ? undefined : 'active');
  const [dueOnly, setDueOnly] = useState(initialDue);
  const [q, setQ] = useState('');
  const dashboard = useStaffRead(actorId, branchId, ['dashboard'], (client) =>
    readStaffDashboard(client, branchId),
  );
  const list = useStaffRead(actorId, branchId, ['list', status, dueOnly, q.trim()], (client) =>
    listStaff(client, branchId, {
      ...(status ? { status } : {}),
      ...(dueOnly ? { salary: 'due' as const } : {}),
      ...(q.trim() ? { q: q.trim() } : {}),
      limit: 50,
    }),
  );
  const payroll = dashboard.data?.payroll ?? null;
  if (open)
    return (
      <View style={{ gap: 12 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back to staff"
          onPress={() => setOpen(undefined)}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 40 }}
        >
          <ChevronLeft color={c.primary} size={20} />
          <Text style={{ color: c.primary, fontWeight: '600' }}>Staff</Text>
        </Pressable>
        {/* CHG-039: staff are added and edited in Hostel Setup › Staff; this runs payroll. */}
        <StaffDetailView actorId={actorId} branchId={branchId} staffId={open} />
      </View>
    );
  const failure = dashboard.error ?? list.error;
  return (
    <View style={{ gap: 12 }} accessibilityLabel="Staff">
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        <Stat
          Icon={Users}
          label="Active staff"
          value={String(dashboard.data?.activeStaff ?? '–')}
        />
        {payroll ? (
          <>
            <Stat Icon={CheckCircle} label="Paid" value={String(payroll.paid)} color={c.success} />
            <Stat
              Icon={CalendarClock}
              label="Due today"
              value={String(payroll.due)}
              color={mobileOwnerColors.warning}
            />
            <Stat
              Icon={AlertCircle}
              label="Overdue"
              value={String(payroll.overdue)}
              color={c.dangerText}
            />
            <Stat Icon={Wallet} label="Left to pay" value={pkr(payroll.outstandingPaisa)} wide />
          </>
        ) : null}
      </View>
      {payroll?.needsAmount ? (
        <Text style={{ color: mobileOwnerColors.warning }}>
          {payroll.needsAmount} part-month salary needs an amount — open the staff member.
        </Text>
      ) : null}
      {payroll ? (
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {([false, true] as const).map((value) => (
            <Pressable
              key={String(value)}
              accessibilityRole="button"
              accessibilityLabel={value ? 'Filter staff: Salary due' : 'Filter staff: All salaries'}
              accessibilityState={{ selected: dueOnly === value }}
              onPress={() => setDueOnly(value)}
              style={{
                minHeight: 44,
                padding: 12,
                borderRadius: 20,
                backgroundColor: dueOnly === value ? c.deep : c.surface,
              }}
            >
              <Text style={{ color: dueOnly === value ? c.surface : c.primary, fontWeight: '700' }}>
                {value ? 'Salary due' : 'All salaries'}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}
      <Field label="Search staff" value={q} onChangeText={setQ} placeholder="Name" maxLength={80} />
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {dueOnly ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="All staff statuses"
            onPress={() => setStatus(undefined)}
            style={{ padding: 10 }}
          >
            <Text style={{ color: c.primary }}>All</Text>
          </Pressable>
        ) : null}
        {(Object.keys(statuses) as Status[]).map((key) => (
          <Pressable
            key={key}
            accessibilityRole="button"
            accessibilityLabel={statuses[key] + ' staff'}
            accessibilityState={{ selected: status === key }}
            onPress={() => setStatus(key)}
            style={{
              minHeight: 38,
              paddingHorizontal: 14,
              borderRadius: 19,
              justifyContent: 'center',
              borderWidth: 1,
              borderColor: status === key ? c.deep : mobileSurfaces.icyCard.borderColor,
              backgroundColor: status === key ? c.deep : c.surface,
            }}
          >
            <Text style={{ color: status === key ? c.surface : c.primary, fontWeight: '600' }}>
              {statuses[key]}
            </Text>
          </Pressable>
        ))}
      </View>
      {failure ? <Text style={{ color: c.dangerText }}>{safeMessage(failure)}</Text> : null}
      {list.isPending ? <Skeleton kind="list" label="Loading staff…" /> : null}
      {list.data && !list.data.data.length ? (
        <Text style={{ color: c.secondary }}>
          No {(status ? statuses[status] : 'matching').toLowerCase()} staff yet.
        </Text>
      ) : null}
      {list.data?.data.map((member) => (
        <Pressable
          key={member.id}
          accessibilityRole="button"
          accessibilityLabel={'Open ' + member.fullName}
          onPress={() => setOpen(member.id)}
          style={{
            ...mobileSurfaces.icyCard,
            borderWidth: 1,
            borderRadius: 18,
            padding: 14,
            gap: 6,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={{ flex: 1, color: c.heading, fontSize: 16, fontWeight: '700' }}>
              {member.fullName}
            </Text>
            {member.salary ? (
              <Text style={{ color: c.heading }}>{pkr(member.salary.amountPaisa)}</Text>
            ) : null}
          </View>
          <Text style={{ color: c.secondary }}>
            {member.customTitle ?? jobTitles[member.jobTitle]}
          </Text>
          {dueOnly ? (
            <Chip label="Salary due" color={mobileOwnerColors.warning} />
          ) : member.salary ? (
            <SalaryChip salary={member.salary} />
          ) : member.status !== 'active' ? (
            <Chip label={statuses[member.status]} color={c.secondary} />
          ) : null}
        </Pressable>
      ))}
      {payroll?.recentPayments.length ? (
        <View style={{ gap: 6 }}>
          <Text style={{ color: c.heading, fontSize: 16, fontWeight: '700' }}>Recent payments</Text>
          {payroll.recentPayments.map((p) => (
            <Text key={p.id} style={{ color: c.text }}>
              {p.staffName} · {p.kind === 'reversal' ? '−' : ''}
              {pkr(p.amountPaisa)} · {methods[p.method]} · {p.paidOn}
            </Text>
          ))}
        </View>
      ) : null}
    </View>
  );
}
function Stat(props: {
  Icon: LucideIcon;
  label: string;
  value: string;
  color?: string;
  wide?: boolean;
}) {
  return (
    <View
      accessible
      accessibilityLabel={props.label + ': ' + props.value}
      style={{
        ...mobileSurfaces.icyCard,
        borderWidth: 1,
        borderRadius: 16,
        padding: 12,
        gap: 4,
        flexBasis: props.wide ? '100%' : '45%',
        flexGrow: 1,
      }}
    >
      <props.Icon color={props.color ?? c.primary} size={18} />
      <Text style={{ color: c.heading, fontSize: 18, fontWeight: '700' }}>{props.value}</Text>
      <Text style={{ color: c.secondary, fontSize: 12 }}>{props.label}</Text>
    </View>
  );
}

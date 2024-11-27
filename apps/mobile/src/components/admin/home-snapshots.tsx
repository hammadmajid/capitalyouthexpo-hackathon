import type { readAdminExplorerSummary } from '@hsm/api-client';
import {
  Building2,
  BedDouble,
  Users,
  UserRound,
  Wallet,
  MessageSquare,
  ShieldCheck,
  type LucideIcon,
} from 'lucide-react-native';
import type { AdminExplorerKind } from '@hsm/contracts';
import { StatGrid } from './admin-grid';
import { openExplorer } from './explorer-navigation';
const snapshots: { kind: AdminExplorerKind; label: string; icon: LucideIcon }[] = [
  { kind: 'users', label: 'Users', icon: Users },
  { kind: 'hostels', label: 'Hostels', icon: Building2 },
  { kind: 'branches', label: 'Branches', icon: Building2 },
  { kind: 'owners', label: 'Owners', icon: UserRound },
  { kind: 'managers', label: 'Managers', icon: ShieldCheck },
  { kind: 'occupancy', label: 'Residents now', icon: BedDouble },
  { kind: 'payments', label: 'Payments approved', icon: Wallet },
  {
    kind: 'complaints',
    label: 'Complaints',
    icon: MessageSquare,
  },
];
export function HomeSnapshots({
  summary,
}: {
  summary: Awaited<ReturnType<typeof readAdminExplorerSummary>>;
}) {
  // Pending counts live on the Operations tiles as badges, so they are not repeated here.
  const cards = snapshots.map((card) => ({
    ...card,
    value: summary?.counts[card.kind],
    open: () => openExplorer(card.kind),
  }));
  return (
    <StatGrid
      stats={cards
        .filter((card) => card.value !== undefined)
        .map((card) => ({
          label: card.label,
          value: card.value,
          icon: card.icon,
          onPress: card.open,
        }))}
    />
  );
}

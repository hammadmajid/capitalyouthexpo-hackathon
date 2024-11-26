import {
  Briefcase,
  GraduationCap,
  HeartPulse,
  Hotel,
  Landmark,
  Library,
  MapPin,
  School,
  ShoppingBag,
  UtensilsCrossed,
  type LucideIcon,
} from 'lucide-react-native';
import type { placeTypeSchema } from '@hsm/contracts';
import type { z } from 'zod';
// CHG-033/034: one label and icon per place category, shared by search and Admin.
export type PlaceType = z.infer<typeof placeTypeSchema>;
export const placeKinds: Record<PlaceType, { label: string; Icon: LucideIcon }> = {
  university: { label: 'University', Icon: GraduationCap },
  school: { label: 'School', Icon: School },
  health: { label: 'Health', Icon: HeartPulse },
  hotel: { label: 'Stay', Icon: Hotel },
  food: { label: 'Food', Icon: UtensilsCrossed },
  government: { label: 'Government', Icon: Landmark },
  library: { label: 'Library', Icon: Library },
  office: { label: 'Office', Icon: Briefcase },
  business_hub: { label: 'Business', Icon: ShoppingBag },
  locality: { label: 'Area', Icon: MapPin },
};
export const placeTypes = Object.keys(placeKinds) as PlaceType[];

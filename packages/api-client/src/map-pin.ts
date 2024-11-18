import type { z } from 'zod';
import { branchLocationSchema as pinSchema } from '@hsm/contracts';
export type MapPin = z.infer<typeof pinSchema>;
export const branchMapStyle = 'https://tiles.openfreemap.org/styles/liberty';
export const branchMapCenter: [number, number] = [73.0479, 33.6844];
export function readMapPin(longitude: unknown, latitude: unknown): MapPin | undefined {
  const result = pinSchema.safeParse({ longitude, latitude });
  return result.success ? result.data : undefined;
}
export function mapPinFromFields(values: Record<string, string>): MapPin | undefined {
  if (!values.longitude?.trim() || !values.latitude?.trim()) return undefined;
  return readMapPin(Number(values.longitude), Number(values.latitude));
}

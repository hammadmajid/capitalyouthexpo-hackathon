import { expect, it } from 'vitest';
import { mobileOwnerColors, ownerColors, ownerMetrics } from './owner-tokens.js';
import { mobileColors } from './tokens.js';
// WCAG 2.2 SC 1.4.3: Owner text stays readable on Owner surfaces.
function luminance(color: string) {
  const channels = [1, 3, 5]
    .map((offset) => parseInt(color.slice(offset, offset + 2), 16) / 255)
    .map((channel) => (channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4));
  return (channels[0] ?? 0) * 0.2126 + (channels[1] ?? 0) * 0.7152 + (channels[2] ?? 0) * 0.0722;
}
const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return ((hi ?? 0) + 0.05) / ((lo ?? 0) + 0.05);
};
it.each([
  [ownerColors.text, ownerColors.surface],
  [ownerColors.secondary, ownerColors.background],
  [ownerColors.onPrimary, ownerColors.primary],
  [ownerColors.danger, ownerColors.surface],
  [ownerColors.warning, ownerColors.warningSoft],
  [ownerColors.blue, ownerColors.blueSoft],
])('Owner text %s on %s meets 4.5:1', (text, background) => {
  expect(contrast(text, background)).toBeGreaterThanOrEqual(4.5);
});
it('mobile Owner colours follow the shared mobile palette', () => {
  expect(mobileOwnerColors.primary).toBe(mobileColors.primary);
  expect(mobileOwnerColors.background).toBe(mobileColors.background);
  expect(mobileOwnerColors.surface).toBe(ownerColors.surface);
  for (const value of Object.values(mobileOwnerColors)) expect(value).toMatch(/^#[0-9A-F]{6}$/i);
});
it('Owner touch targets meet the 48 dp minimum', () => {
  expect(ownerMetrics.touch).toBeGreaterThanOrEqual(48);
});

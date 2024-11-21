import { expect, it } from 'vitest';
import { loginColors, natureLoginColors } from './login-tokens.js';
import { marketplaceColors } from './marketplace-tokens.js';
import { colors, mobileColors, mobileSurfaces, tokensCss } from './tokens.js';
// WCAG 2.2 SC 1.4.3: normal text contrast is checked without rounding.
function luminance(color: string) {
  const channels = [1, 3, 5]
    .map((offset) => parseInt(color.slice(offset, offset + 2), 16) / 255)
    .map((channel) => (channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4));
  return (channels[0] ?? 0) * 0.2126 + (channels[1] ?? 0) * 0.7152 + (channels[2] ?? 0) * 0.0722;
}
it.each([
  [mobileColors.surface, mobileColors.primary],
  [mobileColors.surface, mobileColors.deep],
  [mobileColors.heading, mobileColors.background],
  [mobileColors.text, mobileColors.inputSurface],
  [mobileColors.secondary, mobileColors.icy],
  [mobileColors.dangerText, mobileColors.background],
  [mobileColors.primary, mobileColors.aqua],
  [mobileColors.accent, mobileColors.background],
  [mobileColors.success, mobileColors.background],
  [mobileColors.muted, mobileColors.background],
])('Nature Glass mobile normal text %s on %s meets AA', (foreground, background) => {
  const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  expect(((values[0] ?? 0) + 0.05) / ((values[1] ?? 0) + 0.05)).toBeGreaterThanOrEqual(4.5);
});
it('Nature Glass surface presets cannot alter screen geometry', () => {
  for (const surface of Object.values(mobileSurfaces)) {
    expect(
      Object.keys(surface).every((key) =>
        ['backgroundColor', 'borderColor', 'boxShadow'].includes(key),
      ),
    ).toBe(true);
  }
});
it('Nature Glass solid-card edges never override a fill or gradient', () => {
  expect(Object.keys(mobileSurfaces.solidCard).sort()).toEqual(['borderColor', 'boxShadow']);
  expect(Object.keys(mobileSurfaces.glassEdge).sort()).toEqual(['borderColor', 'boxShadow']);
});
it.each([
  mobileColors.text,
  mobileColors.heading,
  mobileColors.secondary,
  mobileColors.primary,
  mobileColors.dangerText,
])('Nature Glass tinted card retains AA for %s', (foreground) => {
  const alpha = parseInt(mobileColors.cardSurface.slice(7, 9), 16) / 255;
  const composed =
    '#' +
    [1, 3, 5]
      .map((offset) =>
        Math.round(
          parseInt(mobileColors.cardSurface.slice(offset, offset + 2), 16) * alpha +
            parseInt(mobileColors.background.slice(offset, offset + 2), 16) * (1 - alpha),
        )
          .toString(16)
          .padStart(2, '0'),
      )
      .join('');
  const values = [luminance(foreground), luminance(composed)].sort((a, b) => b - a);
  expect(((values[0] ?? 0) + 0.05) / ((values[1] ?? 0) + 0.05)).toBeGreaterThanOrEqual(4.5);
});
it.each([
  [colors.surface, colors.primary],
  [colors.heading, colors.background],
  [colors.text, colors.surface],
  [colors.secondary, colors.background],
  [colors.dangerText, colors.surface],
  [colors.deep, colors.aqua],
])('SCOPE-003: readable foundation text pair %s / %s meets AA', (foreground, background) => {
  const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  expect(((values[0] ?? 0) + 0.05) / ((values[1] ?? 0) + 0.05)).toBeGreaterThanOrEqual(4.5);
});
it('SCOPE-003: web stylesheet is generated from the shared native token source', () => {
  const sheet = tokensCss();
  expect(sheet).toContain('--hsm-primary: ' + colors.primary);
  expect(sheet).toContain('--hsm-font: Plus Jakarta Sans, system-ui, sans-serif;');
  expect(sheet).toContain('--hsm-radius-card: 18px;');
  expect(sheet.endsWith('\n}\n')).toBe(true);
});

it.each([
  [loginColors.surface, loginColors.primary],
  [loginColors.surface, loginColors.dark],
  [loginColors.heading, loginColors.background],
  [loginColors.secondary, loginColors.background],
  [loginColors.error, loginColors.background],
  [loginColors.dark, loginColors.disabled],
])('AUTH-C: reference login text pair %s / %s meets AA', (foreground, background) => {
  const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  expect(((values[0] ?? 0) + 0.05) / ((values[1] ?? 0) + 0.05)).toBeGreaterThanOrEqual(4.5);
});

it.each([
  [marketplaceColors.primary, marketplaceColors.surface],
  [marketplaceColors.heading, marketplaceColors.background],
  [marketplaceColors.secondary, marketplaceColors.background],
  [marketplaceColors.primary, marketplaceColors.sage],
])(
  'ACC-002 / A11Y: customer marketplace pair %s / %s meets normal-text AA',
  (foreground, background) => {
    const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
    expect(((values[0] ?? 0) + 0.05) / ((values[1] ?? 0) + 0.05)).toBeGreaterThanOrEqual(4.5);
  },
);

it.each([marketplaceColors.heroText, marketplaceColors.sage])(
  'ACC-002 / A11Y: hero foreground %s remains readable even over the brightest image pixel',
  (foreground) => {
    const scrim = marketplaceColors.heroScrim;
    const alpha = parseInt(scrim.slice(7, 9), 16) / 255;
    const brightest =
      '#' +
      [1, 3, 5]
        .map((offset) => {
          const channel = parseInt(scrim.slice(offset, offset + 2), 16);
          return Math.round(channel * alpha + 255 * (1 - alpha))
            .toString(16)
            .padStart(2, '0');
        })
        .join('');
    const values = [luminance(foreground), luminance(brightest)].sort((a, b) => b - a);
    expect(((values[0] ?? 0) + 0.05) / ((values[1] ?? 0) + 0.05)).toBeGreaterThanOrEqual(4.5);
  },
);

it.each([
  [natureLoginColors.surface, natureLoginColors.primary],
  [natureLoginColors.heading, natureLoginColors.background],
  [natureLoginColors.secondary, natureLoginColors.background],
  [natureLoginColors.dark, natureLoginColors.disabled],
])('AUTH-C: Nature Glass text pair %s / %s meets AA', (foreground, background) => {
  const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  expect(((values[0] ?? 0) + 0.05) / ((values[1] ?? 0) + 0.05)).toBeGreaterThanOrEqual(4.5);
});

// SCOPE-003: shared HSM visual identity, approved in the continuation brief.
export const colors = {
  background: '#F6FCFC',
  surface: '#FFFFFF',
  icy: '#EAF7F8',
  aqua: '#D7EEF1',
  primary: '#0E6F76',
  accent: '#1A9DA0',
  deep: '#064F57',
  heading: '#0A3138',
  text: '#132A31',
  secondary: '#647781',
  muted: '#8798A0',
  border: '#DCECEE',
  gold: '#F5A800',
  success: '#18B7AD',
  alert: '#EA3D47',
  dangerText: '#B4232A',
} as const;
// Mobile Nature Glass extension. Web and approved authentication artwork retain
// their existing palettes; semantic role/status colors remain distinct.
export const mobileColors = {
  ...colors,
  background: '#F2FAF7',
  icy: '#EFFAF7',
  aqua: '#DDEFE6',
  primary: '#006347',
  accent: '#167357',
  deep: '#004D38',
  heading: '#103B30',
  text: '#193A32',
  secondary: '#526B62',
  muted: '#60766C',
  border: '#D6E9E0',
  success: '#167357',
  cardSurface: '#EFF9F4FA',
  cardBorder: '#8FC5AD',
  inputSurface: '#F7FFFC',
  // Example text inside an empty input: deliberately faint so typed text stands out.
  placeholder: '#A3B5AD',
} as const;
// Visual properties only: no padding, size, radius or layout changes.
export const mobileSurfaces = {
  dashboardGlass: {
    backgroundColor: '#F3FFFA70',
    borderColor: '#E9FFF7E6',
    boxShadow:
      'inset 0px 0px 0px 1px rgba(255,255,255,0.7), inset 0px 1px 16px rgba(255,255,255,0.2), 0px 7px 18px rgba(0,77,56,0.10)',
  },
  icyCard: {
    backgroundColor: mobileColors.cardSurface,
    borderColor: mobileColors.cardBorder,
    boxShadow: 'inset 0px 0px 0px 1.5px rgba(255,255,255,0.95), 0px 4px 14px rgba(0,77,56,0.09)',
  },
  emeraldGlass: {
    backgroundColor: mobileColors.deep,
    borderColor: '#72C5A980',
    boxShadow: '0px 5px 16px rgba(0,77,56,0.12)',
  },
  // Border-only treatment: solid cards retain their own approved fills/gradients.
  solidCard: {
    borderColor: '#88C8AD99',
    boxShadow:
      'inset 0px 0px 0px 1px rgba(226,255,242,0.22), 0px 0px 0px 1px rgba(73,153,119,0.35), 0px 4px 14px rgba(0,77,56,0.10)',
  },
  glassEdge: {
    borderColor: '#B7DBCBAD',
    boxShadow: 'inset 0px 0px 0px 1px rgba(255,255,255,0.8), 0px 4px 16px rgba(0,77,56,0.08)',
  },
  input: { backgroundColor: mobileColors.inputSurface, borderColor: mobileColors.border },
  navigation: { backgroundColor: '#F8FFFCF5', borderColor: mobileColors.border },
} as const;
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  section: 32,
  page: 40,
  touch: 48,
} as const;
export const radii = { sm: 8, input: 20, card: 18, large: 24, pill: 9999 } as const;
export const typography = {
  family: 'Plus Jakarta Sans',
  fallback: 'system-ui, sans-serif',
  body: 15,
  heading: 28,
  lineHeight: 1.6,
} as const;
export const icons = { family: 'Lucide', strokeWidth: 1.75, size: 20 } as const;

export function tokensCss() {
  const colorLines = Object.entries(colors).map(
    ([name, value]) => '  --hsm-' + name + ': ' + value + ';',
  );
  const spaceLines = Object.entries(spacing).map(
    ([name, value]) => '  --hsm-space-' + name + ': ' + value + 'px;',
  );
  const radiusLines = Object.entries(radii).map(
    ([name, value]) => '  --hsm-radius-' + name + ': ' + value + 'px;',
  );
  return (
    ':root {\n' +
    [
      ...colorLines,
      ...spaceLines,
      ...radiusLines,
      '  --hsm-font: ' + typography.family + ', ' + typography.fallback + ';',
    ].join('\n') +
    '\n}\n'
  );
}

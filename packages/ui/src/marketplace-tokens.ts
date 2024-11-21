import { loginColors } from './login-tokens.js';
import { spacing, radii, typography, mobileColors } from './tokens.js';
// Phase 2 customer marketplace palette, scoped to the approved reference.
export const marketplaceColors = {
  ...loginColors,
  hero: loginColors.dark,
  heroText: loginColors.surface,
  heroScrim: `${loginColors.dark}D9`,
  favorite: loginColors.error,
} as const;
export const mobileMarketplaceColors = {
  ...marketplaceColors,
  background: mobileColors.background,
  primary: mobileColors.primary,
  dark: mobileColors.deep,
  heading: mobileColors.heading,
  secondary: mobileColors.secondary,
  border: mobileColors.border,
} as const;
export const marketplaceMetrics = {
  ...spacing,
  ...radii,
  bodySize: typography.body,
  headingSize: typography.heading,
  heroHeight: 280,
  heroTitleSize: 36,
  headerHeight: 64,
  navigationHeight: 72,
  avatarSize: 40,
  iconSize: 24,
  iconStroke: 1.75,
  searchHeight: 56,
  contentMaxWidth: 600,
} as const;

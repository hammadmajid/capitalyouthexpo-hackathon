import type { Config } from 'tailwindcss';
import { colors, mobileColors, radii, typography } from '@hsm/ui';
export default {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: { hsm: colors, customer: mobileColors },
      fontSize: {
        body: [typography.body + 'px', String(typography.lineHeight)],
        heading: typography.heading + 'px',
      },
      borderRadius: {
        card: radii.card + 'px',
        input: radii.input + 'px',
        panel: radii.large + 'px',
      },
      // Customer glass surfaces built from shared tokens (no raw colours in CSS).
      backgroundImage: {
        'customer-glow': `radial-gradient(ellipse at 12% 0%, ${mobileColors.aqua}, transparent 55%)`,
        'customer-frost': `linear-gradient(145deg, transparent 65%, ${mobileColors.aqua})`,
      },
      boxShadow: {
        'customer-frost': `inset 0 0 0 1px ${mobileColors.surface}, 0 8px 24px -18px ${mobileColors.primary}`,
      },
      fontFamily: {
        sans: [typography.family + ' Variable', typography.family, 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
} satisfies Config;

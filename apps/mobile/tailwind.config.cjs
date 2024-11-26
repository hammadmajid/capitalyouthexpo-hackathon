const { mobileColors: colors, mobileSurfaces, radii, typography, spacing } = require('@hsm/ui');
const plugin = require('tailwindcss/plugin');
module.exports = {
  content: ['./src/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors,
      spacing: {
        1: spacing.xs + 'px',
        2: spacing.sm + 'px',
        3: spacing.md + 'px',
        4: spacing.lg + 'px',
        5: spacing.xl + 'px',
        6: spacing.xxl + 'px',
        8: spacing.section + 'px',
        10: spacing.page + 'px',
        12: spacing.touch + 'px',
      },
      borderRadius: Object.fromEntries(
        Object.entries(radii).map(([name, size]) => [name, size + 'px']),
      ),
      fontFamily: { body: ['PlusJakartaSans_400Regular'], heading: ['PlusJakartaSans_700Bold'] },
      fontSize: {
        title: typography.heading + 'px',
        body: [
          typography.body + 'px',
          { lineHeight: typography.body * typography.lineHeight + 'px' },
        ],
      },
    },
  },
  // Native card styles apply inset + outer shadows directly: this NativeWind
  // version cannot compile multiple CSS box shadows.
  plugins: [plugin(({ addUtilities }) => addUtilities({ '.frosted-card': {
    backgroundColor: mobileSurfaces.icyCard.backgroundColor,
    borderColor: mobileSurfaces.icyCard.borderColor,
  } }))],
};

import type { ComponentProps, CSSProperties } from 'react';
import { mobileMarketplaceColors } from '@hsm/ui';
import { Button, cn } from './button';
type Theme = CSSProperties &
  Record<
    | '--marketplace-primary'
    | '--marketplace-dark'
    | '--marketplace-sage'
    | '--marketplace-surface'
    | '--marketplace-disabled'
    | '--marketplace-secondary',
    string
  >;
const theme: Theme = {
  '--marketplace-primary': mobileMarketplaceColors.primary,
  '--marketplace-dark': mobileMarketplaceColors.dark,
  '--marketplace-sage': mobileMarketplaceColors.sage,
  '--marketplace-surface': mobileMarketplaceColors.surface,
  '--marketplace-disabled': mobileMarketplaceColors.disabled,
  '--marketplace-secondary': mobileMarketplaceColors.secondary,
};
export function MarketplaceButton({
  variant = 'primary',
  className,
  style,
  ...props
}: ComponentProps<typeof Button>) {
  const palette =
    variant === 'secondary'
      ? 'border-[color:var(--marketplace-primary)] bg-[color:var(--marketplace-surface)] text-[color:var(--marketplace-primary)] hover:bg-[color:var(--marketplace-sage)]'
      : variant === 'ghost'
        ? 'text-[color:var(--marketplace-primary)] hover:bg-[color:var(--marketplace-sage)]'
        : 'bg-[color:var(--marketplace-primary)] text-[color:var(--marketplace-surface)] hover:bg-[color:var(--marketplace-dark)]';
  return (
    <Button
      {...props}
      variant={variant}
      style={{ ...theme, ...style }}
      className={cn(
        palette,
        'focus-visible:outline-[color:var(--marketplace-primary)] disabled:bg-[color:var(--marketplace-disabled)] disabled:text-[color:var(--marketplace-secondary)] disabled:opacity-100',
        className,
      )}
    />
  );
}

import { forwardRef, type ComponentProps } from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
export function cn(...values: ClassValue[]) {
  return twMerge(clsx(values));
}
const styles = cva(
  'inline-flex min-h-12 items-center justify-center gap-2 rounded-input px-5 py-3 text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-hsm-primary disabled:cursor-not-allowed disabled:opacity-50',
  {
    variants: {
      variant: {
        primary: 'bg-hsm-primary text-hsm-surface hover:bg-hsm-deep',
        secondary: 'border border-hsm-primary bg-hsm-surface text-hsm-primary hover:bg-hsm-icy',
        ghost: 'text-hsm-primary hover:bg-hsm-icy',
      },
    },
    defaultVariants: { variant: 'primary' },
  },
);
type Props = ComponentProps<'button'> & VariantProps<typeof styles> & { asChild?: boolean };
export const Button = forwardRef<HTMLButtonElement, Props>(function Button(
  { asChild, variant, className, ...props },
  ref,
) {
  const Component = asChild ? Slot : 'button';
  return <Component ref={ref} className={cn(styles({ variant }), className)} {...props} />;
});

import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'font-display inline-flex cursor-pointer items-center justify-center gap-2 rounded-full font-semibold whitespace-nowrap outline-none transition-transform focus-visible:ring-2 focus-visible:ring-ring/30 active:scale-95 disabled:pointer-events-none disabled:opacity-40 [&_svg]:pointer-events-none [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary/85',
        outline: 'border-[1.5px] border-border bg-background text-foreground hover:bg-primary/5',
        ghost: 'text-foreground hover:bg-primary/5',
        destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/85',
      },
      size: {
        default: 'px-6 py-1.5 text-xl',
        lg: 'px-10 py-2.5 text-2xl',
        icon: 'size-[62px]',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  },
);
Button.displayName = 'Button';

export { Button, buttonVariants };

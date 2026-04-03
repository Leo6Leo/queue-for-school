import type { ButtonHTMLAttributes } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../../lib/utils'

export const buttonVariants = cva(
  'inline-flex items-center justify-center rounded-2xl font-semibold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        student:
          'bg-emerald-500 text-white shadow-glow hover:-translate-y-0.5 hover:bg-emerald-400 focus-visible:ring-emerald-400',
        ta:
          'bg-indigo-500 text-white shadow-glow hover:-translate-y-0.5 hover:bg-indigo-400 focus-visible:ring-indigo-400',
        outline:
          'border border-slate-200 bg-white/80 text-slate-700 hover:-translate-y-0.5 hover:bg-slate-50 focus-visible:ring-slate-300',
      },
      size: {
        default: 'px-5 py-3 text-base',
        lg: 'px-6 py-4 text-base md:text-lg',
      },
      fullWidth: {
        true: 'w-full',
        false: '',
      },
    },
    defaultVariants: {
      variant: 'outline',
      size: 'default',
      fullWidth: false,
    },
  },
)

type ButtonVariants = VariantProps<typeof buttonVariants>

interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    ButtonVariants {}

export function Button({ className, variant, size, fullWidth, ...props }: ButtonProps) {
  return (
    <button
      className={cn(buttonVariants({ variant, size, fullWidth }), className)}
      {...props}
    />
  )
}

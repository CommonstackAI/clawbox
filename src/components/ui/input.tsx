import * as React from 'react'
import { cn } from '@/lib/utils'

const fieldBaseClassName = 'w-full border border-input bg-background/85 text-sm shadow-sm transition-all duration-200 placeholder:text-muted-foreground/70 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:border-ring/40'

export const inputControlClassName = `${fieldBaseClassName} h-10 rounded-xl px-3.5 py-2`
export const compactInputControlClassName = `${fieldBaseClassName} h-9 rounded-xl px-3 py-1.5`
export const selectControlClassName = `${fieldBaseClassName} h-10 rounded-xl px-3.5 py-2 pr-10 appearance-none`
export const textareaControlClassName = `${fieldBaseClassName} min-h-[96px] rounded-xl px-3.5 py-2.5`

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

const Input = React.forwardRef<HTMLInputElement, InputProps>(({ className, type = 'text', ...props }, ref) => (
  <input
    type={type}
    className={cn(inputControlClassName, className)}
    ref={ref}
    {...props}
  />
))
Input.displayName = 'Input'

export { Input }

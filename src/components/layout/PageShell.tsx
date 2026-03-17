import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

type PageShellVariant = 'list' | 'detail' | 'form'

const WIDTH_BY_VARIANT: Record<PageShellVariant, string> = {
  list: 'max-w-5xl',
  detail: 'max-w-4xl',
  form: 'max-w-3xl',
}

interface PageShellProps {
  variant: PageShellVariant
  header?: ReactNode
  children: ReactNode
  className?: string
  headerClassName?: string
  bodyClassName?: string
  headerInnerClassName?: string
  bodyInnerClassName?: string
}

export function PageShell({
  variant,
  header,
  children,
  className,
  headerClassName,
  bodyClassName,
  headerInnerClassName,
  bodyInnerClassName,
}: PageShellProps) {
  const widthClassName = WIDTH_BY_VARIANT[variant]

  return (
    <div className={cn('flex h-full flex-1 flex-col overflow-hidden', className)}>
      {header && (
        <div className={cn('bg-background px-6 py-4 flex-shrink-0', headerClassName)}>
          <div className={cn('mx-auto w-full', widthClassName, headerInnerClassName)}>
            {header}
          </div>
        </div>
      )}

      <div className={cn('flex-1 overflow-y-auto p-6', bodyClassName)}>
        <div className={cn('mx-auto w-full', widthClassName, bodyInnerClassName)}>
          {children}
        </div>
      </div>
    </div>
  )
}

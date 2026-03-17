import { AlertTriangle, Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useGatewayRestartStore } from '@/store/gateway-restart'

export function GatewayRestartBanner() {
  const { t } = useTranslation()
  const phase = useGatewayRestartStore((state) => state.phase)
  const visible = useGatewayRestartStore((state) => state.visible)

  if (!visible || phase === 'idle') return null

  const delayed = phase === 'delayed'

  return (
    <div className="border-b border-amber-500/20 bg-amber-500/10 px-6 py-3">
      <div className="mx-auto flex max-w-5xl items-start gap-3 text-amber-800 dark:text-amber-200">
        {delayed ? (
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        ) : (
          <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin" />
        )}
        <div className="min-w-0">
          <div className="text-sm font-semibold">
            {delayed
              ? t('settings.gatewayRestartDelayedTitle')
              : t('settings.gatewayRestartingTitle')}
          </div>
          <div className="mt-1 text-xs leading-5 text-amber-700 dark:text-amber-300">
            {delayed
              ? t('settings.gatewayRestartDelayedBody')
              : t('settings.gatewayRestartingBody')}
          </div>
        </div>
      </div>
    </div>
  )
}

import { useEffect, useState } from 'react'
import { AlertTriangle, ShieldCheck } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useGatewayRestartStore } from '@/store/gateway-restart'
import { useSettingsStore } from '@/store/settings'
import { healthApi, onboardApi } from '@/services/api'

function StatusMetric({
  label,
  value,
  tone = 'default',
}: {
  label: string
  value: string
  tone?: 'default' | 'warning'
}) {
  return (
    <div
      className={`rounded-xl border px-3 py-2 ${
        tone === 'warning'
          ? 'border-yellow-500/20 bg-yellow-500/10'
          : 'border-border/60 bg-background/75'
      }`}
    >
      <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </div>
      <div
        className={`mt-1 min-w-0 break-all text-[12px] font-normal leading-4 ${
          tone === 'warning'
            ? 'text-yellow-700 dark:text-yellow-300'
            : 'text-foreground'
        }`}
      >
        {value}
      </div>
    </div>
  )
}

export function StatusFooter() {
  const { t } = useTranslation()
  const [gatewayConnected, setGatewayConnected] = useState(false)
  const [envInfo, setEnvInfo] = useState<{
    status?: 'ready' | 'warning' | 'not_ready'
    mode?: 'portable' | 'system'
    nodeVersion?: string | null
    nodeTargetVersion?: string | null
    nodeSupported?: boolean
    openclawVersion?: string | null
  } | null>(null)
  const gatewayUrl = useSettingsStore(s => s.config?.providers?.openclaw?.baseUrl)
  const restartVisible = useGatewayRestartStore((state) => state.visible)

  useEffect(() => {
    let cancelled = false

    const refresh = async () => {
      try {
        const [gatewayHealthy, status] = await Promise.all([
          gatewayUrl ? healthApi.checkGateway(gatewayUrl) : Promise.resolve(false),
          onboardApi.envStatus(),
        ])
        if (cancelled) return

        setGatewayConnected(gatewayHealthy)
        setEnvInfo({
          status: status.status,
          mode: status.mode,
          nodeVersion: status.nodeVersion,
          nodeTargetVersion: status.nodeTargetVersion,
          nodeSupported: status.nodeSupported,
          openclawVersion: status.openclawVersion,
        })
      } catch {
        if (cancelled) return
        setGatewayConnected(false)
      }
    }

    refresh()
    const interval = window.setInterval(refresh, restartVisible || !gatewayConnected ? 5000 : 30000)
    return () => {
      cancelled = true
      window.clearInterval(interval)
    }
  }, [gatewayUrl, restartVisible, gatewayConnected])

  const envModeLabel = envInfo?.mode === 'portable'
    ? t('statusFooter.modePortable')
    : envInfo?.mode === 'system'
      ? t('statusFooter.modeSystem')
      : t('settings.envNotConfigured')
  const showNodeWarning = envInfo?.status === 'warning' && envInfo.mode === 'system' && envInfo.nodeSupported === false
  const gatewayTitle = gatewayConnected ? t('statusFooter.gatewayRunning') : t('statusFooter.gatewayWaiting')
  const gatewayLabel = t('settings.envDebugGateway')
  const openclawVersion = envInfo?.openclawVersion
    ? t('statusFooter.version', { version: envInfo.openclawVersion.replace(/^v/i, '') })
    : t('settings.notDetected')
  const nodeVersion = envInfo?.nodeVersion || t('settings.notDetected')

  return (
    <>
      <div className="mx-3 h-px bg-gradient-to-r from-transparent via-border to-transparent" />
      <div className="px-3 py-3">
        <div className="overflow-hidden rounded-2xl border border-border/70 bg-gradient-to-b from-background/95 via-background/92 to-muted/45 shadow-[0_10px_30px_-18px_rgba(0,0,0,0.45)]">
          <div className="border-b border-border/60 px-3.5 py-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                  {t('statusFooter.title')}
                </div>
                <div className="mt-2 flex items-center gap-2" title={gatewayTitle}>
                  <div
                    className={`h-2.5 w-2.5 rounded-full ${
                      gatewayConnected
                        ? 'bg-emerald-500 shadow-[0_0_0_4px_rgba(16,185,129,0.12)]'
                        : 'bg-red-500 shadow-[0_0_0_4px_rgba(239,68,68,0.12)]'
                    }`}
                  />
                  <div className="min-w-0 truncate text-sm font-semibold text-foreground">
                    {gatewayLabel}
                  </div>
                </div>
              </div>

              <div
                className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] ${
                  gatewayConnected
                    ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                    : 'bg-destructive/10 text-destructive'
                }`}
              >
                <ShieldCheck className="h-3 w-3" />
                {gatewayConnected ? t('statusFooter.stateOnline') : t('statusFooter.stateOffline')}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 p-3">
            <StatusMetric
              label={t('statusFooter.appLabel')}
              value={t('statusFooter.version', { version: __APP_VERSION__ })}
            />
            <StatusMetric
              label={t('statusFooter.runtimeLabel')}
              value={openclawVersion}
            />
            <StatusMetric
              label={t('statusFooter.nodeLabel')}
              value={nodeVersion}
              tone={showNodeWarning ? 'warning' : 'default'}
            />
            <StatusMetric
              label={t('statusFooter.modeLabel')}
              value={envModeLabel}
            />
          </div>

          {showNodeWarning && (
            <div className="border-t border-yellow-500/15 bg-yellow-500/10 px-3 py-2.5">
              <div className="flex items-start gap-2 text-[11px] leading-4 text-yellow-700 dark:text-yellow-300">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                  {t('statusFooter.nodeWarning', {
                    version: envInfo.nodeVersion || t('settings.notDetected'),
                    target: envInfo.nodeTargetVersion || 'v24',
                  })}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  )
}

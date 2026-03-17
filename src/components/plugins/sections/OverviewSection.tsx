import { Loader2, Play, Square, Zap } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { ChannelSummary } from '@/types'
import DetailStat from '@/components/plugins/DetailStat'
import { Button } from '@/components/ui/button'

export default function OverviewSection(props: {
  summary?: ChannelSummary
  defaultAccountId?: string
  probePending: boolean
  enablePending: boolean
  disablePending: boolean
  logoutPending: boolean
  onProbe: () => void
  onToggleEnabled: () => void
  onLogout: () => void
}) {
  const { t } = useTranslation()
  const summary = props.summary

  return (
    <div className="border rounded-lg p-4 space-y-3">
      <h3 className="font-semibold">{t('plugins.channels.sections.overview')}</h3>
      {summary?.loaded && (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            onClick={props.onProbe}
            disabled={props.probePending}
            variant="outline"
            size="compact"
          >
            {props.probePending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
            {props.probePending ? t('plugins.channels.testing') : t('plugins.channels.testConnection')}
          </Button>
          {summary.actions.canEnable && summary.actions.canDisable && (
            <Button
              onClick={props.onToggleEnabled}
              disabled={props.enablePending || props.disablePending}
              variant="outline"
              size="compact"
            >
              {props.enablePending || props.disablePending
                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                : summary.enabled
                  ? <Square className="h-3.5 w-3.5" />
                  : <Play className="h-3.5 w-3.5" />}
              {summary.enabled ? t('plugins.channels.disableChannel') : t('plugins.channels.enableChannel')}
            </Button>
          )}
          {summary.actions.canLogout && (summary.connected || summary.running) && (
            <Button
              onClick={props.onLogout}
              disabled={props.logoutPending}
              variant="destructiveOutline"
              size="compact"
            >
              {props.logoutPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {t('plugins.channels.logout')}
            </Button>
          )}
        </div>
      )}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <DetailStat label={t('plugins.channels.loaded')} value={summary?.loaded ? t('common.yes') : t('common.no')} />
        <DetailStat label={t('plugins.channels.configured')} value={summary?.configured ? t('common.yes') : t('common.no')} />
        <DetailStat label={t('plugins.channels.connected')} value={summary?.connected ? t('common.yes') : t('common.no')} />
        <DetailStat label={t('plugins.channels.accounts')} value={String(summary?.accountCount ?? 0)} />
      </div>
      {props.defaultAccountId && (
        <DetailStat label={t('plugins.channels.defaultAccount')} value={props.defaultAccountId} />
      )}
      {summary?.lastError && (
        <div className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {summary.lastError}
        </div>
      )}
    </div>
  )
}

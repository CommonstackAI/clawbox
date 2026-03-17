import { Loader2, Play } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { ChannelAuthSession, ChannelDetailPayload, ChannelSummary } from '@/types'
import DetailStat from '@/components/plugins/DetailStat'
import { Button } from '@/components/ui/button'

export default function SetupSection(props: {
  detail?: ChannelDetailPayload
  summary?: ChannelSummary
  archetype: string
  authSession?: ChannelAuthSession
  authStartPending: boolean
  activatePending: boolean
  onStartAuth: () => void
  onCancelAuth: () => void
  onActivate: () => void
}) {
  const { t } = useTranslation()

  return (
    <div className="border rounded-lg p-4 space-y-3">
      <h3 className="font-semibold">{t('plugins.channels.sections.setup')}</h3>
      <DetailStat label={t('plugins.channels.archetype')} value={props.archetype} />
      {!props.summary?.loaded && (
        <div className="rounded-lg bg-blue-500/10 px-3 py-2 text-sm text-blue-700 dark:text-blue-400">
          {t('plugins.channels.notLoadedHint')}
        </div>
      )}
      {!props.summary?.loaded && props.summary?.configured && (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            onClick={props.onActivate}
            disabled={props.activatePending}
            variant="outline"
            size="compact"
          >
            {props.activatePending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
            {t('plugins.channels.activateChannel')}
          </Button>
          <span className="text-xs text-muted-foreground">{t('plugins.channels.activateHint')}</span>
        </div>
      )}
      {props.detail?.auth.supported && props.summary?.loaded && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              onClick={props.onStartAuth}
              disabled={props.authStartPending}
              variant="outline"
              size="compact"
            >
              {props.authStartPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
              {props.authSession ? t('plugins.channels.auth.restart') : t('plugins.channels.auth.start')}
            </Button>
            {props.authSession && ['starting', 'awaiting_scan', 'connecting'].includes(props.authSession.state) && (
              <Button
                onClick={props.onCancelAuth}
                variant="outline"
                size="compact"
              >
                {t('plugins.channels.auth.cancel')}
              </Button>
            )}
          </div>
          {props.authSession && (
            <div className="rounded-lg border bg-muted/20 p-3 space-y-3">
              <div className="text-sm font-medium">{t(`plugins.channels.auth.states.${props.authSession.state}`)}</div>
              <div className="text-sm text-muted-foreground">{props.authSession.message}</div>
              {props.authSession.qrDataUrl && (
                <div className="rounded-lg bg-white p-3 inline-block">
                  <img src={props.authSession.qrDataUrl} alt={t('plugins.channels.auth.qrAlt')} className="h-56 w-56 object-contain" />
                </div>
              )}
              {props.authSession.error && (
                <div className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {props.authSession.error}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

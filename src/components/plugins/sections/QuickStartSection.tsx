import { Loader2, Play } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { ChannelAuthSession, ChannelDetailPayload, ChannelSummary } from '@/types'
import SchemaConfigPanel from '@/components/plugins/SchemaConfigPanel'
import { getChannelUxPreset } from '@/components/plugins/ux-preset'
import { Button } from '@/components/ui/button'

export default function QuickStartSection(props: {
  channelId: string
  detail?: ChannelDetailPayload
  summary?: ChannelSummary
  authSession?: ChannelAuthSession
  authStartPending: boolean
  activatePending: boolean
  authError?: string | null
  activateError?: string | null
  onStartAuth: () => void
  onCancelAuth: () => void
  onActivate: () => Promise<void>
}) {
  const { t } = useTranslation()
  const preset = getChannelUxPreset(props.channelId)
  const essentialFields = [...new Set([
    ...preset.essentialFields,
    ...(preset.recommendedFields ?? []),
  ])]

  return (
    <div className="border rounded-xl p-5 space-y-4">
      <div>
        <h3 className="font-semibold text-lg">{t('plugins.channels.sections.quickStart')}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{t(`plugins.channels.quickStart.${props.channelId}`, { defaultValue: t('plugins.channels.quickStart.default') })}</p>
      </div>

      {!props.summary?.loaded && (
        <div className="rounded-lg bg-blue-500/10 px-3 py-2 text-sm text-blue-700 dark:text-blue-400">
          {t('plugins.channels.notLoadedHint')}
        </div>
      )}

      {preset.primaryAction === 'save_and_activate' && props.detail && (
        <SchemaConfigPanel
          channelId={props.channelId}
          detail={props.detail}
          includeKeys={essentialFields}
          compact
          submitLabel={t('plugins.channels.saveAndConnect')}
          onAfterSave={props.onActivate}
          emptyMessage={t('plugins.channels.quickStartUnavailable')}
        />
      )}

      {preset.primaryAction === 'start_auth' && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              onClick={props.onStartAuth}
              disabled={props.authStartPending}
            >
              {props.authStartPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
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
          {(props.authError || props.activateError) && (
            <div className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {props.authError || props.activateError}
            </div>
          )}
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

      {!props.summary?.loaded && props.summary?.configured && preset.primaryAction !== 'save_and_activate' && (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            onClick={() => { props.onActivate().catch(() => {}) }}
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
    </div>
  )
}

import { useTranslation } from 'react-i18next'
import type { ChannelDetailPayload } from '@/types'
import SchemaConfigPanel from '@/components/plugins/SchemaConfigPanel'

export default function ConfigSection(props: {
  channelId: string
  detail?: ChannelDetailPayload
}) {
  const { t } = useTranslation()

  return (
    <details className="border rounded-xl p-4 space-y-3 group">
      <summary className="cursor-pointer list-none flex items-center justify-between">
        <div>
          <h3 className="font-semibold">{t('plugins.channels.sections.advanced')}</h3>
          <p className="mt-1 text-xs text-muted-foreground">{t('plugins.channels.advancedHint')}</p>
        </div>
        <span className="text-xs text-muted-foreground group-open:hidden">{t('plugins.channels.showAdvanced')}</span>
        <span className="text-xs text-muted-foreground hidden group-open:inline">{t('plugins.channels.hideAdvanced')}</span>
      </summary>
      <div className="pt-3">
        {props.detail ? (
          <SchemaConfigPanel channelId={props.channelId} detail={props.detail} />
        ) : (
          <div className="rounded-lg bg-muted/30 px-3 py-3 text-sm text-muted-foreground">
            {t('plugins.channels.schemaUnavailable')}
          </div>
        )}
      </div>
    </details>
  )
}

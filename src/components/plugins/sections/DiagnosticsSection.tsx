import { useTranslation } from 'react-i18next'
import type { ChannelDetailPayload } from '@/types'

export default function DiagnosticsSection(props: {
  diagnostics?: ChannelDetailPayload['diagnostics']
}) {
  const { t } = useTranslation()

  return (
    <div className="border rounded-lg p-4 space-y-3">
      <h3 className="font-semibold">{t('plugins.channels.sections.diagnostics')}</h3>
      {props.diagnostics?.issues?.length ? (
        <div className="space-y-2">
          {props.diagnostics.issues.map((issue) => (
            <div key={issue} className="rounded-lg bg-yellow-500/10 px-3 py-2 text-sm text-yellow-800 dark:text-yellow-300">
              {issue}
            </div>
          ))}
        </div>
      ) : (
        <div className="text-sm text-muted-foreground">{t('plugins.channels.noDiagnostics')}</div>
      )}
      {props.diagnostics?.rawStatus != null && (
        <details className="rounded-lg border bg-muted/20">
          <summary className="cursor-pointer px-3 py-2 text-sm">{t('plugins.channels.rawStatus')}</summary>
          <pre className="overflow-x-auto px-3 pb-3 text-xs text-muted-foreground">
            {JSON.stringify(props.diagnostics.rawStatus, null, 2)}
          </pre>
        </details>
      )}
    </div>
  )
}

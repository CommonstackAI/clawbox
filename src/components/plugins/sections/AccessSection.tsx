import { Check, Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { ChannelDetailPayload } from '@/types'
import DetailStat from '@/components/plugins/DetailStat'
import { Button } from '@/components/ui/button'

export default function AccessSection(props: {
  pairing?: ChannelDetailPayload['pairing']
  approving: string | null
  onApprove: (code: string) => void
}) {
  const { t } = useTranslation()
  if (!props.pairing?.supported) return null

  return (
    <div className="border rounded-lg p-4 space-y-3">
      <h3 className="font-semibold">{t('plugins.channels.sections.access')}</h3>
      <DetailStat label={t('plugins.channels.pairing.pending')} value={String(props.pairing.pending.length)} />
      {props.pairing.pending.length > 0 && (
        <div className="space-y-2">
          {props.pairing.pending.map((request) => {
            const code = typeof request.code === 'string' ? request.code : ''
            const sender = typeof request.id === 'string' ? request.id : code
            return (
              <div key={code} className="flex items-center justify-between rounded-lg bg-muted/30 px-3 py-2">
                <div className="flex items-center gap-3">
                  <code className="text-sm font-mono font-bold tracking-wider">{code}</code>
                  <span className="text-xs text-muted-foreground">{sender}</span>
                </div>
                <Button
                  onClick={() => props.onApprove(code)}
                  disabled={props.approving === code}
                  size="sm"
                >
                  {props.approving === code ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                  {t('plugins.channels.pairing.approve')}
                </Button>
              </div>
            )
          })}
        </div>
      )}
      <div>
        <div className="text-xs text-muted-foreground">{t('plugins.channels.allowFrom')}</div>
        {props.pairing.allowFrom.length === 0 ? (
          <div className="mt-1 text-sm text-muted-foreground">{t('plugins.channels.pairing.noApproved')}</div>
        ) : (
          <div className="mt-2 flex flex-wrap gap-2">
            {props.pairing.allowFrom.map((entry) => (
              <span key={entry} className="rounded-md bg-muted/50 px-2.5 py-1 text-xs font-mono">
                {entry}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

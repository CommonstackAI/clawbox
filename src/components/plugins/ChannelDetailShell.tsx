import { useEffect, useState } from 'react'
import { ChevronLeft, ExternalLink } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useChannelsStore } from '@/store/channels'
import { getLocalizedChannelDescription, getLocalizedChannelDetailLabel } from '@/components/plugins/i18n'
import OverviewSection from '@/components/plugins/sections/OverviewSection'
import QuickStartSection from '@/components/plugins/sections/QuickStartSection'
import ConfigSection from '@/components/plugins/sections/ConfigSection'
import AccountsSection from '@/components/plugins/sections/AccountsSection'
import AccessSection from '@/components/plugins/sections/AccessSection'
import DiagnosticsSection from '@/components/plugins/sections/DiagnosticsSection'
import { PageShell } from '@/components/layout/PageShell'

export default function ChannelDetailShell({
  channelId,
  onBack,
}: {
  channelId: string
  onBack: () => void
}) {
  const { t, i18n } = useTranslation()
  const store = useChannelsStore()
  const detail = store.detailsById[channelId]
  const loading = store.loadingDetailById[channelId]
  const summary = store.summariesById[channelId]
  const catalog = store.catalogById[channelId]
  const title = detail?.summary.label || summary?.label || catalog?.label || channelId
  const detailLabel = getLocalizedChannelDetailLabel({
    channelId,
    catalog,
    summary,
    t,
    exists: i18n.exists,
  })
  const description = getLocalizedChannelDescription({
    channelId,
    catalog,
    summary,
    t,
    exists: i18n.exists,
  })
  const archetype = detail?.catalog.archetype || catalog?.archetype || 'unknown'
  const docsPath = detail?.catalog.docsPath || catalog?.docsPath
  const authSession = store.authSessionsByChannel[channelId]
  const [approving, setApproving] = useState<string | null>(null)

  useEffect(() => {
    store.fetchDetail(channelId, true).catch(() => {})
  }, [channelId])

  useEffect(() => {
    if (!authSession) return
    if (!['starting', 'awaiting_scan', 'connecting'].includes(authSession.state)) return
    const timer = setInterval(() => {
      store.pollAuthSession(channelId).catch(() => {})
    }, 2000)
    return () => clearInterval(timer)
  }, [channelId, authSession?.sessionId, authSession?.state])

  const handleApprove = async (code: string) => {
    setApproving(code)
    try {
      await store.approvePairing(channelId, code)
      await store.fetchDetail(channelId, true)
    } finally {
      setApproving(null)
    }
  }

  if (loading && !detail) {
    return (
      <PageShell
        variant="detail"
        header={(
          <div className="flex items-center gap-3">
            <button onClick={onBack} className="p-1.5 -ml-1.5 rounded-md hover:bg-muted transition-colors">
              <ChevronLeft className="h-5 w-5" />
            </button>
            <div className="space-y-2">
              <div className="h-5 w-40 rounded bg-muted animate-pulse" />
              <div className="h-4 w-64 rounded bg-muted animate-pulse" />
            </div>
          </div>
        )}
      >
        <div className="space-y-4">
          {[1, 2, 3].map((item) => (
            <div key={item} className="h-32 rounded-lg border bg-muted/20 animate-pulse" />
          ))}
        </div>
      </PageShell>
    )
  }

  return (
    <PageShell
      variant="detail"
      header={(
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <button onClick={onBack} className="p-1.5 -ml-1.5 rounded-md hover:bg-muted transition-colors">
              <ChevronLeft className="h-5 w-5" />
            </button>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-xl font-semibold">{title}</h2>
                {summary?.loaded ? (
                  <span className="rounded-full bg-green-500/10 px-2 py-0.5 text-[11px] text-green-700 dark:text-green-400">
                    {t('plugins.channels.loaded')}
                  </span>
                ) : summary?.installable ? (
                  <span className="rounded-full bg-blue-500/10 px-2 py-0.5 text-[11px] text-blue-700 dark:text-blue-400">
                    {t('plugins.channels.installable')}
                  </span>
                ) : null}
              </div>
              {detailLabel && (
                <div className="mt-2 text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground/70">
                  {detailLabel}
                </div>
              )}
              <p className="text-sm text-muted-foreground">{description}</p>
            </div>
          </div>
          {docsPath && (
            <a
              href={`https://docs.openclaw.ai${docsPath}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs hover:bg-muted transition-colors"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              {t('plugins.channels.docs')}
            </a>
          )}
        </div>
      )}
    >
      <div className="space-y-6">
        <OverviewSection
          summary={summary}
          defaultAccountId={summary?.defaultAccountId}
          probePending={Boolean(store.opStateByKey[`probe:${channelId}`]?.pending)}
          enablePending={Boolean(store.opStateByKey[`enable:${channelId}`]?.pending)}
          disablePending={Boolean(store.opStateByKey[`disable:${channelId}`]?.pending)}
          logoutPending={Boolean(store.opStateByKey[`logout:${channelId}`]?.pending)}
          onProbe={() => { store.probeChannel(channelId).catch(() => {}) }}
          onToggleEnabled={() => {
            if (!summary) return
            if (summary.enabled) {
              store.disableChannel(channelId).catch(() => {})
              return
            }
            store.enableChannel(channelId).catch(() => {})
          }}
          onLogout={() => { store.logoutChannel(channelId).catch(() => {}) }}
        />

        <QuickStartSection
          channelId={channelId}
          detail={detail}
          summary={summary}
          authSession={authSession}
          authStartPending={Boolean(store.opStateByKey[`auth-start:${channelId}`]?.pending)}
          activatePending={Boolean(store.opStateByKey[`activate:${channelId}`]?.pending)}
          authError={store.opStateByKey[`auth-start:${channelId}`]?.error || authSession?.error || null}
          activateError={store.opStateByKey[`activate:${channelId}`]?.error || null}
          onStartAuth={() => { store.startAuthSession(channelId).catch(() => {}) }}
          onCancelAuth={() => { store.cancelAuthSession(channelId).catch(() => {}) }}
          onActivate={async () => { await store.activateChannel(channelId) }}
        />

        <AccessSection
          pairing={detail?.pairing}
          approving={approving}
          onApprove={handleApprove}
        />

        <AccountsSection
          channelId={channelId}
          detail={detail}
          summary={summary}
        />

        <ConfigSection channelId={channelId} detail={detail} />

        <DiagnosticsSection diagnostics={detail?.diagnostics} />
      </div>
    </PageShell>
  )
}

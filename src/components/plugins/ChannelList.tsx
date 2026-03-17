import { useTranslation } from 'react-i18next'
import { Search } from 'lucide-react'
import { useChannelsStore } from '@/store/channels'
import type { ChannelSummary } from '@/types'
import { getLocalizedChannelDescription, getLocalizedChannelDetailLabel } from '@/components/plugins/i18n'
import { PageShell } from '@/components/layout/PageShell'
import { ChannelIcon, getChannelIconPresentation } from '@/components/plugins/channel-icons'

function StatusDot({ status }: { status: string }) {
  const color = {
    connected: 'bg-green-500',
    connecting: 'bg-yellow-500 animate-pulse',
    error: 'bg-red-500',
    disconnected: 'bg-zinc-400',
  }[status] || 'bg-zinc-400'

  return <span className={`inline-block w-2 h-2 rounded-full ${color}`} />
}

function channelSummaryStatusText(summary: ChannelSummary | undefined, t: (key: string) => string) {
  if (!summary) return { status: 'disconnected', label: t('plugins.channels.readyToConnect') }
  if (summary.connected) return { status: 'connected', label: t('plugins.channels.runningReady') }
  if (summary.running) return { status: 'connecting', label: t('plugins.channels.activating') }
  if (summary.lastError) return { status: 'error', label: t('plugins.channels.error') }
  if (summary.loaded) return { status: 'disconnected', label: summary.configured ? t('plugins.channels.pendingConnection') : t('plugins.channels.notConfigured') }
  if (summary.configured) return { status: 'disconnected', label: t('plugins.channels.pendingActivation') }
  if (summary.installable) return { status: 'disconnected', label: t('plugins.channels.readyToConnect') }
  return { status: 'disconnected', label: t('plugins.channels.pendingActivation') }
}

export default function ChannelList() {
  const { t, i18n } = useTranslation()
  const store = useChannelsStore()
  const normalizedQuery = store.filters.query.trim().toLowerCase()

  const channelItems = store.orderedIds
    .map((id) => {
      const catalog = store.catalogById[id]
      const summary = store.summariesById[id]
      const { status, label } = channelSummaryStatusText(summary, t)
      const itemLabel = summary?.label || catalog?.label || id
      const itemDescription = getLocalizedChannelDescription({
        channelId: id,
        catalog,
        summary,
        t,
        exists: i18n.exists,
      })
      const itemDetailLabel = getLocalizedChannelDetailLabel({
        channelId: id,
        catalog,
        summary,
        t,
        exists: i18n.exists,
      })
      const searchable = [itemLabel, itemDetailLabel || '', itemDescription, id, ...(catalog?.aliases || [])]
        .join(' ')
        .toLowerCase()
      const iconKey = catalog?.iconKey || id
      const iconPresentation = getChannelIconPresentation(iconKey, id)
      return {
        id,
        label: itemLabel,
        detailLabel: itemDetailLabel,
        description: itemDescription,
        iconKey,
        iconPresentation,
        status,
        statusLabel: label,
        loaded: Boolean(summary?.loaded),
        installable: Boolean(summary?.installable),
        searchable,
      }
    })
    .filter((item) => {
      if (store.filters.mode === 'loaded' && !item.loaded) return false
      if (store.filters.mode === 'installable' && !item.installable) return false
      if (normalizedQuery && !item.searchable.includes(normalizedQuery)) return false
      return true
    })
  const loadedCount = channelItems.filter((item) => item.loaded).length
  const installableCount = channelItems.filter((item) => item.installable).length
  const showInitialSkeleton = !store.listHydrated

  return (
    <PageShell
      variant="list"
      headerClassName="py-5"
      header={(
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">{t('plugins.title')}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t('plugins.description')}</p>
          <div className="mt-5 rounded-[28px] border border-border/70 bg-gradient-to-br from-card via-card/95 to-muted/35 p-4 shadow-[0_16px_40px_-24px_rgba(0,0,0,0.28)] sm:p-5">
            <div className="space-y-4">
              <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                <div className="inline-flex w-fit items-center gap-1 rounded-2xl border border-border/70 bg-background/70 p-1 shadow-sm">
                  {(['all', 'loaded', 'installable'] as const).map((mode) => (
                    <button
                      key={mode}
                      onClick={() => store.setMode(mode)}
                      className={`inline-flex items-center rounded-xl px-3 py-2 text-sm font-medium transition-all ${
                        store.filters.mode === mode
                          ? 'bg-primary text-primary-foreground shadow-sm'
                          : 'text-muted-foreground hover:bg-muted/70 hover:text-foreground'
                      }`}
                    >
                      {t(`plugins.channels.filters.${mode}`)}
                    </button>
                  ))}
                </div>

                <div className="min-w-0 flex-1 xl:max-w-3xl">
                  <label className="sr-only" htmlFor="channel-search">{t('plugins.channels.searchPlaceholder')}</label>
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/70" />
                    <input
                      id="channel-search"
                      type="text"
                      value={store.filters.query}
                      onChange={(e) => store.setQuery(e.target.value)}
                      placeholder={t('plugins.channels.searchPlaceholder')}
                      className="w-full rounded-2xl border border-border/70 bg-background/85 px-11 py-3 text-sm shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span className="rounded-full border border-border/60 bg-background/65 px-3 py-1.5">
                  {t('plugins.channels.summary.total', { count: channelItems.length })}
                </span>
                <span className="rounded-full border border-border/60 bg-background/65 px-3 py-1.5">
                  {t('plugins.channels.summary.loaded', { count: loadedCount })}
                </span>
                <span className="rounded-full border border-border/60 bg-background/65 px-3 py-1.5">
                  {t('plugins.channels.summary.installable', { count: installableCount })}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    >
      <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
        {(store.gatewayError || store.globalError || store.error) && (
          <div className="rounded-xl bg-amber-500/10 px-4 py-3 text-sm text-amber-600 md:col-span-2 dark:text-amber-400 2xl:col-span-3">
            {t('plugins.channels.notConnected')}
          </div>
        )}

        {showInitialSkeleton ? (
          Array.from({ length: 6 }, (_, index) => String(index)).map((id) => (
            <div
              key={id}
              className="flex min-h-36 items-center gap-4 rounded-2xl border p-5 animate-pulse"
            >
              <div className="h-12 w-12 rounded-xl bg-muted flex-shrink-0" />
              <div className="min-w-0 flex-1 space-y-2">
                <div className="h-4 w-28 rounded bg-muted" />
                <div className="h-3 w-40 rounded bg-muted" />
                <div className="h-3 w-56 rounded bg-muted" />
              </div>
              <div className="flex flex-shrink-0 items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-muted" />
                <div className="h-3 w-16 rounded bg-muted" />
              </div>
            </div>
          ))
        ) : (
          channelItems.map((item) => (
            <button
              key={item.id}
              onClick={() => store.openChannel(item.id)}
              className="group flex min-h-36 flex-col justify-between rounded-2xl border p-5 text-left transition-colors hover:bg-accent"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex min-w-0 items-start gap-4">
                  <div
                    className={`flex h-12 w-12 items-center justify-center rounded-xl flex-shrink-0 ${
                      item.iconPresentation.isBrandIcon ? '' : 'bg-blue-500/10'
                    }`}
                    style={item.iconPresentation.backgroundColor ? { backgroundColor: item.iconPresentation.backgroundColor } : undefined}
                  >
                    <ChannelIcon
                      iconKey={item.iconKey}
                      channelId={item.id}
                      className={`h-5 w-5 ${item.iconPresentation.isBrandIcon ? '' : 'text-blue-500'}`}
                    />
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="text-lg font-semibold leading-none">{item.label}</div>
                      {item.loaded && (
                        <span className="rounded-full bg-green-500/10 px-2 py-0.5 text-[11px] text-green-700 dark:text-green-400">
                          {t('plugins.channels.loaded')}
                        </span>
                      )}
                      {item.installable && (
                        <span className="rounded-full bg-blue-500/10 px-2 py-0.5 text-[11px] text-blue-700 dark:text-blue-400">
                          {t('plugins.channels.installable')}
                        </span>
                      )}
                    </div>
                    {item.detailLabel && (
                      <div className="mt-2 text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground/70">
                        {item.detailLabel}
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex flex-shrink-0 items-center gap-2 self-start text-sm text-muted-foreground">
                  <StatusDot status={item.status} />
                  <span>{item.statusLabel}</span>
                </div>
              </div>

              <div className="mt-5 pr-2 text-sm leading-6 text-muted-foreground">
                {item.description}
              </div>
            </button>
          ))
        )}

        {!store.loadingCatalog && channelItems.length === 0 && (
          <div className="rounded-2xl border border-dashed px-4 py-8 text-center text-sm text-muted-foreground md:col-span-2 2xl:col-span-3">
            {t('plugins.channels.empty')}
          </div>
        )}
      </div>
    </PageShell>
  )
}

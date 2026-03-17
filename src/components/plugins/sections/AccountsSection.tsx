import { useEffect, useMemo, useState } from 'react'
import { Loader2, Trash2, UserPlus } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useChannelsStore } from '@/store/channels'
import type { ChannelDetailPayload, ChannelSummary } from '@/types'
import SchemaConfigPanel from '@/components/plugins/SchemaConfigPanel'
import { getChannelUxPreset } from '@/components/plugins/ux-preset'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

function resolveAccountSchema(detail?: ChannelDetailPayload): Record<string, unknown> | null {
  const schema = detail?.schema
  if (!schema || typeof schema !== 'object') return null
  const accountsSchema = (schema as Record<string, any>)?.properties?.accounts
  if (accountsSchema && typeof accountsSchema === 'object') {
    const additional = accountsSchema.additionalProperties
    if (additional && typeof additional === 'object' && !Array.isArray(additional)) {
      return additional as Record<string, unknown>
    }
  }
  return null
}

function resolveConfigAccounts(detail?: ChannelDetailPayload): Record<string, Record<string, unknown>> {
  const raw = detail?.config && typeof detail.config === 'object'
    ? (detail.config as Record<string, any>).accounts
    : undefined
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  return raw as Record<string, Record<string, unknown>>
}

export default function AccountsSection({
  channelId,
  detail,
  summary,
}: {
  channelId: string
  detail?: ChannelDetailPayload
  summary?: ChannelSummary
}) {
  const { t } = useTranslation()
  const store = useChannelsStore()
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null)
  const [newAccountId, setNewAccountId] = useState('')
  const [adding, setAdding] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)
  const configAccounts = resolveConfigAccounts(detail)
  const accountSchema = resolveAccountSchema(detail)
  const preset = getChannelUxPreset(channelId)
  const accountQuickFields = [...new Set([
    ...preset.essentialFields,
    ...(preset.recommendedFields ?? []),
  ])]
  const supportsAccounts =
    Boolean(accountSchema) ||
    Object.keys(configAccounts).length > 0 ||
    (summary?.accountCount ?? 0) > 0 ||
    summary?.capabilities.multiAccount === true

  const accounts = useMemo(() => {
    return (summary?.accounts ?? []).slice().sort((a, b) => {
      if (a.accountId === summary?.defaultAccountId) return -1
      if (b.accountId === summary?.defaultAccountId) return 1
      return a.accountId.localeCompare(b.accountId)
    })
  }, [summary?.accounts, summary?.defaultAccountId])
  const namedAccountIds = new Set<string>([
    ...accounts.map((account) => account.accountId),
    ...Object.keys(configAccounts),
  ].filter((accountId) => accountId !== 'default'))
  const hasNamedAccounts = namedAccountIds.size > 0
  const shouldShowAccountEditor = Boolean(selectedAccountId) && (hasNamedAccounts || selectedAccountId !== 'default')

  useEffect(() => {
    if (!supportsAccounts) return
    if (selectedAccountId && accounts.some((account) => account.accountId === selectedAccountId)) return
    if (hasNamedAccounts) {
      const firstNamedAccount = accounts.find((account) => account.accountId !== 'default')?.accountId
      setSelectedAccountId(firstNamedAccount || summary?.defaultAccountId || accounts[0]?.accountId || null)
      return
    }
    setSelectedAccountId(summary?.defaultAccountId || accounts[0]?.accountId || null)
  }, [summary?.defaultAccountId, supportsAccounts, accounts, selectedAccountId, hasNamedAccounts])

  if (!supportsAccounts) return null

  const selectedConfig = selectedAccountId
    ? configAccounts[selectedAccountId] || {}
    : {}

  const handleSetDefault = async (accountId: string) => {
    await store.updateChannelConfig(channelId, { defaultAccount: accountId })
    await store.fetchDetail(channelId, true)
  }

  const handleAddAccount = async () => {
    const accountId = newAccountId.trim()
    if (!accountId) return
    setAdding(true)
    try {
      await store.updateChannelConfig(channelId, {
        accounts: {
          [accountId]: {
            enabled: true,
          },
        },
      })
      setNewAccountId('')
      setSelectedAccountId(accountId)
    } finally {
      setAdding(false)
    }
  }

  const handleDeleteAccount = async (accountId: string) => {
    setDeleting(accountId)
    try {
      const fallback = accounts.find((entry) => entry.accountId !== accountId)?.accountId ?? null
      await store.updateChannelConfig(channelId, {
        accounts: {
          [accountId]: null,
        },
        ...(summary?.defaultAccountId === accountId
          ? { defaultAccount: fallback }
          : {}),
      })
      if (selectedAccountId === accountId) {
        setSelectedAccountId(fallback)
      }
    } finally {
      setDeleting(null)
    }
  }

  return (
    <div className="border rounded-lg p-4 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold">{t('plugins.channels.sections.accounts')}</h3>
          <p className="text-xs text-muted-foreground">{t('plugins.channels.accountsHint')}</p>
        </div>
      </div>

      <div className="flex flex-col gap-3 md:flex-row">
        <div className="md:w-72 space-y-2">
          {hasNamedAccounts && accounts.map((account) => {
            const isDefault = account.accountId === summary?.defaultAccountId
            const isSelected = account.accountId === selectedAccountId
            return (
              <div
                key={account.accountId}
                className={`rounded-lg border p-3 space-y-2 ${isSelected ? 'border-primary bg-primary/5' : ''}`}
              >
                <button
                  onClick={() => setSelectedAccountId(account.accountId)}
                  className="w-full text-left"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-medium">{account.name || account.accountId}</div>
                    {isDefault && (
                      <span className="rounded-full bg-green-500/10 px-2 py-0.5 text-[11px] text-green-700 dark:text-green-400">
                        {t('plugins.channels.defaultAccount')}
                      </span>
                    )}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">{account.accountId}</div>
                </button>

                <div className="flex flex-wrap gap-2">
                  {!isDefault && (
                    <Button
                      onClick={() => handleSetDefault(account.accountId)}
                      variant="outline"
                      size="sm"
                    >
                      {t('plugins.channels.makeDefault')}
                    </Button>
                  )}
                  <Button
                    onClick={() => {
                      if (account.enabled === false) {
                        store.enableChannel(channelId, account.accountId).catch(() => {})
                        return
                      }
                      store.disableChannel(channelId, account.accountId).catch(() => {})
                    }}
                    variant="outline"
                    size="sm"
                  >
                    {account.enabled === false ? t('plugins.channels.enableChannel') : t('plugins.channels.disableChannel')}
                  </Button>
                  {summary?.actions.canLogout && (
                    <Button
                      onClick={() => { store.logoutChannel(channelId, account.accountId).catch(() => {}) }}
                      variant="destructiveOutline"
                      size="sm"
                    >
                      {t('plugins.channels.logout')}
                    </Button>
                  )}
                  {configAccounts[account.accountId] && (
                    <Button
                      onClick={() => handleDeleteAccount(account.accountId)}
                      disabled={deleting === account.accountId}
                      variant="destructiveOutline"
                      size="sm"
                    >
                      {deleting === account.accountId ? <Loader2 className="h-3 w-3 animate-spin inline-block" /> : <Trash2 className="h-3 w-3 inline-block" />}
                    </Button>
                  )}
                </div>
              </div>
            )
          })}

          <div className="rounded-lg border border-dashed p-3 space-y-2">
            {!hasNamedAccounts && (
              <p className="text-xs text-muted-foreground">{t('plugins.channels.accountsOptionalHint')}</p>
            )}
            <label className="text-xs text-muted-foreground">{t('plugins.channels.newAccountId')}</label>
            <Input
              type="text"
              value={newAccountId}
              onChange={(e) => setNewAccountId(e.target.value)}
              placeholder={t('plugins.channels.newAccountPlaceholder')}
            />
            <Button
              onClick={handleAddAccount}
              disabled={!newAccountId.trim() || adding}
              variant="outline"
              size="compact"
            >
              {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
              {t('plugins.channels.addAccount')}
            </Button>
          </div>
        </div>

        <div className="flex-1 min-w-0">
          {shouldShowAccountEditor && selectedAccountId ? (
            <div className="space-y-4">
              <div className="border rounded-xl p-4 space-y-3">
                <div>
                  <h4 className="font-semibold">{t('plugins.channels.accountQuickStart')}</h4>
                  <p className="mt-1 text-xs text-muted-foreground">{t('plugins.channels.accountQuickStartHint')}</p>
                </div>
                <SchemaConfigPanel
                  channelId={channelId}
                  detail={detail ?? {
                    catalog: summary ? {
                      id: summary.id,
                      label: summary.label,
                      description: summary.description,
                      order: 0,
                      source: summary.source,
                      archetype: 'unknown',
                      capabilities: summary.capabilities,
                      defaults: {
                        supportsPairing: false,
                        supportsProbe: false,
                        supportsLogout: false,
                        supportsConfig: true,
                        supportsAuthFlow: false,
                      },
                    } : undefined as never,
                    summary: summary!,
                    config: {},
                    schema: null,
                    uiHints: null,
                    diagnostics: { issues: [] },
                    pairing: { supported: false, pending: [], allowFrom: [] },
                    auth: { supported: false, state: 'unsupported' },
                  }}
                  schemaRoot={accountSchema}
                  configRoot={selectedConfig}
                  patchPathSegments={['accounts', selectedAccountId]}
                  includeKeys={accountQuickFields}
                  compact
                  submitLabel={t('plugins.channels.saveConfig')}
                  emptyMessage={t('plugins.channels.accountSchemaUnavailable')}
                />
              </div>

              <details className="border rounded-xl p-4 space-y-3 group">
                <summary className="cursor-pointer list-none flex items-center justify-between">
                  <div>
                    <h4 className="font-semibold">{t('plugins.channels.accountAdvanced')}</h4>
                    <p className="mt-1 text-xs text-muted-foreground">{t('plugins.channels.accountAdvancedHint')}</p>
                  </div>
                  <span className="text-xs text-muted-foreground group-open:hidden">{t('plugins.channels.showAdvanced')}</span>
                  <span className="text-xs text-muted-foreground hidden group-open:inline">{t('plugins.channels.hideAdvanced')}</span>
                </summary>
                <div className="pt-3">
                  <SchemaConfigPanel
                    channelId={channelId}
                    detail={detail ?? {
                      catalog: summary ? {
                        id: summary.id,
                        label: summary.label,
                        description: summary.description,
                        order: 0,
                        source: summary.source,
                        archetype: 'unknown',
                        capabilities: summary.capabilities,
                        defaults: {
                          supportsPairing: false,
                          supportsProbe: false,
                          supportsLogout: false,
                          supportsConfig: true,
                          supportsAuthFlow: false,
                        },
                      } : undefined as never,
                      summary: summary!,
                      config: {},
                      schema: null,
                      uiHints: null,
                      diagnostics: { issues: [] },
                      pairing: { supported: false, pending: [], allowFrom: [] },
                      auth: { supported: false, state: 'unsupported' },
                    }}
                    schemaRoot={accountSchema}
                    configRoot={selectedConfig}
                    patchPathSegments={['accounts', selectedAccountId]}
                    emptyMessage={t('plugins.channels.accountSchemaUnavailable')}
                  />
                </div>
              </details>
            </div>
          ) : (
            <div className="rounded-lg bg-muted/30 px-3 py-3 text-sm text-muted-foreground">
              {t('plugins.channels.accountsOptionalEmpty')}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

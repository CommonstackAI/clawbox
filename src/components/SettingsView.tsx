import { useState, useEffect } from 'react'
import { Save, CheckCircle, XCircle, Loader2, RefreshCw } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useSettingsStore } from '@/store/settings'
import { openclawApi, onboardApi } from '@/services/api'
import { CustomSelect } from '@/components/ui/custom-select'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  COMMONSTACK_NODE_OPTIONS,
  CUSTOM_PROVIDER_ID,
  DEFAULT_COMMONSTACK_BASE_URL,
  DEFAULT_CUSTOM_PROVIDER_COMPATIBILITY,
  buildModelRef,
  getCustomProviderApiKeyPlaceholder,
  getCustomProviderBaseUrlPlaceholder,
  getActiveUpstreamProviderType,
  getModelRefProviderId,
  normalizeCustomProviderBaseUrl,
  normalizeCustomProviderCompatibility,
  requiresAkPrefixedApiKey,
  resolveProviderApi,
  stripModelRefProvider,
} from '@/lib/provider-config'
import { formatProviderRequestError } from '@/lib/provider-errors'
import { trackExpectedGatewayRestart } from '@/store/gateway-restart'
import type { CustomProviderCompatibility, UpstreamProviderType } from '@/types'

interface SettingsViewProps {
  onReconfigure?: (savedApiKey?: string) => void
}

function buildProviderModelPatch(params: {
  providerId: string
  baseUrl: string
  apiKey: string
  providerApi: 'openai-completions' | 'anthropic-messages'
  modelIds: string[]
  defaultModelRef: string
}) {
  const providerModels = params.modelIds.map((id) => ({
    id,
    name: id,
    reasoning: false,
    input: ['text'],
    contextWindow: 128000,
    maxTokens: 16384,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  }))

  return {
    models: {
      mode: 'merge',
      providers: {
        [params.providerId]: {
          baseUrl: params.baseUrl,
          apiKey: params.apiKey,
          api: params.providerApi,
          models: providerModels,
        },
      },
    },
    agents: {
      defaults: {
        model: {
          primary: params.defaultModelRef,
        },
        models: Object.fromEntries(
          params.modelIds.map((id) => [buildModelRef(params.providerId, id), {}]),
        ),
      },
    },
  }
}

export function SettingsView(_props: SettingsViewProps) {
  const { t } = useTranslation()
  const { config, models, loadConfig, fetchModels, switchModel } = useSettingsStore()

  const [gatewayUrl, setGatewayUrl] = useState('http://127.0.0.1:18789/v1')
  const [saving, setSaving] = useState(false)
  const [checking, setChecking] = useState(false)
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'ok' | 'error'>('idle')
  const [connectionError, setConnectionError] = useState('')
  const [saved, setSaved] = useState(false)
  const [providerType, setProviderType] = useState<UpstreamProviderType>('commonstack')
  const [commonstackBaseUrl, setCommonstackBaseUrl] = useState<string>(DEFAULT_COMMONSTACK_BASE_URL)
  const [commonstackApiKey, setCommonstackApiKey] = useState('')
  const [customBaseUrl, setCustomBaseUrl] = useState('')
  const [customApiKey, setCustomApiKey] = useState('')
  const [customCompatibility, setCustomCompatibility] = useState<CustomProviderCompatibility>(
    DEFAULT_CUSTOM_PROVIDER_COMPATIBILITY,
  )
  const [providerError, setProviderError] = useState('')

  const rawDefaultModel = config?.providers?.openclaw?.defaultModel || ''
  const defaultModel = stripModelRefProvider(rawDefaultModel)
  const activeProviderType = getActiveUpstreamProviderType(config)
  const activeProviderId = providerType === 'commonstack'
    ? 'commonstack'
    : (config?.providers?.openclaw?.upstream?.custom?.providerId || CUSTOM_PROVIDER_ID)
  const loadedProviderId = models[0] ? getModelRefProviderId(models[0]) : ''
  const providerModelsAreCurrent = !loadedProviderId || loadedProviderId === activeProviderId
  const modelSelectValue =
    getModelRefProviderId(rawDefaultModel) === activeProviderId ? rawDefaultModel : ''
  const customProviderBaseUrlPlaceholder = getCustomProviderBaseUrlPlaceholder(customCompatibility)
  const customProviderApiKeyPlaceholder = getCustomProviderApiKeyPlaceholder(customCompatibility)
  const customCompatibilityOptions: Array<{
    value: CustomProviderCompatibility
    label: string
    description: string
  }> = [
    {
      value: 'openai',
      label: t('settings.providerCompatibilityOpenai'),
      description: t('settings.providerCompatibilityOpenaiDesc'),
    },
    {
      value: 'anthropic',
      label: t('settings.providerCompatibilityAnthropic'),
      description: t('settings.providerCompatibilityAnthropicDesc'),
    },
  ]
  const selectedCustomCompatibilityOption =
    customCompatibilityOptions.find(option => option.value === customCompatibility) ?? customCompatibilityOptions[0]

  useEffect(() => { loadConfig() }, [])

  useEffect(() => {
    if (!config) return
    const url = config.providers?.openclaw?.baseUrl || 'http://127.0.0.1:18789/v1'
    setGatewayUrl(url)
    setProviderType(getActiveUpstreamProviderType(config))
    setCommonstackBaseUrl(
      config.providers?.openclaw?.upstream?.commonstack?.baseUrl || DEFAULT_COMMONSTACK_BASE_URL,
    )
    setCommonstackApiKey(config.providers?.openclaw?.upstream?.commonstack?.apiKey || '')
    setCustomBaseUrl(config.providers?.openclaw?.upstream?.custom?.baseUrl || '')
    setCustomApiKey(config.providers?.openclaw?.upstream?.custom?.apiKey || '')
    setCustomCompatibility(
      normalizeCustomProviderCompatibility(config.providers?.openclaw?.upstream?.custom?.compatibility),
    )
    if (models.length === 0) {
      fetchModels().then(() => setConnectionStatus('ok')).catch(() => {})
    }
  }, [config])

  const checkConnection = async () => {
    setChecking(true)
    setConnectionStatus('idle')
    try {
      const result = await openclawApi.check(gatewayUrl)
      if (result.ok) {
        setConnectionStatus('ok')
        await fetchModels()
      } else {
        setConnectionStatus('error')
        setConnectionError(result.error || 'Connection failed')
      }
    } catch (e: any) {
      setConnectionStatus('error')
      setConnectionError(e.message || 'Connection failed')
    } finally {
      setChecking(false)
    }
  }

  const handleSave = async () => {
    if (!config) return

    const selectedBaseUrl =
      providerType === 'commonstack'
        ? commonstackBaseUrl.trim()
        : normalizeCustomProviderBaseUrl(customBaseUrl, customCompatibility)
    const selectedApiKey =
      providerType === 'commonstack' ? commonstackApiKey.trim() : customApiKey.trim()
    const selectedCustomCompatibility = normalizeCustomProviderCompatibility(customCompatibility)

    setSaving(true)
    setProviderError('')
    setConnectionError('')

    try {
      if (!selectedBaseUrl) {
        throw new Error(t('settings.providerBaseUrlRequired'))
      }
      if (!selectedApiKey) {
        throw new Error(t('settings.providerApiKeyRequired'))
      }
      if (requiresAkPrefixedApiKey(providerType, selectedBaseUrl) && !selectedApiKey.startsWith('ak-')) {
        throw new Error(t('settings.providerCommonstackApiKeyError'))
      }

      const providerId =
        providerType === 'commonstack'
          ? 'commonstack'
          : (config.providers?.openclaw?.upstream?.custom?.providerId || CUSTOM_PROVIDER_ID)

      const { models: fetchedModels } = await onboardApi.models(
        selectedBaseUrl,
        selectedApiKey,
        providerType === 'custom' ? selectedCustomCompatibility : undefined,
      )
      if (!fetchedModels || fetchedModels.length === 0) {
        throw new Error(t('settings.providerNoModels'))
      }

      const modelRefs = fetchedModels.map((modelId) => buildModelRef(providerId, modelId))
      const currentDefaultMatchesProvider = getModelRefProviderId(rawDefaultModel) === providerId
      const preferredModel =
        currentDefaultMatchesProvider && modelRefs.includes(rawDefaultModel)
          ? rawDefaultModel
          : modelRefs.find((modelRef) => stripModelRefProvider(modelRef) === 'openai/gpt-4o-mini')
              || modelRefs[0]

      void trackExpectedGatewayRestart(gatewayUrl, 'settings-provider', () => useSettingsStore.getState().getGatewayUrl())
      try {
        await openclawApi.patchConfig(
          gatewayUrl,
          buildProviderModelPatch({
            providerId,
            baseUrl: selectedBaseUrl,
            apiKey: selectedApiKey,
            providerApi: resolveProviderApi(providerType, selectedCustomCompatibility),
            modelIds: fetchedModels,
            defaultModelRef: preferredModel,
          }),
        )
      } catch (e) {
        // Gateway restarts after config.patch, which may interrupt the request.
        console.info('Gateway provider patch completed (gateway may have restarted):', e)
      }

      await new Promise((resolve) => setTimeout(resolve, 3000))
      const start = Date.now()
      while (Date.now() - start < 60000) {
        const ok = await openclawApi.check(gatewayUrl).then((res) => res.ok).catch(() => false)
        if (ok) {
          break
        }
        await new Promise((resolve) => setTimeout(resolve, 2000))
      }

      await loadConfig()
      await fetchModels()
      setConnectionStatus('ok')
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (e: any) {
      const rawMessage = e.message || t('settings.providerSaveFailed')
      setProviderError(
        formatProviderRequestError(rawMessage, selectedBaseUrl, (...args) => String(t(...args as [any]))),
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden h-full">
      <div className="px-6 py-4 flex items-center justify-between bg-background flex-shrink-0">
        <div>
          <h2 className="text-xl font-semibold">{t('settings.title')}</h2>
          <p className="text-sm text-muted-foreground">{t('settings.description')}</p>
        </div>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {saved ? t('common.saved') : t('common.save')}
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-2xl mx-auto space-y-6">
          {/* Provider Configuration */}
          <div className="border rounded-lg p-4 space-y-4">
            <div>
              <h3 className="font-semibold">{t('settings.providerConfig')}</h3>
              <p className="text-xs text-muted-foreground mt-1">{t('settings.providerConfigDesc')}</p>
            </div>

            <div>
              <label className="text-xs text-muted-foreground">{t('settings.providerSelectLabel')}</label>
              <CustomSelect
                value={providerType}
                onChange={(value) => {
                  setProviderType(value as UpstreamProviderType)
                  setProviderError('')
                }}
                options={[
                  { value: 'commonstack', label: t('settings.providerCommonstackRecommended') },
                  { value: 'custom', label: t('settings.providerCustom') },
                ]}
              />
            </div>

            <div className="rounded-xl border border-sky-200/60 bg-sky-50/70 px-4 py-3 text-sm leading-7 text-sky-950 dark:border-sky-900/40 dark:bg-sky-950/30 dark:text-sky-100">
              <span className="font-semibold">
                {providerType === 'commonstack'
                  ? t('settings.providerCommonstack')
                  : t('settings.providerCustom')}
              </span>
              {' '}
              {providerType === 'commonstack'
                ? t('settings.providerCommonstackHint')
                : t('settings.providerCustomHint')}
            </div>

            {providerType === 'commonstack' ? (
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-muted-foreground">{t('settings.providerNode')}</label>
                  <CustomSelect
                    value={commonstackBaseUrl}
                    onChange={setCommonstackBaseUrl}
                    options={COMMONSTACK_NODE_OPTIONS.map((node) => ({
                      value: node.url,
                      label: node.label,
                    }))}
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">{t('settings.providerApiKeyLabel')}</label>
                  <Input
                    type="password"
                    value={commonstackApiKey}
                    onChange={(e) => {
                      setCommonstackApiKey(e.target.value)
                      setProviderError('')
                    }}
                    className="font-mono"
                    placeholder="ak-..."
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-muted-foreground">{t('settings.providerCompatibilityLabel')}</label>
                  <div className="mt-2">
                    <CustomSelect
                      value={customCompatibility}
                      onChange={(value) => {
                        setCustomCompatibility(value as CustomProviderCompatibility)
                        setProviderError('')
                      }}
                      options={customCompatibilityOptions.map(option => ({
                        value: option.value,
                        label: option.label,
                      }))}
                    />
                    <p className="mt-2 text-xs leading-5 text-muted-foreground">
                      {selectedCustomCompatibilityOption.description}
                    </p>
                  </div>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">{t('settings.providerBaseUrl')}</label>
                  <Input
                    type="text"
                    value={customBaseUrl}
                    onChange={(e) => {
                      setCustomBaseUrl(e.target.value)
                      setProviderError('')
                    }}
                    placeholder={customProviderBaseUrlPlaceholder}
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">{t('settings.providerApiKeyLabel')}</label>
                  <Input
                    type="password"
                    value={customApiKey}
                    onChange={(e) => {
                      setCustomApiKey(e.target.value)
                      setProviderError('')
                    }}
                    className="font-mono"
                    placeholder={customProviderApiKeyPlaceholder}
                  />
                </div>
              </div>
            )}

            <div className="space-y-2">
              <div className="text-xs text-muted-foreground">{t('settings.providerSavedKeys')}</div>
              <div className="flex flex-wrap gap-6 text-sm">
                <div className="flex items-center gap-2">
                  <span className={`h-3 w-3 rounded-full ${config?.providers?.openclaw?.upstream?.commonstack?.apiKey ? 'bg-green-500' : 'bg-muted-foreground/30'}`} />
                  <span>{t('settings.providerCommonstack')}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`h-3 w-3 rounded-full ${config?.providers?.openclaw?.upstream?.custom?.apiKey ? 'bg-green-500' : 'bg-muted-foreground/30'}`} />
                  <span>{t('settings.providerCustom')}</span>
                </div>
              </div>
            </div>

            {!providerModelsAreCurrent && (
              <p className="text-xs text-muted-foreground">
                {t('settings.providerModelRefreshHint')}
              </p>
            )}

            {providerError && (
              <div className="rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {providerError}
              </div>
            )}
          </div>

          {/* Gateway URL */}
          <div className="border rounded-lg p-4 space-y-3">
            <h3 className="font-semibold">{t('settings.gatewayUrl')}</h3>
            <div className="flex gap-2">
              <Input
                type="text"
                value={gatewayUrl}
                onChange={(e) => setGatewayUrl(e.target.value)}
                className="flex-1"
                placeholder="http://127.0.0.1:18789/v1"
              />
              <Button onClick={checkConnection} disabled={checking} variant="outline">
                {checking ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                {t('settings.checkConnection')}
              </Button>
            </div>
            {connectionStatus === 'ok' && (
              <div className="flex items-center gap-2 text-sm text-green-600">
                <CheckCircle className="h-4 w-4" />
                {t('settings.connected')} - {models.length} models available
              </div>
            )}
            {connectionStatus === 'error' && (
              <div className="flex items-center gap-2 text-sm text-destructive">
                <XCircle className="h-4 w-4" />
                {t('settings.connectionFailed')}: {connectionError}
              </div>
            )}
          </div>
          {/* Model Selection — always visible */}
          <div className="border rounded-lg p-4 space-y-3">
            <h3 className="font-semibold">{t('settings.defaultModel')}</h3>
            {providerModelsAreCurrent && models.length > 0 ? (
              <CustomSelect
                value={modelSelectValue}
                onChange={switchModel}
                placeholder={t('settings.modelSelectPlaceholder')}
                options={models.map((modelRef) => ({
                  value: modelRef,
                  label: stripModelRefProvider(modelRef),
                }))}
              />
            ) : (
              <p className="text-sm text-muted-foreground">
                {providerModelsAreCurrent
                  ? t('settings.modelEmptyHint')
                  : t('settings.providerModelRefreshHint')}
              </p>
            )}
          </div>

          {/* Titles and tool summaries */}
          <div className="border rounded-lg p-4 space-y-3">
            <div>
              <h3 className="font-semibold">{t('settings.titleModel')}</h3>
              <p className="text-xs text-muted-foreground mt-1">{t('settings.titleModelDesc')}</p>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-3">
                <span className="text-muted-foreground flex-shrink-0 w-24">{t('settings.titleModelSelect')}</span>
                <code className="text-xs bg-muted px-2 py-1 rounded break-all">
                  {defaultModel || t('settings.notDetected')}
                </code>
              </div>
              <p className="text-xs text-muted-foreground">{t('settings.titleModelHint')}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

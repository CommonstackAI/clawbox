import { useState, useRef, useEffect, useCallback } from 'react'
import { onboardApi } from '@/services/api'
import { Check, Loader2, Globe, Key, ChevronRight, Terminal, AlertTriangle, ArrowRight, Package, Monitor, RefreshCw } from 'lucide-react'
import { CustomSelect } from '@/components/ui/custom-select'
import {
  COMMONSTACK_NODE_OPTIONS,
  DEFAULT_COMMONSTACK_BASE_URL,
  DEFAULT_CUSTOM_PROVIDER_COMPATIBILITY,
  getCustomProviderApiKeyPlaceholder,
  getCustomProviderBaseUrlPlaceholder,
  normalizeCustomProviderBaseUrl,
  normalizeCustomProviderCompatibility,
  requiresAkPrefixedApiKey,
} from '@/lib/provider-config'
import { formatProviderRequestError } from '@/lib/provider-errors'
import type { CustomProviderCompatibility } from '@/types'

interface OnboardViewProps {
  onComplete: (destination?: 'chat' | 'settings') => void
  skipEnvCheck?: boolean
  initialApiKey?: string
}

type UpstreamProviderType = 'commonstack' | 'custom'

type Step = 1 | 2 | 3 | 5 | 6

// Config progress step keys (internal tracking)
const STEP_KEYS = ['validate', 'init_openclaw', 'fetch_models', 'backup', 'apply_provider', 'title_model', 'restart_gateway', 'test_connection']

// Friendly messages for config progress (Step 5)
const CONFIG_FRIENDLY_MESSAGES: Record<string, { zh: string; en: string }> = {
  validate:        { zh: '正在校验配置...', en: 'Validating configuration...' },
  init_openclaw:   { zh: '正在检查 OpenClaw...', en: 'Checking OpenClaw...' },
  fetch_models:    { zh: '正在获取模型...', en: 'Fetching models...' },
  backup:          { zh: '正在备份配置...', en: 'Backing up configuration...' },
  apply_provider:  { zh: '正在应用配置...', en: 'Applying configuration...' },
  title_model:     { zh: '正在同步标题与摘要模型...', en: 'Syncing title and summary model...' },
  restart_gateway: { zh: '正在重启服务...', en: 'Restarting services...' },
  test_connection: { zh: '正在测试连接...', en: 'Testing connection...' },
}

// Env setup step keys for portable mode
const ENV_STEP_KEYS_PORTABLE = ['check_node', 'check_openclaw']
// Env setup step keys for system mode
const ENV_STEP_KEYS_SYSTEM = ['check_openclaw']

const PORTABLE_ENV_LOG_PROGRESS_RULES: Array<{ progress: number; patterns: RegExp[] }> = [
  { progress: 12, patterns: [/正在清理旧版本/i, /Cleaning up old version/i] },
  { progress: 22, patterns: [/准备从网络下载 Node\.js/i, /Preparing to download Node\.js from network/i] },
  {
    progress: 38,
    patterns: [
      /正在下载 Node\.js/i,
      /Downloading Node\.js/i,
      /正在从 .* 下载/i,
      /Downloading from /i,
      /使用缓存的 Node\.js 压缩包/i,
      /Using cached Node\.js archive/i,
      /Node\.js 下载完成/i,
      /Node\.js download complete/i,
      /下载完成 \(/i,
      /Download complete \(/i,
      /下载失败，尝试备用源/i,
      /Download failed, trying fallback/i,
    ],
  },
  { progress: 56, patterns: [/正在解压 Node\.js/i, /Extracting Node\.js/i] },
  { progress: 68, patterns: [/Node\.js 解压完成/i, /Node\.js extraction complete/i] },
  { progress: 82, patterns: [/正在安装 openclaw@/i, /Installing openclaw@/i] },
  { progress: 90, patterns: [/openclaw 安装完成/i, /openclaw installation complete/i] },
]
const PORTABLE_PREPARE_DETAIL_PATTERNS = [
  /准备 Node\.js 运行时/i,
  /Preparing Node\.js runtime/i,
  /正在清理旧版本/i,
  /Cleaning up old version/i,
  /准备从网络下载 Node\.js/i,
  /Preparing to download Node\.js from network/i,
  /使用缓存的 Node\.js 压缩包/i,
  /Using cached Node\.js archive/i,
]
const SYSTEM_OPENCLAW_CHECK_TIMEOUT_MS = 8000

interface ProgressStep {
  key: string
  status: 'pending' | 'running' | 'done' | 'error' | 'version_mismatch'
  message?: string
  data?: { installed?: string; target?: string }
}

type PortableStageStatus = 'pending' | 'running' | 'done' | 'error'

export function OnboardView({ onComplete, skipEnvCheck, initialApiKey }: OnboardViewProps) {
  const [step, setStep] = useState<Step>(1)
  const [displayedStep, setDisplayedStep] = useState<Step>(1)
  const [animClass, setAnimClass] = useState('opacity-100 translate-y-0')
  const pendingStepRef = useRef<Step | null>(null)
  const [lang, setLang] = useState<'zh' | 'en'>('zh')

  // Step 2 (env setup)
  const [envMode, setEnvMode] = useState<'choice' | 'portable' | 'system'>('choice')
  const [envSteps, setEnvSteps] = useState<ProgressStep[]>([])
  const [envError, setEnvError] = useState('')
  const [envRunning, setEnvRunning] = useState(false)
  const [envChecking, setEnvChecking] = useState(false)
  const [versionMismatch, setVersionMismatch] = useState<{ installed: string; target: string } | null>(null)
  const [versionResolving, setVersionResolving] = useState(false)
  const [systemNotFound, setSystemNotFound] = useState(false)
  const [envLogs, setEnvLogs] = useState<string[]>([])
  const envLogsEndRef = useRef<HTMLDivElement>(null)

  // Step 2 pre-check: system openclaw status
  const [systemOpenclawStatus, setSystemOpenclawStatus] = useState<{
    status: 'ok' | 'not_installed' | 'outdated' | 'newer'
    installed?: string
    target: string
  } | null>(null)
  const [systemCheckLoading, setSystemCheckLoading] = useState(false)
  const [systemCheckError, setSystemCheckError] = useState('')
  const [showMismatchDialog, setShowMismatchDialog] = useState(false)

  // Step 3 (API config + model selection)
  const [providerType, setProviderType] = useState<UpstreamProviderType>('commonstack')
  const [nodeUrl, setNodeUrl] = useState<string>(DEFAULT_COMMONSTACK_BASE_URL)
  const [commonstackApiKey, setCommonstackApiKey] = useState(initialApiKey || '')
  const [customBaseUrl, setCustomBaseUrl] = useState('')
  const [customApiKey, setCustomApiKey] = useState('')
  const [customCompatibility, setCustomCompatibility] = useState<CustomProviderCompatibility>(
    DEFAULT_CUSTOM_PROVIDER_COMPATIBILITY,
  )
  const [apiKeyError, setApiKeyError] = useState('')
  const [checkingAvailability, setCheckingAvailability] = useState(false)
  const [modelsError, setModelsError] = useState('')
  const [modelsSuccess, setModelsSuccess] = useState('')
  const [selectedModel, setSelectedModel] = useState('')
  const [providerSetupState, setProviderSetupState] = useState<'pending' | 'configured' | 'skipped'>('pending')

  // Step 5 (config progress)
  const [progressSteps, setProgressSteps] = useState<ProgressStep[]>(
    STEP_KEYS.map(k => ({ key: k, status: 'pending' }))
  )
  const [runError, setRunError] = useState('')
  const abortRef = useRef<AbortController | null>(null)

  const [exiting, setExiting] = useState(false)

  const isZh = lang === 'zh'

  const t = (zh: string, en: string) => isZh ? zh : en
  const customCompatibilityOptions: Array<{
    value: CustomProviderCompatibility
    label: string
    description: string
  }> = [
    {
      value: 'openai',
      label: 'OpenAI-compatible',
      description: t('使用 /chat/completions', 'Uses /chat/completions'),
    },
    {
      value: 'anthropic',
      label: 'Anthropic-compatible',
      description: t('使用 /messages', 'Uses /messages'),
    },
  ]
  const selectedCustomCompatibilityOption =
    customCompatibilityOptions.find(option => option.value === customCompatibility) ?? customCompatibilityOptions[0]

  // ── Animation: fade out -> swap content -> fade in ──
  const goToStep = useCallback((target: Step) => {
    pendingStepRef.current = target
    setAnimClass('opacity-0 translate-y-2')
    setTimeout(() => {
      if (pendingStepRef.current === target) {
        setStep(target)
        setDisplayedStep(target)
        setAnimClass('opacity-100 translate-y-0')
        pendingStepRef.current = null
      }
    }, 200)
  }, [])

  const handleComplete = useCallback((destination?: 'chat' | 'settings') => {
    setExiting(true)
    setTimeout(() => onComplete(destination), 400)
  }, [onComplete])

  // ── Step 2 auto-skip: check env status on mount ──
  const checkEnvAndMaybeSkip = useCallback(async () => {
    // Auto-skip disabled: always show the choice screen
    // This allows users to see and choose their environment mode every time
    setEnvChecking(false)
  }, [])

  useEffect(() => {
    if (step === 2) {
      checkEnvAndMaybeSkip()
    }
  }, [step, checkEnvAndMaybeSkip])

  // Pre-check system openclaw when choice screen is visible
  useEffect(() => {
    if (step === 2 && envMode === 'choice' && !envChecking) {
      setSystemCheckLoading(true)
      setSystemOpenclawStatus(null)
      setSystemCheckError('')
      Promise.race([
        onboardApi.openclawVersionCheck('system'),
        new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error('timeout')), SYSTEM_OPENCLAW_CHECK_TIMEOUT_MS)
        }),
      ])
        .then(result => setSystemOpenclawStatus(result))
        .catch(() => {
          setSystemCheckError(isZh ? '系统 OpenClaw 检测超时或失败，请稍后重试' : 'System OpenClaw check timed out or failed. Please retry.')
          // Fallback to a stable non-loading state so UI never spins forever.
          setSystemOpenclawStatus({ status: 'not_installed', target: '-' })
        })
        .finally(() => setSystemCheckLoading(false))
    }
  }, [step, envMode, envChecking, isZh])

  useEffect(() => {
    setApiKeyError('')
  }, [providerType])

  // ── Helpers ──
  const handleApiKeyChange = (value: string) => {
    if (providerType === 'commonstack') {
      setCommonstackApiKey(value)
    } else {
      setCustomApiKey(value)
    }
    setApiKeyError('')
    setModelsError('')
    setModelsSuccess('')
    setSelectedModel('')
  }

  const handleNodeUrlChange = (value: string) => {
    setNodeUrl(value)
    setModelsError('')
    setModelsSuccess('')
    setSelectedModel('')
  }

  const activeBaseUrl = providerType === 'commonstack'
    ? nodeUrl
    : normalizeCustomProviderBaseUrl(customBaseUrl, customCompatibility)
  const activeApiKey = providerType === 'commonstack' ? commonstackApiKey.trim() : customApiKey.trim()
  const activeProviderLabel = providerType === 'commonstack'
    ? t('CommonStack', 'CommonStack')
    : t('自定义服务商', 'Custom Provider')
  const customBaseUrlPlaceholder = getCustomProviderBaseUrlPlaceholder(customCompatibility)
  const customApiKeyPlaceholder = getCustomProviderApiKeyPlaceholder(customCompatibility)

  const getNodeDisplayName = (url: string) => {
    const node = COMMONSTACK_NODE_OPTIONS.find(n => n.url === url)
    if (!node) return url
    return isZh ? node.label : node.labelEn
  }

  // ── Env progress helpers ──
  const currentEnvStepKeys = envMode === 'system' ? ENV_STEP_KEYS_SYSTEM : ENV_STEP_KEYS_PORTABLE
  const envDoneCount = envSteps.filter(s => s.status === 'done').length
  const envRunningStep = envSteps.find(s => s.status === 'running')
  const envHasProgress = envRunning || envSteps.some(s => s.status !== 'pending')

  const getPortableLogProgress = () => {
    return envLogs.reduce((max, log) => {
      const matched = PORTABLE_ENV_LOG_PROGRESS_RULES.find(rule =>
        rule.patterns.some(pattern => pattern.test(log))
      )
      return matched ? Math.max(max, matched.progress) : max
    }, 0)
  }

  const getPortableStageProgress = () => {
    const checkNode = envSteps.find(step => step.key === 'check_node')
    const checkOpenclaw = envSteps.find(step => step.key === 'check_openclaw')

    if (checkOpenclaw?.status === 'done') return 100
    if (checkOpenclaw?.status === 'running') {
      return /同步内置 openclaw|Syncing bundled openclaw/i.test(checkOpenclaw.message || '') ? 96 : 94
    }
    if (checkNode?.status === 'done') return 92
    if (checkNode?.status === 'running') return 8
    return 0
  }

  const envProgress = envHasProgress && currentEnvStepKeys.length > 0
    ? envMode === 'portable'
      ? Math.max(getPortableStageProgress(), getPortableLogProgress())
      : Math.round(((envDoneCount + (envRunningStep ? 0.5 : 0)) / currentEnvStepKeys.length) * 100)
    : 0

  const hasPortableLog = (...patterns: RegExp[]) =>
    envLogs.some(log => patterns.some(pattern => pattern.test(log)))

  const portableNodeStepStatus = envSteps.find(step => step.key === 'check_node')?.status
  const portableOpenclawStepStatus = envSteps.find(step => step.key === 'check_openclaw')?.status

  const downloadStarted = hasPortableLog(
    /准备从网络下载 Node\.js/i,
    /Preparing to download Node\.js from network/i,
    /正在下载 Node\.js/i,
    /Downloading Node\.js/i,
    /正在从 .* 下载/i,
    /Downloading from /i,
    /使用缓存的 Node\.js 压缩包/i,
    /Using cached Node\.js archive/i,
  )
  const downloadDone = hasPortableLog(
    /Node\.js 下载完成/i,
    /Node\.js download complete/i,
    /下载完成 \(/i,
    /Download complete \(/i,
    /使用缓存的 Node\.js 压缩包/i,
    /Using cached Node\.js archive/i,
  )
  const extractStarted = hasPortableLog(/正在解压 Node\.js/i, /Extracting Node\.js/i)
  const extractDone = hasPortableLog(/Node\.js 解压完成/i, /Node\.js extraction complete/i)
  const installStarted = hasPortableLog(
    /正在安装 openclaw@/i,
    /Installing openclaw@/i,
    /正在通过 npm 安装 openclaw/i,
    /Installing openclaw via npm/i,
  )
  const installDone = hasPortableLog(/openclaw 安装完成/i, /openclaw installation complete/i)

  const getPortableNodeErrorStage = (): 'prepare' | 'download' | 'extract' | 'install' => {
    if (installStarted && !installDone) return 'install'
    if (extractStarted && !extractDone) return 'extract'
    if (downloadStarted && !downloadDone) return 'download'
    return 'prepare'
  }

  const getPortableStageStatus = (stage: 'prepare' | 'download' | 'extract' | 'install' | 'verify'): PortableStageStatus => {
    const nodeRunning = portableNodeStepStatus === 'running'
    const nodeDone = portableNodeStepStatus === 'done'
    const nodeError = portableNodeStepStatus === 'error'
    const verifyRunning = portableOpenclawStepStatus === 'running'
    const verifyDone = portableOpenclawStepStatus === 'done'
    const verifyError = portableOpenclawStepStatus === 'error'

    if (stage === 'verify') {
      if (verifyError) return 'error'
      if (verifyDone) return 'done'
      if (verifyRunning) return 'running'
      return 'pending'
    }

    const errorStage = nodeError ? getPortableNodeErrorStage() : null
    if (errorStage === stage) return 'error'
    if (nodeError) return 'pending'

    if (stage === 'prepare') {
      if (nodeDone || downloadStarted) return 'done'
      if (nodeRunning) return 'running'
      return 'pending'
    }
    if (stage === 'download') {
      if (nodeDone || downloadDone || extractStarted || installStarted) return 'done'
      if (nodeRunning && downloadStarted) return 'running'
      return 'pending'
    }
    if (stage === 'extract') {
      if (nodeDone || extractDone || installStarted) return 'done'
      if (nodeRunning && extractStarted) return 'running'
      return 'pending'
    }
    // stage === 'install'
    if (nodeDone || installDone) return 'done'
    if (nodeRunning && installStarted) return 'running'
    return 'pending'
  }

  const getPortableCombinedStageStatus = (
    primary: PortableStageStatus,
    secondary: PortableStageStatus,
  ): PortableStageStatus => {
    if (primary === 'error' || secondary === 'error') return 'error'
    if (secondary === 'done') return 'done'
    if (secondary === 'running') return 'running'
    if (primary === 'running') return 'running'
    if (primary === 'done') return 'running'
    return 'pending'
  }

  const portableStageItems: Array<{ key: 'prepare' | 'node' | 'openclaw'; label: string; status: PortableStageStatus }> = [
    {
      key: 'prepare',
      label: t('准备运行环境', 'Prepare runtime'),
      status: getPortableStageStatus('prepare'),
    },
    {
      key: 'node',
      label: t('下载并解压 Node.js', 'Download & extract Node.js'),
      status: getPortableCombinedStageStatus(
        getPortableStageStatus('download'),
        getPortableStageStatus('extract'),
      ),
    },
    {
      key: 'openclaw',
      label: t('安装并验证 OpenClaw', 'Install & verify OpenClaw'),
      status: getPortableCombinedStageStatus(
        getPortableStageStatus('install'),
        getPortableStageStatus('verify'),
      ),
    },
  ]
  const visiblePortableStageItems = portableStageItems.filter(
    item => item.status === 'done' || item.status === 'running'
  )
  const shouldShowPortableFallbackRunning = visiblePortableStageItems.length === 0 && !envError
  const portableStageItemsToRender = visiblePortableStageItems.length > 0
    ? visiblePortableStageItems
    : (shouldShowPortableFallbackRunning
      ? [{
          key: 'prepare' as const,
          label: t('准备运行环境', 'Prepare runtime'),
          status: 'running' as PortableStageStatus,
        }]
      : [])
  const prepareDetailLogs = envLogs
    .filter(log => PORTABLE_PREPARE_DETAIL_PATTERNS.some(pattern => pattern.test(log)))
    .slice(-3)
  const prepareStageStatus = portableStageItemsToRender.find(item => item.key === 'prepare')?.status
  const prepareDetailLines = (prepareStageStatus === 'running' && prepareDetailLogs.length === 0)
    ? [t('正在检查本地运行时与缓存目录...', 'Checking local runtime and cache directories...')]
    : prepareDetailLogs

  // ── Config progress helpers ──
  const configDoneCount = progressSteps.filter(s => s.status === 'done').length
  const configRunningStep = progressSteps.find(s => s.status === 'running')
  const configHasProgress = progressSteps.some(s => s.status !== 'pending')
  const configProgress = configHasProgress
    ? Math.round(((configDoneCount + (configRunningStep ? 0.5 : 0)) / STEP_KEYS.length) * 100)
    : 0

  const getConfigFriendlyMessage = () => {
    if (configRunningStep) {
      const msg = CONFIG_FRIENDLY_MESSAGES[configRunningStep.key]
      return msg ? (isZh ? msg.zh : msg.en) : ''
    }
    if (configDoneCount === STEP_KEYS.length) {
      return t('配置完成！', 'Configuration complete!')
    }
    return t('准备中...', 'Preparing...')
  }

  // ── Step 1: Language selection ──
  const renderStep1 = () => (
    <div className="flex flex-col items-center gap-8">
      <div className="text-center">
        <div className="flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mx-auto mb-4">
          <Globe className="w-8 h-8 text-primary" />
        </div>
        <h1 className="text-3xl font-bold mb-2">Welcome to ClawBox</h1>
        <p className="text-muted-foreground">Select your preferred language / 选择你的语言</p>
      </div>

      <div className="flex gap-4 w-full max-w-sm">
        <button
          onClick={() => { setLang('zh'); goToStep(2) }}
          className="flex-1 p-6 rounded-xl border-2 border-border hover:border-primary hover:bg-primary/5 transition-all text-center group"
        >
          <div className="text-2xl mb-2">🇨🇳</div>
          <div className="font-semibold text-lg">中文</div>
          <div className="text-sm text-muted-foreground">简体中文</div>
        </button>
        <button
          onClick={() => { setLang('en'); goToStep(2) }}
          className="flex-1 p-6 rounded-xl border-2 border-border hover:border-primary hover:bg-primary/5 transition-all text-center group"
        >
          <div className="text-2xl mb-2">🇺🇸</div>
          <div className="font-semibold text-lg">English</div>
          <div className="text-sm text-muted-foreground">English (US)</div>
        </button>
      </div>
    </div>
  )

  // ── Step 2: Environment Setup ──
  const handleEnvSetup = async (mode: 'portable' | 'system') => {
    setEnvMode(mode)
    setEnvRunning(true)
    setEnvError('')
    setProviderSetupState('pending')
    setVersionMismatch(null)
    setSystemNotFound(false)
    setEnvLogs([])
    const stepKeys = mode === 'system' ? ENV_STEP_KEYS_SYSTEM : ENV_STEP_KEYS_PORTABLE
    setEnvSteps(stepKeys.map(k => ({ key: k, status: 'pending' })))

    try {
      const res = await onboardApi.envSetup({ lang, mode })
      if (!res.ok) {
        const errText = await res.text().catch(() => '')
        throw new Error(errText || t('环境安装请求失败', 'Environment setup request failed'))
      }
      const reader = res.body?.getReader()
      if (!reader) throw new Error('No response stream')
      let terminalReached = false
      let hadProgressEvent = false

      const decoder = new TextDecoder()
      let buf = ''

      const handleProgressPayload = (payload: any): boolean => {
        const { step: s, status, message, data, log } = payload
        hadProgressEvent = true

        // Handle log events
        if (log) {
          setEnvLogs(prev => [...prev, log])
          setTimeout(() => {
            envLogsEndRef.current?.scrollIntoView({ behavior: 'smooth' })
          }, 50)
        }

        if (s === 'complete' && status === 'done') {
          terminalReached = true
          setEnvSteps(prev => prev.map(ps => ps.status === 'pending' ? { ...ps, status: 'done' } : ps))
          setEnvRunning(false)
          setTimeout(() => goToStep(3), 800)
          return true
        }

        if (status === 'version_warning' && data) {
          terminalReached = true
          setVersionMismatch({ installed: data.installed, target: data.target })
          setEnvSteps(prev => prev.map(ps =>
            ps.key === s ? { ...ps, status: 'version_mismatch', message, data } : ps
          ))
          setEnvRunning(false)
          return true
        }

        setEnvSteps(prev => prev.map(ps => {
          if (ps.key === s) return { ...ps, status, message }
          if (status === 'running') {
            const prevIdx = stepKeys.indexOf(ps.key)
            const curIdx = stepKeys.indexOf(s)
            if (prevIdx < curIdx && ps.status === 'pending') return { ...ps, status: 'done' }
          }
          return ps
        }))

        if (status === 'error') {
          terminalReached = true
          if (mode === 'system' && s === 'check_openclaw') {
            setSystemNotFound(true)
          }
          setEnvError(message || t('环境检测失败', 'Environment check failed'))
          setEnvRunning(false)
          return true
        }

        return false
      }

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        const lines = buf.split('\n')
        buf = lines.pop() || ''

        for (const line of lines) {
          const normalized = line.trim()
          if (normalized.startsWith('data: ')) {
            try {
              const payload = JSON.parse(normalized.slice(6))
              if (handleProgressPayload(payload)) return
            } catch {}
          }
        }
      }

      if (!terminalReached) {
        const tail = buf.trim()
        if (tail.startsWith('data: ')) {
          try {
            const payload = JSON.parse(tail.slice(6))
            if (handleProgressPayload(payload)) return
          } catch {}
        }
      }

      if (!terminalReached) {
        setEnvError(
          hadProgressEvent
            ? t('环境安装流程中断，请重试', 'Environment setup stream ended unexpectedly. Please retry.')
            : t('环境安装服务未返回进度，请重试', 'No progress was received from environment setup service. Please retry.')
        )
      }
    } catch (e: any) {
      setEnvError(e.message || t('发生未知错误', 'Unknown error occurred'))
    } finally {
      setEnvRunning(false)
    }
  }

  const handleVersionMismatchContinue = async () => {
    setVersionResolving(true)
    setEnvError('')
    try {
      const result = await onboardApi.resolveOpenclawVersion({ action: 'continue', lang })
      if (result.success) {
        setVersionMismatch(null)
        setProviderSetupState('pending')
        setEnvSteps(prev => prev.map(ps =>
          ps.key === 'check_openclaw' ? { ...ps, status: 'done' } : ps
        ))
        setTimeout(() => goToStep(3), 500)
      } else {
        setEnvError(result.error || t('操作失败', 'Operation failed'))
      }
    } catch (e: any) {
      setEnvError(e.message)
    } finally {
      setVersionResolving(false)
    }
  }

  const renderStep2Choice = () => (
    <div className="flex flex-col gap-6 w-full" style={{ maxWidth: 520 }}>
      <div className="text-center">
        <div className="flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mx-auto mb-4">
          <Terminal className="w-8 h-8 text-primary" />
        </div>
        <h2 className="text-2xl font-bold mb-1">{t('选择环境模式', 'Choose Environment Mode')}</h2>
        <p className="text-muted-foreground text-sm">
          {t('选择 OpenClaw 的运行方式', 'Choose how to run OpenClaw')}
        </p>
      </div>

      <div className="flex gap-4 w-full">
        <button
          onClick={() => handleEnvSetup('portable')}
          className="flex-1 p-5 rounded-xl border-2 border-border hover:border-primary hover:bg-primary/5 transition-all text-left group"
        >
          <Package className="w-7 h-7 text-primary mb-3" />
          <div className="font-semibold text-base mb-1">{t('Portable 环境', 'Portable Environment')}</div>
          <div className="text-xs text-muted-foreground leading-relaxed">
            {t('自动下载并配置内置运行环境，不修改系统设置', 'Auto-download built-in runtime, no system changes')}
          </div>
          <div className="mt-3 text-xs text-primary font-medium">{t('推荐', 'Recommended')}</div>
        </button>
        <button
          onClick={() => {
            if (systemCheckLoading || !systemOpenclawStatus) return
            if (systemOpenclawStatus.status === 'not_installed') return
            if (systemOpenclawStatus.status === 'outdated') {
              setShowMismatchDialog(true)
              return
            }
            handleEnvSetup('system')
          }}
          className={`flex-1 p-5 rounded-xl border-2 transition-all text-left group ${
            systemOpenclawStatus?.status === 'not_installed'
              ? 'border-border opacity-50 cursor-not-allowed'
              : systemCheckLoading || !systemOpenclawStatus
                ? 'border-border cursor-default'
                : 'border-border hover:border-primary hover:bg-primary/5'
          }`}
        >
          {systemCheckLoading || !systemOpenclawStatus ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="w-8 h-8 text-primary animate-spin" />
            </div>
          ) : (
            <>
              <Monitor className="w-7 h-7 text-primary mb-3" />
              <div className="font-semibold text-base mb-1">{t('系统 OpenClaw', 'System OpenClaw')}</div>
              <div className="text-xs text-muted-foreground leading-relaxed">
                {systemOpenclawStatus.status === 'not_installed'
                  ? t('未找到系统 OpenClaw', 'System OpenClaw not found')
                  : t('使用已安装在系统中的 OpenClaw，仅检测不安装', 'Use system-installed OpenClaw, detection only')}
              </div>
              {systemCheckError && (
                <div className="mt-3 text-xs text-yellow-600 dark:text-yellow-400 leading-relaxed">
                  {systemCheckError}
                </div>
              )}
              {(systemOpenclawStatus.status === 'ok' || systemOpenclawStatus.status === 'newer') && systemOpenclawStatus.installed && (
                <div className="mt-3 text-xs text-green-600 dark:text-green-400 font-medium">
                  {t(`检测到版本 ${systemOpenclawStatus.installed}`, `Detected v${systemOpenclawStatus.installed}`)}
                </div>
              )}
              {systemOpenclawStatus.status === 'outdated' && (
                <div className="mt-3 text-xs text-yellow-600 dark:text-yellow-400 font-medium">
                  {t(
                    `版本不匹配 (已安装 ${systemOpenclawStatus.installed}，需要 ${systemOpenclawStatus.target})`,
                    `Mismatch (installed ${systemOpenclawStatus.installed}, requires ${systemOpenclawStatus.target})`
                  )}
                </div>
              )}
            </>
          )}
        </button>
      </div>

      {/* Version mismatch confirmation dialog */}
      {showMismatchDialog && systemOpenclawStatus?.status === 'outdated' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowMismatchDialog(false)}>
          <div className="bg-background border border-border rounded-xl p-6 max-w-sm w-full mx-4 shadow-lg" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle className="w-5 h-5 text-yellow-500" />
              <h3 className="font-semibold text-base">{t('版本不匹配', 'Version Mismatch')}</h3>
            </div>
            <p className="text-sm text-muted-foreground mb-4 leading-relaxed">
              {t(
                `系统 OpenClaw 版本 (${systemOpenclawStatus.installed}) 与当前 ClawBox 兼容的 OpenClaw 版本 (${systemOpenclawStatus.target}) 不匹配，继续使用可能发生兼容性问题。`,
                `System OpenClaw version (${systemOpenclawStatus.installed}) does not match the compatible version (${systemOpenclawStatus.target}) for ClawBox. Continuing may cause compatibility issues.`
              )}
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowMismatchDialog(false)}
                className="px-4 py-2 rounded-lg border border-border text-sm hover:bg-muted transition-colors"
              >
                {t('取消', 'Cancel')}
              </button>
              <button
                onClick={() => { setShowMismatchDialog(false); handleEnvSetup('system') }}
                className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
              >
                {t('仍然继续', 'Continue Anyway')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )

  const renderStep2Portable = () => (
    <div className="flex flex-col gap-6 w-full" style={{ maxWidth: 448 }}>
      <div className="text-center">
        <div className="flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mx-auto mb-4">
          <Package className="w-8 h-8 text-primary" />
        </div>
        <h2 className="text-2xl font-bold">{t('Portable 环境安装', 'Portable Setup')}</h2>
      </div>

      {envHasProgress && (
        <div className="flex flex-col gap-3 py-4">
          <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all duration-500 ease-out"
              style={{ width: `${envProgress}%` }}
            />
          </div>
        </div>
      )}

      <div className="space-y-2">
        {portableStageItemsToRender.map((item) => (
          <div
            key={item.key}
            className={`flex items-center gap-2.5 rounded-lg border px-2.5 py-2 ${
              item.status === 'done'
                ? 'border-emerald-500/20 bg-emerald-500/5'
                : item.status === 'running'
                  ? 'border-primary/30 bg-primary/5'
                  : 'border-border/70 bg-background/70'
            }`}
          >
            {item.status === 'done' ? (
              <Check className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
            ) : item.status === 'running' ? (
              <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" />
            ) : (
              <div className="h-4 w-4 shrink-0 rounded-full border border-muted-foreground/40" />
            )}
            <div className="min-w-0 flex-1">
              <p className="text-sm text-foreground/90">{item.label}</p>
              {item.key === 'prepare' && prepareDetailLines.length > 0 && (
                <div className="mt-1 space-y-0.5">
                  {prepareDetailLines.map((line, idx) => (
                    <p
                      key={`${item.key}-detail-${idx}-${line}`}
                      className="text-[11px] leading-relaxed text-muted-foreground"
                    >
                      {line}
                    </p>
                  ))}
                </div>
              )}
            </div>
            <span
              className={`ml-auto text-[10px] font-medium uppercase tracking-[0.08em] ${
                item.status === 'done'
                  ? 'text-emerald-700 dark:text-emerald-300'
                  : item.status === 'running'
                    ? 'text-primary'
                    : 'text-muted-foreground'
              }`}
            >
              {item.status === 'done'
                ? t('完成', 'Done')
                : item.status === 'running'
                  ? t('进行中', 'Running')
                  : t('待开始', 'Pending')}
            </span>
          </div>
        ))}
      </div>

      {envError && (
        <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20">
          <p className="text-sm text-destructive font-medium mb-2">{t('环境安装失败', 'Environment setup failed')}</p>
          <pre className="max-h-56 overflow-auto text-xs text-destructive/80 whitespace-pre-wrap break-all font-mono leading-relaxed">
            {envError}
          </pre>
        </div>
      )}

      {!envRunning && envError && (
        <div className="pt-2">
          <button
            onClick={() => handleEnvSetup('portable')}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            {t('重试', 'Retry')}
          </button>
        </div>
      )}
    </div>
  )

  const renderStep2System = () => (
    <div className="flex flex-col gap-6 w-full" style={{ maxWidth: 448 }}>
      <div className="text-center">
        <div className="flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mx-auto mb-4">
          <Monitor className="w-8 h-8 text-primary" />
        </div>
        <h2 className="text-2xl font-bold mb-1">{t('检测系统 OpenClaw', 'Detecting System OpenClaw')}</h2>
        <p className="text-muted-foreground text-sm">
          {t('正在检测系统中已安装的 OpenClaw', 'Checking for system-installed OpenClaw')}
        </p>
      </div>

      {envRunning && (
        <div className="flex items-center justify-center gap-2 py-8">
          <Loader2 className="w-5 h-5 text-primary animate-spin" />
          <span className="text-sm text-muted-foreground">{t('正在检测...', 'Detecting...')}</span>
        </div>
      )}

      {systemNotFound && envError && (
        <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/20">
          <p className="text-sm text-destructive font-medium mb-2">{t('未检测到 OpenClaw', 'OpenClaw Not Found')}</p>
          <pre className="max-h-56 overflow-auto text-xs text-destructive/80 whitespace-pre-wrap break-all font-mono leading-relaxed mb-3">
            {envError}
          </pre>
          <code className="block text-xs bg-muted p-2 rounded font-mono mb-3">npm install -g openclaw</code>
          <div className="flex gap-2">
            <button
              onClick={() => handleEnvSetup('system')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors"
            >
              <RefreshCw className="w-3 h-3" />
              {t('重新检测', 'Re-detect')}
            </button>
          </div>
        </div>
      )}

      {versionMismatch && (
        <div className="p-4 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
          <p className="text-sm font-medium text-yellow-700 dark:text-yellow-300 mb-1">
            {t('版本低于推荐', 'Version Below Recommended')}
          </p>
          <p className="text-xs text-yellow-600 dark:text-yellow-400 mb-3">
            {t(
              `已安装 ${versionMismatch.installed}，推荐版本 ${versionMismatch.target}。你可以继续使用当前版本。`,
              `Installed ${versionMismatch.installed}, recommended ${versionMismatch.target}. You can continue with the current version.`
            )}
          </p>
          <div className="flex gap-2">
            <button
              onClick={handleVersionMismatchContinue}
              disabled={versionResolving}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {versionResolving ? <Loader2 className="w-3 h-3 animate-spin" /> : <ArrowRight className="w-3 h-3" />}
              {t('继续使用', 'Continue anyway')}
            </button>
          </div>
        </div>
      )}

      {!envRunning && envError && !systemNotFound && (
        <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20">
          <p className="text-sm text-destructive font-medium mb-2">{t('检测失败', 'Detection failed')}</p>
          <pre className="max-h-56 overflow-auto text-xs text-destructive/80 whitespace-pre-wrap break-all font-mono leading-relaxed">
            {envError}
          </pre>
          <div className="flex gap-2 mt-3">
            <button
              onClick={() => handleEnvSetup('system')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors"
            >
              {t('重试', 'Retry')}
            </button>
          </div>
        </div>
      )}
    </div>
  )

  const renderStep2 = () => {
    if (envChecking) {
      return (
        <div className="flex flex-col gap-6 w-full" style={{ maxWidth: 448 }}>
          <div className="text-center">
            <div className="flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mx-auto mb-4">
              <Terminal className="w-8 h-8 text-primary" />
            </div>
            <h2 className="text-2xl font-bold mb-1">{t('环境准备', 'Environment Setup')}</h2>
          </div>
          <div className="flex items-center justify-center gap-2 py-8">
            <Loader2 className="w-5 h-5 text-primary animate-spin" />
            <span className="text-sm text-muted-foreground">{t('正在检测环境...', 'Checking environment...')}</span>
          </div>
        </div>
      )
    }
    if (envMode === 'choice') return renderStep2Choice()
    if (envMode === 'portable') return renderStep2Portable()
    return renderStep2System()
  }

  // ── Step 3: API configuration ──
  const validateProviderInputs = () => {
    setApiKeyError('')
    setModelsError('')
    if (!activeApiKey) {
      setApiKeyError(t('请输入 API Key', 'Enter an API key'))
      return false
    }
    if (requiresAkPrefixedApiKey(providerType, activeBaseUrl) && !activeApiKey.startsWith('ak-')) {
      setApiKeyError(t('API Key 必须以 "ak-" 开头', 'API Key must start with "ak-"'))
      return false
    }
    if (!activeBaseUrl) {
      setModelsError(t('请输入有效的 Base URL', 'Enter a valid Base URL'))
      return false
    }
    return true
  }

  const handleCheckAvailability = async () => {
    if (!validateProviderInputs()) {
      return
    }

    setCheckingAvailability(true)
    setModelsError('')
    setModelsSuccess('')
    try {
      const { models: fetchedModels } = await onboardApi.models(
        activeBaseUrl,
        activeApiKey,
        providerType === 'custom' ? normalizeCustomProviderCompatibility(customCompatibility) : undefined,
      )
      if (!fetchedModels || fetchedModels.length === 0) {
        throw new Error(t('未获取到可用模型', 'No models returned'))
      }
      const defaultModel = fetchedModels.includes('openai/gpt-4o-mini') ? 'openai/gpt-4o-mini' : fetchedModels[0]
      setSelectedModel(defaultModel)
      setModelsSuccess(
        isZh
          ? `校验通过，已获取 ${fetchedModels.length} 个模型，默认将使用 ${defaultModel}`
          : `Check succeeded. Found ${fetchedModels.length} models. Default will use ${defaultModel}.`
      )
    } catch (e: any) {
      let msg = e.message || String(e)
      try { const parsed = JSON.parse(msg); msg = parsed.error || msg } catch {}
      msg = formatProviderRequestError(
        msg,
        activeBaseUrl,
        (_key, options) => t(
          `无法连接到 Provider 端点（${String((options as Record<string, unknown> | undefined)?.baseUrl || activeBaseUrl)}）。请检查 Base URL、兼容模式、API Key，以及本机网络或 TLS 配置。`,
          `Unable to reach the provider endpoint (${String((options as Record<string, unknown> | undefined)?.baseUrl || activeBaseUrl)}). Check the Base URL, compatibility mode, API key, and local network or TLS settings.`,
        ),
      )
      setModelsError(msg)
    } finally {
      setCheckingAvailability(false)
    }
  }

  const handleContinue = async () => {
    if (!validateProviderInputs()) {
      return
    }

    setModelsError('')
    startConfig(undefined, {
      providerType,
      baseUrl: activeBaseUrl,
      apiKey: activeApiKey,
      customCompatibility: providerType === 'custom'
        ? normalizeCustomProviderCompatibility(customCompatibility)
        : undefined,
    })
  }

  const handleSkipProviderSetup = () => {
    setProviderSetupState('skipped')
    setRunError('')
    goToStep(6)
  }

  const startConfig = async (
    model?: string,
    providerConfig?: {
      providerType: UpstreamProviderType
      baseUrl: string
      apiKey: string
      customCompatibility?: CustomProviderCompatibility
    },
  ) => {
    // Save lang preference
    try { localStorage.setItem('clawbox-language', lang) } catch {}

    goToStep(5)
    setProgressSteps(STEP_KEYS.map(k => ({ key: k, status: 'pending' })))
    setRunError('')

    const controller = new AbortController()
    abortRef.current = controller

    try {
      const resolvedProvider = providerConfig || {
        providerType,
        baseUrl: activeBaseUrl,
        apiKey: activeApiKey,
        customCompatibility: providerType === 'custom'
          ? normalizeCustomProviderCompatibility(customCompatibility)
          : undefined,
      }
      const res = await onboardApi.run({
        providerType: resolvedProvider.providerType,
        baseUrl: resolvedProvider.baseUrl,
        apiKey: resolvedProvider.apiKey,
        customCompatibility: resolvedProvider.customCompatibility,
        defaultModel: model || selectedModel || undefined,
        lang,
      })
      const reader = res.body?.getReader()
      if (!reader) throw new Error('No response stream')

      const decoder = new TextDecoder()
      let buf = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        const lines = buf.split('\n')
        buf = lines.pop() || ''

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const payload = JSON.parse(line.slice(6))
              const { step: s, status, message } = payload
              const payloadDefaultModel = payload?.data?.defaultModel

              if (typeof payloadDefaultModel === 'string' && payloadDefaultModel.trim()) {
                setSelectedModel(payloadDefaultModel)
              }

              if (s === 'complete' && status === 'done') {
                setProviderSetupState('configured')
                setProgressSteps(prev => prev.map(ps => ps.status === 'pending' ? { ...ps, status: 'done' } : ps))
                setTimeout(() => goToStep(6), 800)
                return
              }

              setProgressSteps(prev => prev.map(ps => {
                if (ps.key === s) return { ...ps, status, message }
                if (status === 'running') {
                  const prevIdx = STEP_KEYS.indexOf(ps.key)
                  const curIdx = STEP_KEYS.indexOf(s)
                  if (prevIdx < curIdx && ps.status === 'pending') return { ...ps, status: 'done' }
                }
                return ps
              }))

              if (status === 'error') {
                setRunError(message || t('配置失败', 'Configuration failed'))
                return
              }
            } catch {}
          }
        }
      }
    } catch (e: any) {
      if (e.name !== 'AbortError') {
        setRunError(e.message || t('发生未知错误', 'Unknown error occurred'))
      }
    }
  }

  const renderStep3 = () => (
    <div className="flex flex-col gap-6 w-full" style={{ maxWidth: 560 }}>
      <div className="text-center">
        <div className="flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mx-auto mb-4">
          <Key className="w-8 h-8 text-primary" />
        </div>
        <h2 className="text-2xl font-bold mb-1">{t('配置 API 访问', 'Configure API Access')}</h2>
        <p className="text-muted-foreground text-sm">
          {t('选择 CommonStack 或自定义 Provider', 'Choose CommonStack or a custom provider')}
        </p>
        <p className="text-xs text-muted-foreground mt-2">
          {t('也可以先跳过，稍后在设置中继续配置。', 'You can also skip this for now and finish it later in Settings.')}
        </p>
      </div>

      <div className="flex flex-col gap-4 w-full">
        <div>
          <label className="block text-sm font-medium mb-1.5">{t('AI 服务商', 'AI Provider')}</label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[
              {
                value: 'commonstack' as const,
                title: 'CommonStack',
                description: t('使用 CommonStack 节点与 API Key。', 'Use a CommonStack node and API key.'),
              },
              {
                value: 'custom' as const,
                title: t('自定义服务商', 'Custom Provider'),
                description: t('连接到兼容 OpenAI 或 Anthropic 的 API 端点。', 'Connect to OpenAI-compatible or Anthropic-compatible API endpoints.'),
              },
            ].map((provider) => {
              const active = providerType === provider.value
              return (
                <button
                  key={provider.value}
                  type="button"
                  onClick={() => {
                    setProviderType(provider.value)
                    setApiKeyError('')
                    setModelsError('')
                    setModelsSuccess('')
                    setSelectedModel('')
                  }}
                  className={`rounded-2xl border px-4 py-4 text-left transition-all ${
                    active
                      ? 'border-primary bg-primary/5 ring-2 ring-primary/20'
                      : 'border-border bg-background hover:border-primary/40 hover:bg-muted/40'
                  }`}
                >
                  <div className="text-sm font-semibold">{provider.title}</div>
                  <div className="mt-2 text-xs leading-5 text-muted-foreground">{provider.description}</div>
                </button>
              )
            })}
          </div>
        </div>

        {providerType === 'commonstack' ? (
          <div>
            <label className="block text-sm font-medium mb-1.5">{t('API 节点', 'API Node')}</label>
            <CustomSelect
              value={nodeUrl}
              onChange={handleNodeUrlChange}
              options={COMMONSTACK_NODE_OPTIONS.map(n => ({ value: n.url, label: isZh ? n.label : n.labelEn }))}
            />
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1.5">{t('Endpoint compatibility', 'Endpoint compatibility')}</label>
              <CustomSelect
                value={customCompatibility}
                onChange={(value) => {
                  setCustomCompatibility(value as CustomProviderCompatibility)
                  setApiKeyError('')
                  setModelsError('')
                  setModelsSuccess('')
                  setSelectedModel('')
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
            <div>
              <label className="block text-sm font-medium mb-1.5">{t('Base URL', 'Base URL')}</label>
              <input
                type="text"
                value={customBaseUrl}
                onChange={(e) => {
                  setCustomBaseUrl(e.target.value)
                  setModelsError('')
                  setModelsSuccess('')
                  setSelectedModel('')
                }}
                placeholder={customBaseUrlPlaceholder}
                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
          </div>
        )}

        <div>
          <label className="block text-sm font-medium mb-1.5">API Key</label>
          <input
            type="password"
            value={providerType === 'commonstack' ? commonstackApiKey : customApiKey}
            onChange={e => handleApiKeyChange(e.target.value)}
            placeholder={providerType === 'commonstack' ? 'ak-...' : customApiKeyPlaceholder}
            className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary font-mono"
          />
          {apiKeyError && <p className="text-xs text-destructive mt-1">{apiKeyError}</p>}
        </div>

        {modelsSuccess && (
          <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-sm text-emerald-700 dark:text-emerald-300">
            {modelsSuccess}
          </div>
        )}

        {modelsError && (
          <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-sm text-destructive">
            {modelsError}
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-3 pt-2">
          <button
            onClick={handleSkipProviderSetup}
            disabled={checkingAvailability}
            className="px-4 py-2 rounded-lg border border-border text-sm hover:bg-muted transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {t('跳过设置', 'Skip setup')}
          </button>
          <button
            onClick={handleCheckAvailability}
            disabled={checkingAvailability}
            className="flex items-center justify-center gap-2 px-4 py-2 rounded-lg border border-border text-sm font-medium hover:bg-muted transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {checkingAvailability ? (
              <><Loader2 className="w-4 h-4 animate-spin" />{t('校验中...', 'Checking...')}</>
            ) : (
              <><RefreshCw className="w-4 h-4" />{t('校验可用性', 'Check Availability')}</>
            )}
          </button>
          <button
            onClick={handleContinue}
            disabled={checkingAvailability}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <>{t('下一步', 'Next')}<ChevronRight className="w-4 h-4" /></>
          </button>
        </div>
      </div>
    </div>
  )

  // ── Step 5: Config Progress (simplified progress display) ──
  const renderStep5 = () => (
    <div className="flex flex-col gap-6 w-full" style={{ maxWidth: 448 }}>
      <div className="text-center">
        <h2 className="text-2xl font-bold mb-1">{t('正在配置...', 'Configuring...')}</h2>
        <p className="text-muted-foreground text-sm">
          {t('请稍候，正在完成初始化', 'Please wait while we complete initialization')}
        </p>
      </div>

      <div className="flex flex-col gap-3 py-4">
        <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
          <div
            className="h-full bg-primary rounded-full transition-all duration-500 ease-out"
            style={{ width: `${configProgress}%` }}
          />
        </div>
        <p className="text-sm text-muted-foreground text-center">{getConfigFriendlyMessage()}</p>
      </div>

      {runError && (
        <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20">
          <p className="text-sm text-destructive font-medium mb-2">{t('配置失败', 'Configuration failed')}</p>
          <p className="text-xs text-destructive/80">{runError}</p>
          <button
            onClick={() => { goToStep(3); setRunError('') }}
            className="mt-3 px-3 py-1.5 rounded-md bg-destructive text-destructive-foreground text-xs font-medium hover:bg-destructive/90 transition-colors"
          >
            {t('重试', 'Retry')}
          </button>
        </div>
      )}
    </div>
  )

  // ── Step 6: Complete ──
  const renderStep6 = () => (
    <div className="flex flex-col items-center gap-6">
      <div className="text-center">
        <div className="flex items-center justify-center w-20 h-20 rounded-full bg-green-500/10 mx-auto mb-4">
          <Check className="w-10 h-10 text-green-500" />
        </div>
        <h2 className="text-3xl font-bold mb-2">{t('配置完成！', 'All Set!')}</h2>
        <p className="text-muted-foreground">
          {providerSetupState === 'configured'
            ? t('OpenClaw 和 Provider 都已配置完成，可以开始使用了。', 'OpenClaw and your provider are configured. You are ready to go.')
            : t('OpenClaw 运行环境已经准备好，接下来可以在设置中配置 API 访问。', 'Your OpenClaw environment is ready. You can configure API access in Settings next.')}
        </p>
      </div>

      <div className="w-full max-w-sm p-4 rounded-xl bg-muted/50 border border-border text-sm space-y-2">
        <div className="flex justify-between">
          <span className="text-muted-foreground">{t('环境模式', 'Environment Mode')}</span>
          <span className="font-medium text-sm">
            {envMode === 'system' ? t('系统 OpenClaw', 'System OpenClaw') : t('Portable 环境', 'Portable Environment')}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">{t('OpenClaw', 'OpenClaw')}</span>
          <span className="font-medium text-sm">{t('已就绪', 'Ready')}</span>
        </div>
        {providerSetupState === 'configured' ? (
          <>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t('服务商', 'Provider')}</span>
              <span className="font-medium text-sm">{activeProviderLabel}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{providerType === 'commonstack' ? t('节点', 'Node') : t('Base URL', 'Base URL')}</span>
              <span className="font-medium text-sm max-w-[220px] truncate" title={activeBaseUrl}>
                {providerType === 'commonstack' ? getNodeDisplayName(nodeUrl) : activeBaseUrl}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t('默认模型', 'Default Model')}</span>
              <span className="font-mono text-xs">{selectedModel || t('自动选择', 'Auto-selected')}</span>
            </div>
          </>
        ) : (
          <div className="flex justify-between">
            <span className="text-muted-foreground">{t('下一步', 'Next')}</span>
            <span className="font-medium text-sm">{t('前往设置配置 API', 'Open Settings to configure API')}</span>
          </div>
        )}
      </div>

      <button
        onClick={() => handleComplete(providerSetupState === 'configured' ? 'chat' : 'settings')}
        disabled={exiting}
        className="px-8 py-3 rounded-xl bg-primary text-primary-foreground font-semibold text-base hover:bg-primary/90 disabled:opacity-50 transition-colors"
      >
        {providerSetupState === 'configured' ? t('开始使用', 'Get Started') : t('前往设置', 'Open Settings')}
      </button>
    </div>
  )

  return (
    <div className={`flex flex-col items-center justify-center min-h-screen bg-background px-4 transition-opacity duration-300 ${exiting ? 'opacity-0' : 'opacity-100'}`}>
      {/* Progress indicator */}
      {displayedStep > 1 && displayedStep < 6 && (
        <div className="flex items-center gap-2 mb-8">
          {[2, 3, 5].map(s => (
            <div
              key={s}
              className={`w-2 h-2 rounded-full transition-colors ${displayedStep >= s ? 'bg-primary' : 'bg-muted'}`}
            />
          ))}
        </div>
      )}

      {/* Animated step content */}
      <div className={`w-full max-w-2xl flex flex-col items-center transition-all duration-200 ease-out ${animClass}`}>
        {displayedStep === 1 && renderStep1()}
        {displayedStep === 2 && renderStep2()}
        {displayedStep === 3 && renderStep3()}
        {displayedStep === 5 && renderStep5()}
        {displayedStep === 6 && renderStep6()}
      </div>
    </div>
  )
}

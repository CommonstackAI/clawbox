import { useDeferredValue, useEffect, useRef, useState } from 'react'
import { Compass, LogIn, LogOut, Package2, RefreshCw, Search, Upload } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { computeSkillMissing, computeSkillReasonCodes } from '@/components/skills/shared'
import {
  useSkillsStore,
  type SkillsManualImportError,
  type SkillsMarketAuthNotice,
  type SkillsManualImportNotice,
  type SkillsMarketError,
  type SkillNotice,
  type SkillsMarketNotice,
} from '@/store/skills'
import { PageShell } from '@/components/layout/PageShell'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import type { ClawhubAuthStatus, ClawhubSearchItem, ManualSkillImportSource, SkillStatusEntry } from '@/types'

function getNoticeText(notice: SkillNotice | undefined, t: (key: string) => string): string | null {
  if (!notice) return null
  if (notice.kind === 'error') return notice.message
  if (notice.action === 'toggle') {
    return notice.enabled ? t('skills.messages.enabled') : t('skills.messages.disabled')
  }
  if (notice.action === 'saveKey') {
    return t('skills.messages.keyUpdated')
  }
  return notice.message || t('skills.messages.installed')
}

function getMarketNoticeText(
  notice: SkillsMarketNotice | null,
  t: (key: string, options?: Record<string, unknown>) => string,
): string | null {
  if (!notice) return null
  if (notice.action === 'prepareCli') {
    return notice.version
      ? t('skills.market.messages.cliReadyVersion', { version: notice.version })
      : t('skills.market.messages.cliReady')
  }
  return t('skills.market.messages.installed', { slug: notice.slug })
}

function getMarketErrorText(
  error: SkillsMarketError | null,
  t: (key: string, options?: Record<string, unknown>) => string,
): string | null {
  if (!error) return null
  if (error.code === 'requires_force') {
    return null
  }
  if (error.code === 'not_logged_in') {
    return t('skills.market.loginRequired')
  }
  if (error.code !== 'rate_limit') {
    return error.message
  }

  return typeof error.retryAfterSeconds === 'number' && error.retryAfterSeconds > 0
    ? t('skills.market.errors.rateLimitedRetry', { seconds: error.retryAfterSeconds })
    : t('skills.market.errors.rateLimited')
}

function normalizeClawhubHandle(handle?: string | null): string | null {
  const normalized = handle?.trim()
  if (!normalized) return null
  return normalized.startsWith('@') ? normalized : `@${normalized}`
}

function formatClawhubAccount(auth: ClawhubAuthStatus | null): string | null {
  const displayName = auth?.displayName?.trim()
  const handle = normalizeClawhubHandle(auth?.handle)
  if (displayName && handle) {
    return `${displayName} (${handle})`
  }
  return displayName || handle || null
}

function getMarketAuthNoticeText(
  notice: SkillsMarketAuthNotice | null,
  t: (key: string, options?: Record<string, unknown>) => string,
): string | null {
  if (!notice) return null
  if (notice.action === 'logout') {
    return t('skills.market.auth.messages.loggedOut')
  }

  const handle = normalizeClawhubHandle(notice.handle)
  return handle
    ? t('skills.market.auth.messages.loggedInHandle', { handle })
    : t('skills.market.auth.messages.loggedIn')
}

function getMarketAuthErrorText(
  error: SkillsMarketError | null,
  t: (key: string, options?: Record<string, unknown>) => string,
): string | null {
  if (!error) return null

  switch (error.code) {
    case 'invalid_token':
      return t('skills.market.auth.errors.invalidToken')
    case 'not_logged_in':
      return t('skills.market.auth.errors.notLoggedIn')
    case 'network':
      return t('skills.market.auth.errors.network')
    default:
      return error.message
  }
}

function getManualImportNoticeText(
  notice: SkillsManualImportNotice | null,
  t: (key: string, options?: Record<string, unknown>) => string,
): string | null {
  if (!notice) return null
  return t('skills.manual.messages.imported', { skillName: notice.skillName })
}

function getManualImportErrorText(
  error: SkillsManualImportError | null,
  t: (key: string, options?: Record<string, unknown>) => string,
): string | null {
  if (!error) return null

  switch (error.code) {
    case 'workspace_not_configured':
      return t('skills.manual.errors.workspaceNotConfigured')
    case 'source_not_found':
      return t('skills.manual.errors.sourceNotFound')
    case 'invalid_path':
      return t('skills.manual.errors.invalidPath')
    case 'unsupported_archive':
      return t('skills.manual.errors.unsupportedArchive')
    case 'invalid_url':
      return t('skills.manual.errors.invalidUrl')
    case 'download_failed':
      return t('skills.manual.errors.downloadFailed')
    case 'missing_skill':
      return t('skills.manual.errors.missingSkill')
    case 'ambiguous_skill':
      return t('skills.manual.errors.ambiguousSkill')
    case 'skill_exists':
      return t('skills.manual.errors.skillExists')
    default:
      return error.message
  }
}

function resolveUiLang(language: string): 'zh' | 'en' {
  return language.toLowerCase().startsWith('zh') ? 'zh' : 'en'
}

function formatUpdatedAt(updatedAt: number | null, language: string): string | null {
  if (!updatedAt) return null
  try {
    return new Intl.DateTimeFormat(language, {
      dateStyle: 'medium',
    }).format(new Date(updatedAt))
  } catch {
    return null
  }
}

function SearchField({
  value,
  onChange,
  onSubmit,
  placeholder,
  disabled = false,
  submitLabel,
  loadingLabel,
  loading = false,
}: {
  value: string
  onChange: (value: string) => void
  onSubmit?: () => void
  placeholder: string
  disabled?: boolean
  submitLabel?: string
  loadingLabel?: string
  loading?: boolean
}) {
  const hasAction = Boolean(onSubmit)

  return (
    <div className={`flex flex-col gap-3 ${hasAction ? 'md:flex-row' : ''}`}>
      <div className="relative min-w-0 flex-1">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/70" />
        <input
          type="text"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="none"
          spellCheck={false}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && onSubmit) {
              onSubmit()
            }
          }}
          placeholder={placeholder}
          className="w-full rounded-2xl border border-border/70 bg-background/85 px-11 py-3 text-sm shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>

      {hasAction && (
        <button
          onClick={onSubmit}
          disabled={disabled}
          className="rounded-2xl bg-primary px-4 py-3 text-sm font-medium text-primary-foreground shadow-sm transition-opacity hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? loadingLabel : submitLabel}
        </button>
      )}
    </div>
  )
}

function ActionField({
  value,
  onChange,
  onSubmit,
  placeholder,
  disabled = false,
  submitLabel,
  loadingLabel,
  loading = false,
}: {
  value: string
  onChange: (value: string) => void
  onSubmit: () => void
  placeholder: string
  disabled?: boolean
  submitLabel: string
  loadingLabel: string
  loading?: boolean
}) {
  return (
    <div className="flex flex-col gap-3 md:flex-row">
      <input
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="none"
        spellCheck={false}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            onSubmit()
          }
        }}
        placeholder={placeholder}
        className="min-w-0 flex-1 rounded-2xl border border-border/70 bg-background/85 px-4 py-3 text-sm shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-ring"
      />

      <button
        onClick={onSubmit}
        disabled={disabled}
        className="inline-flex items-center justify-center gap-2 rounded-2xl bg-primary px-4 py-3 text-sm font-medium text-primary-foreground shadow-sm transition-opacity hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <Upload className="h-4 w-4" />
        {loading ? loadingLabel : submitLabel}
      </button>
    </div>
  )
}

function MarketAuthPanel({
  auth,
  authLoading,
  authBusy,
  authErrorText,
  authNoticeText,
  onBrowserLogin,
  onLogout,
  onRefresh,
  t,
}: {
  auth: ClawhubAuthStatus | null
  authLoading: boolean
  authBusy: 'login' | 'browser_login' | 'logout' | null
  authErrorText: string | null
  authNoticeText: string | null
  onBrowserLogin: () => void
  onLogout: () => void
  onRefresh: () => void
  t: (key: string, options?: Record<string, unknown>) => string
}) {
  const accountLabel = formatClawhubAccount(auth)
  const isVerified = auth?.verified === true
  const statusLabel = authLoading
    ? t('common.loading')
    : isVerified
      ? t('skills.market.auth.states.verified')
      : auth?.hasToken
        ? t('skills.market.auth.states.tokenSaved')
        : t('skills.market.auth.states.loggedOut')
  const statusTone = isVerified
    ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
    : auth?.hasToken
      ? 'bg-amber-500/10 text-amber-700 dark:text-amber-400'
      : 'bg-muted text-muted-foreground'
  const browserLoginBusy = authBusy === 'browser_login'

  return (
    <div className="rounded-2xl border bg-card/80 p-5">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 space-y-3">
          <div>
            <h3 className="text-base font-semibold text-foreground">
              {t('skills.market.auth.title')}
            </h3>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              {t('skills.market.auth.description')}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className={`rounded-full px-3 py-1.5 font-medium ${statusTone}`}>
              {statusLabel}
            </span>

            {accountLabel && (
              <span className="rounded-full border border-border/60 bg-background/65 px-3 py-1.5">
                {t('skills.market.auth.account', { account: accountLabel })}
              </span>
            )}
          </div>

          {authErrorText && (
            <div className="rounded-xl bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-400">
              {authErrorText}
            </div>
          )}

          {authNoticeText && (
            <div className="rounded-xl bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-400">
              {authNoticeText}
            </div>
          )}
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2 lg:justify-end">
          {!isVerified && (
            <button
              onClick={onBrowserLogin}
              disabled={authBusy !== null}
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-primary px-4 py-3 text-sm font-medium text-primary-foreground shadow-sm transition-opacity hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <LogIn className="h-4 w-4" />
              {browserLoginBusy
                ? t('skills.market.auth.actions.openingBrowser')
                : t('skills.market.auth.actions.browserLogin')}
            </button>
          )}

          <button
            onClick={onRefresh}
            disabled={authBusy !== null || authLoading}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-border/70 bg-background/80 px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted/60 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${authLoading ? 'animate-spin' : ''}`} />
            {authLoading
              ? t('skills.market.auth.actions.refreshing')
              : t('skills.market.auth.actions.refresh')}
          </button>

          {auth?.hasToken && (
            <button
              onClick={onLogout}
              disabled={authBusy !== null}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-border/70 bg-background/80 px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted/60 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <LogOut className="h-4 w-4" />
              {authBusy === 'logout'
                ? t('skills.market.auth.actions.loggingOut')
                : t('skills.market.auth.actions.logout')}
            </button>
          )}

          <p className="w-full text-xs leading-6 text-muted-foreground lg:max-w-[280px] lg:text-right">
            {t('skills.market.auth.browserHint')}
          </p>
        </div>
      </div>
    </div>
  )
}

function ViewSwitcher({
  activeView,
  onChange,
  t,
}: {
  activeView: 'installed' | 'market' | 'manual'
  onChange: (view: 'installed' | 'market' | 'manual') => void
  t: (key: string) => string
}) {
  const viewItems = [
    { key: 'installed' as const, icon: Package2 },
    { key: 'market' as const, icon: Compass },
    { key: 'manual' as const, icon: Upload },
  ]

  return (
    <div className="inline-flex w-fit items-center gap-1 rounded-2xl border border-border/70 bg-background/70 p-1 shadow-sm">
      {viewItems.map((item) => {
        const Icon = item.icon
        const active = activeView === item.key
        return (
          <button
            key={item.key}
            onClick={() => onChange(item.key)}
            className={`inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition-all ${
              active
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:bg-muted/70 hover:text-foreground'
            }`}
          >
            <Icon className="h-4 w-4" />
            {t(`skills.views.${item.key}`)}
          </button>
        )
      })}
    </div>
  )
}

function ManualImportModeChips({
  activeMode,
  onChange,
  t,
}: {
  activeMode: ManualSkillImportSource
  onChange: (mode: ManualSkillImportSource) => void
  t: (key: string) => string
}) {
  const items: ManualSkillImportSource[] = ['directory', 'archive', 'url']

  return (
    <div className="flex flex-wrap items-center gap-2">
      {items.map((item) => {
        const active = activeMode === item
        return (
          <button
            key={item}
            onClick={() => onChange(item)}
            className={`rounded-full border px-3 py-2 text-sm transition-all ${
              active
                ? 'border-primary/20 bg-primary/10 text-primary'
                : 'border-border/70 bg-background/70 text-muted-foreground hover:border-border hover:bg-muted/50 hover:text-foreground'
            }`}
          >
            {t(`skills.manual.sources.${item}`)}
          </button>
        )
      })}
    </div>
  )
}

function SkillCard({ skill }: { skill: SkillStatusEntry }) {
  const { t } = useTranslation()
  const store = useSkillsStore()
  const missing = computeSkillMissing(skill)
  const reasons = computeSkillReasonCodes(skill)
  const busy = store.busyKey === skill.skillKey
  const notice = store.notices[skill.skillKey]
  const noticeText = getNoticeText(notice, t)
  const installOption = skill.install[0]
  const canInstall = Boolean(installOption && skill.missing.bins.length > 0)
  const showBundledBadge = Boolean(skill.bundled && skill.source !== 'openclaw-bundled')
  const enabled = !skill.disabled

  return (
    <article className="rounded-2xl border bg-card/80 px-4 py-4">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 text-base font-semibold leading-tight">
            <span>{skill.emoji ? `${skill.emoji} ${skill.name}` : skill.name}</span>
            <span className="rounded-full bg-muted px-2.5 py-1 font-mono text-[11px] text-muted-foreground">
              {skill.source}
            </span>
            {showBundledBadge && (
              <span className="rounded-full bg-muted px-2.5 py-1 text-[11px] text-muted-foreground">
                {t('skills.status.bundled')}
              </span>
            )}
          </div>

          <SkillDescription description={skill.description} />

          <div className="mt-3 space-y-1 text-sm text-muted-foreground">
            {missing.length > 0 && (
              <div>
                <span className="font-medium text-foreground">{t('skills.labels.missing')}:</span>{' '}
                {missing.map((entry) => t(`skills.missingKinds.${entry}`)).join(', ')}
              </div>
            )}

            {reasons.length > 0 && (
              <div>
                <span className="font-medium text-foreground">{t('skills.labels.reason')}:</span>{' '}
                {reasons.map((reason) => t(`skills.reasons.${reason}`)).join(', ')}
              </div>
            )}

            {noticeText && (
              <div
                className={
                  notice?.kind === 'error'
                    ? 'text-red-600 dark:text-red-400'
                    : 'text-emerald-700 dark:text-emerald-400'
                }
              >
                {noticeText}
              </div>
            )}
          </div>
        </div>

        <div className="flex w-full shrink-0 flex-col gap-3 xl:w-[340px]">
          <div className="flex flex-wrap items-center gap-3 xl:justify-end">
            <label className="inline-flex items-center gap-3 text-sm">
              <span className="text-muted-foreground">
                {enabled ? t('skills.status.enabled') : t('skills.status.disabled')}
              </span>
              <Switch
                checked={enabled}
                onCheckedChange={(checked) => { store.toggleSkill(skill.skillKey, checked).catch(() => {}) }}
                disabled={busy}
                aria-label={enabled ? t('skills.actions.disable') : t('skills.actions.enable')}
              />
            </label>

            {canInstall && installOption && (
              <Button
                onClick={() => { store.installSkill(skill.skillKey, skill.name, installOption.id).catch(() => {}) }}
                disabled={busy}
                variant="outline"
                size="compact"
                className="border-blue-500/30 bg-blue-500/10 text-blue-700 hover:bg-blue-500/15 dark:text-blue-300"
              >
                {busy ? t('skills.actions.installing') : installOption.label}
              </Button>
            )}
          </div>

          {skill.primaryEnv && (
            <div className="pt-1">
              <label className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
                {t('skills.labels.apiKey')}
              </label>
              <div className="mt-1 text-xs text-muted-foreground">
                {t('skills.labels.envHint', { env: skill.primaryEnv })}
              </div>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <Input
                  type="password"
                  value={store.edits[skill.skillKey] ?? ''}
                  onChange={(event) => store.updateEdit(skill.skillKey, event.target.value)}
                  className="min-w-0 flex-1"
                />
                <Button
                  onClick={() => { store.saveApiKey(skill.skillKey).catch(() => {}) }}
                  disabled={busy}
                  size="compact"
                >
                  {t('skills.actions.saveKey')}
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </article>
  )
}

function SkillDescription({ description }: { description: string }) {
  const { t } = useTranslation()
  const paragraphRef = useRef<HTMLParagraphElement | null>(null)
  const [expanded, setExpanded] = useState(false)
  const [expandable, setExpandable] = useState(false)

  useEffect(() => {
    const node = paragraphRef.current
    if (!node) return
    const target = node

    function measureOverflow() {
      const parent = target.parentElement
      if (!parent) return

      const computedStyle = window.getComputedStyle(target)
      const lineHeight = Number.parseFloat(computedStyle.lineHeight)
      const collapsedHeight = Number.isFinite(lineHeight) ? lineHeight * 3 : 72

      const clone = target.cloneNode(true) as HTMLParagraphElement
      clone.style.position = 'absolute'
      clone.style.visibility = 'hidden'
      clone.style.pointerEvents = 'none'
      clone.style.display = 'block'
      clone.style.setProperty('-webkit-line-clamp', 'unset')
      clone.style.setProperty('-webkit-box-orient', 'unset')
      clone.style.overflow = 'visible'
      clone.style.minHeight = '0'
      clone.style.maxHeight = 'none'
      clone.style.height = 'auto'
      clone.style.width = `${target.clientWidth}px`
      parent.appendChild(clone)
      const nextExpandable = clone.offsetHeight > collapsedHeight + 1
      parent.removeChild(clone)
      setExpandable(nextExpandable)
    }

    measureOverflow()
    if (typeof ResizeObserver === 'undefined') return

    const observer = new ResizeObserver(measureOverflow)
    observer.observe(target)

    return () => observer.disconnect()
  }, [description])

  return (
    <div className="mt-2">
      <div className="min-h-[4.5rem]">
        <p
          ref={paragraphRef}
          className="text-sm leading-6 text-muted-foreground"
          style={expanded
            ? undefined
            : {
                display: '-webkit-box',
                WebkitBoxOrient: 'vertical',
                WebkitLineClamp: 3,
                overflow: 'hidden',
              }}
        >
          {description}
        </p>
      </div>

      <div className="mt-1 h-5">
        {expandable && (
          <button
            type="button"
            onClick={() => setExpanded((current) => !current)}
            className="text-xs font-medium text-primary transition-opacity hover:opacity-80"
          >
            {expanded ? t('skills.actions.showLess') : t('skills.actions.showMore')}
          </button>
        )}
      </div>
    </div>
  )
}

function MarketCard({
  item,
  installed,
}: {
  item: ClawhubSearchItem
  installed: boolean
}) {
  const { t, i18n } = useTranslation()
  const store = useSkillsStore()
  const busy = store.marketBusySlug === item.slug
  const updatedAt = formatUpdatedAt(item.updatedAt, i18n.language)
  const requiresForce = store.marketError?.code === 'requires_force'
    && store.marketError?.slug === item.slug

  function handleInstall(force = false) {
    if (force && !window.confirm(t('skills.market.forceConfirm', { slug: item.slug }))) {
      return
    }

    store.installMarketSkill(item.slug, {
      version: item.version || undefined,
      lang: resolveUiLang(i18n.language),
      force,
    }).catch(() => {})
  }

  return (
    <article className="rounded-2xl border bg-card/80 px-4 py-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 text-base font-semibold leading-tight">
            <span>{item.displayName}</span>
            <span className="rounded-full bg-muted px-2.5 py-1 font-mono text-[11px] text-muted-foreground">
              {item.slug}
            </span>
            {installed && (
              <span className="rounded-full bg-emerald-500/10 px-2.5 py-1 text-[11px] text-emerald-700 dark:text-emerald-400">
                {t('skills.market.installedBadge')}
              </span>
            )}
          </div>

          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            {item.summary || t('skills.market.noSummary')}
          </p>

          {updatedAt && (
            <div className="mt-3 text-xs text-muted-foreground">
              {t('skills.market.updatedAt', { date: updatedAt })}
            </div>
          )}

          {requiresForce && (
            <div className="mt-3 rounded-xl bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-400">
              {t('skills.market.errors.requiresForce')}
            </div>
          )}
        </div>

        <div className="flex shrink-0 flex-wrap items-start gap-2 lg:justify-end">
          <Button
            onClick={() => { handleInstall(false) }}
            disabled={busy}
            variant="outline"
            size="compact"
            className="border-blue-500/30 bg-blue-500/10 text-blue-700 hover:bg-blue-500/15 dark:text-blue-300"
          >
            {busy
              ? t('skills.market.installing')
              : installed
                ? t('skills.market.reinstall')
                : t('skills.market.install')}
          </Button>

          {requiresForce && (
            <Button
              onClick={() => { handleInstall(true) }}
              disabled={busy}
              size="compact"
            >
              {busy ? t('skills.market.installing') : t('skills.market.forceInstall')}
            </Button>
          )}
        </div>
      </div>
    </article>
  )
}

export default function SkillsView() {
  const { t, i18n } = useTranslation()
  const store = useSkillsStore()
  const [activeView, setActiveView] = useState<'installed' | 'market' | 'manual'>('installed')
  const [filter, setFilter] = useState('')
  const [marketInput, setMarketInput] = useState('')
  const [manualMode, setManualMode] = useState<ManualSkillImportSource>('directory')
  const [manualValues, setManualValues] = useState<Record<ManualSkillImportSource, string>>({
    directory: '',
    archive: '',
    url: '',
  })
  const deferredFilter = useDeferredValue(filter)
  const uiLang = resolveUiLang(i18n.language)

  useEffect(() => {
    store.fetchStatus({ clearNotices: true }).catch(() => {})
  }, [])

  useEffect(() => {
    if (activeView !== 'market') return
    if (store.marketAuth || store.marketAuthLoading) return
    store.fetchMarketAuthStatus().catch(() => {})
  }, [activeView, store.marketAuth, store.marketAuthLoading])

  const skills = store.report?.skills ?? []
  const normalizedFilter = deferredFilter.trim().toLowerCase()
  const isFiltering = normalizedFilter.length > 0
  const filteredSkills = normalizedFilter
    ? skills.filter((skill) =>
      [skill.name, skill.description, skill.source].join(' ').toLowerCase().includes(normalizedFilter))
    : skills
  const showSkeleton = store.loading && !store.report
  const installedKeys = new Set(
    skills.flatMap((skill) => [skill.skillKey.toLowerCase(), skill.name.toLowerCase()]),
  )
  const marketNoticeText = getMarketNoticeText(store.marketNotice, t)
  const marketErrorText = getMarketErrorText(store.marketError, t)
  const marketAuthNoticeText = getMarketAuthNoticeText(store.marketAuthNotice, t)
  const marketAuthErrorText = getMarketAuthErrorText(store.marketAuthError, t)
  const manualNoticeText = getManualImportNoticeText(store.manualImportNotice, t)
  const manualErrorText = getManualImportErrorText(store.manualImportError, t)
  const marketNoticeTone = 'text-emerald-700 dark:text-emerald-400 bg-emerald-500/10'
  const manualInputValue = manualValues[manualMode]
  const marketReady = store.marketAuth?.verified === true

  function handleMarketSearch() {
    store.searchMarket(marketInput).catch(() => {})
  }

  function handleMarketBrowserLogin() {
    store.loginMarketAuthInBrowser({
      lang: uiLang,
      label: 'ClawBox',
    }).catch(() => {})
  }

  function handleMarketLogout() {
    store.logoutMarketAuth({ lang: uiLang })
      .then(() => setMarketInput(''))
      .catch(() => {})
  }

  function handleMarketRefreshAuth() {
    store.fetchMarketAuthStatus().catch(() => {})
  }

  function updateManualValue(source: ManualSkillImportSource, value: string) {
    setManualValues((current) => ({
      ...current,
      [source]: value,
    }))
  }

  function handleManualImport() {
    store.importManualSkill({
      source: manualMode,
      value: manualInputValue,
      overwrite: true,
    }).catch(() => {})
  }

  return (
    <PageShell
      variant="list"
      headerClassName="py-5"
      header={(
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">{t('skills.title')}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t('skills.description')}</p>

          <div className="mt-5 rounded-[28px] border border-border/70 bg-gradient-to-br from-card via-card/95 to-muted/35 p-4 shadow-[0_16px_40px_-24px_rgba(0,0,0,0.28)] sm:p-5">
            <div className="space-y-4">
              <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                <ViewSwitcher
                  activeView={activeView}
                  onChange={setActiveView}
                  t={t}
                />

                {activeView === 'installed' ? (
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span className="rounded-full border border-border/60 bg-background/65 px-3 py-1.5">
                      {t('skills.summary.total', { count: skills.length })}
                    </span>
                    {isFiltering && (
                      <span className="rounded-full border border-border/60 bg-background/65 px-3 py-1.5">
                        {t('skills.summary.shown', { count: filteredSkills.length })}
                      </span>
                    )}
                  </div>
                ) : activeView === 'market' ? (
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span className="rounded-full border border-border/60 bg-background/65 px-3 py-1.5">
                      {marketReady ? t('skills.market.installHint') : t('skills.market.loginRequired')}
                    </span>
                  </div>
                ) : null}
              </div>

              {(activeView === 'installed' || (activeView === 'market' && marketReady)) && (
                <div className="w-full xl:max-w-[420px]">
                  {activeView === 'installed' ? (
                    <SearchField
                      value={filter}
                      onChange={setFilter}
                      placeholder={t('skills.searchPlaceholder')}
                    />
                  ) : activeView === 'market' ? (
                    <SearchField
                      value={marketInput}
                      onChange={setMarketInput}
                      onSubmit={handleMarketSearch}
                      placeholder={t('skills.market.searchPlaceholder')}
                      disabled={store.marketLoading || !marketInput.trim()}
                      submitLabel={t('skills.market.search')}
                      loadingLabel={t('skills.market.searching')}
                      loading={store.marketLoading}
                    />
                  ) : null}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    >
      <div className="space-y-4">
        {activeView === 'installed' ? (
          <>
            {store.error && (
              <div className="rounded-xl bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-400">
                {store.error}
              </div>
            )}

            {showSkeleton ? (
              Array.from({ length: 4 }, (_, index) => (
                <div key={index} className="animate-pulse rounded-2xl border p-5">
                  <div className="h-5 w-40 rounded bg-muted" />
                  <div className="mt-3 h-4 w-2/3 rounded bg-muted" />
                  <div className="mt-4 flex gap-2">
                    <div className="h-6 w-20 rounded-full bg-muted" />
                    <div className="h-6 w-24 rounded-full bg-muted" />
                  </div>
                </div>
              ))
            ) : filteredSkills.length === 0 ? (
              <div className="rounded-2xl border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
                {t('skills.empty')}
              </div>
            ) : (
              <div className="space-y-3">
                {filteredSkills.map((skill) => (
                  <SkillCard key={skill.skillKey} skill={skill} />
                ))}
              </div>
            )}
          </>
        ) : activeView === 'market' ? (
          <>
            <MarketAuthPanel
              auth={store.marketAuth}
              authLoading={store.marketAuthLoading}
              authBusy={store.marketAuthBusy}
              authErrorText={marketAuthErrorText}
              authNoticeText={marketAuthNoticeText}
              onBrowserLogin={handleMarketBrowserLogin}
              onLogout={handleMarketLogout}
              onRefresh={handleMarketRefreshAuth}
              t={t}
            />

            {marketReady && marketErrorText && (
              <div className="rounded-xl bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-400">
                {marketErrorText}
              </div>
            )}

            {marketReady && marketNoticeText && (
              <div className={`rounded-xl px-4 py-3 text-sm ${marketNoticeTone}`}>
                {marketNoticeText}
              </div>
            )}

            {!marketReady ? (
              <div className="rounded-2xl border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
                {t('skills.market.loginRequired')}
              </div>
            ) : store.marketLoading ? (
              Array.from({ length: 4 }, (_, index) => (
                <div key={index} className="animate-pulse rounded-2xl border p-5">
                  <div className="h-5 w-52 rounded bg-muted" />
                  <div className="mt-3 h-4 w-2/3 rounded bg-muted" />
                  <div className="mt-2 h-4 w-1/2 rounded bg-muted" />
                </div>
              ))
            ) : !store.marketQuery ? (
              <div className="rounded-2xl border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
                {t('skills.market.emptyState')}
              </div>
            ) : store.marketResults.length === 0 ? (
              store.marketError ? null : (
                <div className="rounded-2xl border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
                  {t('skills.market.noResults')}
                </div>
              )
            ) : (
              <div className="space-y-3">
                {store.marketResults.map((item) => (
                  <MarketCard
                    key={item.slug}
                    item={item}
                    installed={installedKeys.has(item.slug.toLowerCase())}
                  />
                ))}
              </div>
            )}
          </>
        ) : (
          <>
            {manualErrorText && (
              <div className="rounded-xl bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-400">
                {manualErrorText}
              </div>
            )}

            {manualNoticeText && (
              <div className="rounded-xl bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-400">
                {manualNoticeText}
              </div>
            )}

            <div className="rounded-2xl border bg-card/80 p-5">
              <div className="space-y-5">
                <div className="space-y-3">
                  <div>
                    <h3 className="text-base font-semibold text-foreground">
                      {t('skills.manual.title')}
                    </h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {t('skills.manual.description')}
                    </p>
                  </div>

                  <ManualImportModeChips
                    activeMode={manualMode}
                    onChange={setManualMode}
                    t={t}
                  />
                </div>

                <div className="rounded-2xl border border-border/70 bg-background/60 p-4">
                  <div className="text-sm font-medium text-foreground">
                    {t(`skills.manual.labels.${manualMode}`)}
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {t(`skills.manual.hints.${manualMode}`)}
                  </p>

                  <div className="mt-4">
                    <ActionField
                      value={manualInputValue}
                      onChange={(value) => updateManualValue(manualMode, value)}
                      onSubmit={handleManualImport}
                      placeholder={t(`skills.manual.placeholders.${manualMode}`)}
                      disabled={store.manualImportLoading || !manualInputValue.trim()}
                      submitLabel={t('skills.manual.import')}
                      loadingLabel={t('skills.manual.importing')}
                      loading={store.manualImportLoading}
                    />
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </PageShell>
  )
}

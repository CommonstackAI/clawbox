import { useState, useEffect, useRef, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useCronStore } from '@/store/cron'
import type { CronJob, CronRunLogEntry } from '@/types'
import {
  Plus, Play, Trash2, ChevronLeft, Loader2, Clock, Save,
  ToggleLeft, ToggleRight, History, AlertCircle, X, Pencil,
  ChevronRight, CalendarClock, Zap, Send, Timer,
} from 'lucide-react'
import { PageShell } from '@/components/layout/PageShell'
import { Button } from '@/components/ui/button'
import { Input, selectControlClassName } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'

// ── Shared Helpers ──

function formatSchedule(job: CronJob): string {
  const s = job.schedule
  if (s.kind === 'at') return `Once @ ${new Date(s.at).toLocaleString()}`
  if (s.kind === 'every') {
    const ms = s.everyMs
    if (ms >= 86_400_000) return `Every ${ms / 86_400_000}d`
    if (ms >= 3_600_000) return `Every ${ms / 3_600_000}h`
    return `Every ${ms / 60_000}m`
  }
  return s.tz ? `${s.expr} (${s.tz})` : s.expr
}

function formatTime(ms: number): string {
  return new Date(ms).toLocaleString()
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`
  return `${(ms / 60_000).toFixed(1)}m`
}

function StatusBadge({ status }: { status?: string }) {
  const colors: Record<string, string> = {
    ok: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    error: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
    skipped: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  }
  if (!status) return null
  return (
    <span className={`px-1.5 py-0.5 rounded text-[11px] font-medium ${colors[status] || 'bg-muted text-muted-foreground'}`}>
      {status}
    </span>
  )
}

function InfoRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-start gap-3 py-1.5">
      <span className="text-xs text-muted-foreground w-24 flex-shrink-0 pt-0.5">{label}</span>
      <span className="text-sm min-w-0">{children}</span>
    </div>
  )
}

// ── Job List ──

function JobList({ onSelectJob, onShowForm }: { onSelectJob: (job: CronJob) => void; onShowForm: () => void }) {
  const { t } = useTranslation()
  const { jobs, status, loading, busy, error, runningJobId, loadJobs, toggleJob, removeJob, runJob } = useCronStore()
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  useEffect(() => { loadJobs() }, [])

  const handleRun = async (e: React.MouseEvent, jobId: string) => {
    e.stopPropagation()
    await runJob(jobId)
  }

  return (
    <PageShell
      variant="list"
      header={(
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold">{t('cron.title')}</h2>
            <p className="text-sm text-muted-foreground">
              {t('cron.description')}
              {status && (
                <span className="ml-2">
                  ({status.enabled ? t('cron.enabled') : t('cron.disabled')}, {t('cron.jobCount', { count: status.jobs })})
                </span>
              )}
            </p>
          </div>
          <Button
            onClick={onShowForm}
          >
            <Plus className="h-4 w-4" />
            {t('cron.addJob')}
          </Button>
        </div>
      )}
    >
      <div className="space-y-4">
        {error && (
          <div className="flex items-center gap-2 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : jobs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
            <Clock className="h-10 w-10 mb-3 opacity-50" />
            <p>{t('cron.noJobs')}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {jobs.map(job => (
              <div
                key={job.id}
                className="border rounded-lg p-4 space-y-2 cursor-pointer hover:border-primary/40 hover:shadow-sm transition-all"
                onClick={() => onSelectJob(job)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 min-w-0">
                    <button
                      onClick={(e) => { e.stopPropagation(); toggleJob(job.id, !job.enabled) }}
                      disabled={busy}
                      className="flex-shrink-0 text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                      title={job.enabled ? t('cron.disable') : t('cron.enable')}
                    >
                      {job.enabled
                        ? <ToggleRight className="h-5 w-5 text-green-500" />
                        : <ToggleLeft className="h-5 w-5" />}
                    </button>
                    <div className="min-w-0">
                      <div className="font-medium truncate">{job.name}</div>
                      {job.description && (
                        <div className="text-xs text-muted-foreground truncate">{job.description}</div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={(e) => handleRun(e, job.id)}
                      disabled={runningJobId === job.id}
                      className="p-1.5 rounded-md hover:bg-muted transition-colors disabled:opacity-50"
                      title={runningJobId === job.id ? t('cron.running') : t('cron.runNow')}
                    >
                      {runningJobId === job.id
                        ? <Loader2 className="h-4 w-4 animate-spin text-primary" />
                        : <Play className="h-4 w-4 text-muted-foreground" />}
                    </button>
                    {confirmDeleteId === job.id ? (
                      <div className="flex items-center gap-1 ml-1" onClick={e => e.stopPropagation()}>
                        <button
                          onClick={() => { removeJob(job.id); setConfirmDeleteId(null) }}
                          disabled={busy}
                          className="px-2 py-1 text-xs rounded bg-destructive text-destructive-foreground hover:opacity-90 disabled:opacity-50"
                        >
                          {t('common.delete')}
                        </button>
                        <button
                          onClick={() => setConfirmDeleteId(null)}
                          className="p-1 rounded-md hover:bg-muted transition-colors"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(job.id) }}
                        className="p-1.5 rounded-md hover:bg-muted transition-colors"
                        title={t('common.delete')}
                      >
                        <Trash2 className="h-4 w-4 text-muted-foreground" />
                      </button>
                    )}
                    <ChevronRight className="h-4 w-4 text-muted-foreground/50 ml-1" />
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span className="font-mono">{formatSchedule(job)}</span>
                  <span>{job.sessionTarget === 'main' ? t('cron.mainSession') : t('cron.isolated')}</span>
                  <span>{job.payload.kind === 'systemEvent' ? t('cron.systemEvent') : t('cron.agentTurn')}</span>
                  {runningJobId === job.id ? (
                    <span className="px-1.5 py-0.5 rounded text-[11px] font-medium bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 flex items-center gap-1">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      {t('cron.running')}
                    </span>
                  ) : (
                    job.state?.lastStatus && <StatusBadge status={job.state.lastStatus} />
                  )}
                  {job.state?.nextRunAtMs && (
                    <span>{t('cron.nextRun')}: {formatTime(job.state.nextRunAtMs)}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </PageShell>
  )
}

// ── Job Detail ──

function JobDetail({ jobId, onBack }: { jobId: string; onBack: () => void }) {
  const { t } = useTranslation()
  const { jobs, runs, runsJobId, busy, error, runningJobId, loadJobs, loadRuns, toggleJob, updateJob, removeJob, runJob, clearError } = useCronStore()
  const job = jobs.find(j => j.id === jobId)
  const isRunning = runningJobId === jobId
  const [editing, setEditing] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [saved, setSaved] = useState(false)
  const prevRunningRef = useRef(isRunning)

  useEffect(() => { loadRuns(jobId) }, [jobId])

  // Refresh job data periodically
  useEffect(() => {
    const interval = setInterval(() => { loadJobs() }, 10000)
    return () => clearInterval(interval)
  }, [])

  // When job transitions from running → finished, refresh runs
  useEffect(() => {
    if (prevRunningRef.current && !isRunning) {
      loadRuns(jobId)
    }
    prevRunningRef.current = isRunning
  }, [isRunning, jobId])

  if (!job) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (editing) {
    return (
      <JobEditForm
        job={job}
        onBack={() => { setEditing(false); loadJobs() }}
      />
    )
  }

  const handleDelete = async () => {
    const ok = await removeJob(jobId)
    if (ok) onBack()
  }

  const handleRun = async () => {
    await runJob(jobId)
  }

  const payloadText = job.payload.kind === 'systemEvent' ? job.payload.text : job.payload.message

  return (
    <PageShell
      variant="detail"
      header={(
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button onClick={onBack} className="p-1.5 -ml-1.5 rounded-md hover:bg-muted transition-colors">
              <ChevronLeft className="h-5 w-5" />
            </button>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-semibold truncate">{job.name}</h2>
                <button
                  onClick={() => toggleJob(job.id, !job.enabled)}
                  disabled={busy}
                  className="flex-shrink-0 disabled:opacity-50"
                  title={job.enabled ? t('cron.disable') : t('cron.enable')}
                >
                  {job.enabled
                    ? <ToggleRight className="h-5 w-5 text-green-500" />
                    : <ToggleLeft className="h-5 w-5 text-muted-foreground" />}
                </button>
              </div>
              {job.description && (
                <p className="text-sm text-muted-foreground truncate">{job.description}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <Button
              onClick={() => setEditing(true)}
              variant="outline"
              size="compact"
            >
              <Pencil className="h-3.5 w-3.5" />
              {t('cron.edit')}
            </Button>
            <Button
              onClick={handleRun}
              disabled={isRunning || busy}
              size="compact"
            >
              {isRunning
                ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />{t('cron.running')}</>
                : <><Play className="h-3.5 w-3.5" />{t('cron.runNow')}</>}
            </Button>
            {confirmDelete ? (
              <div className="flex items-center gap-1">
                <Button
                  onClick={handleDelete}
                  disabled={busy}
                  variant="destructive"
                  size="compact"
                >
                  {t('cron.confirmDelete')}
                </Button>
                <button onClick={() => setConfirmDelete(false)} className="p-1.5 rounded-md hover:bg-muted">
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <Button
                onClick={() => setConfirmDelete(true)}
                variant="destructiveOutline"
                size="compact"
              >
                <Trash2 className="h-3.5 w-3.5" />
                {t('common.delete')}
              </Button>
            )}
          </div>
        </div>
      )}
    >
      <div className="space-y-6">
        {error && (
          <div className="flex items-center justify-between rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              {error}
            </div>
            <button onClick={clearError} className="p-0.5 hover:bg-destructive/20 rounded">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        <div className="border rounded-lg p-4 space-y-1">
            <div className="flex items-center gap-2 mb-2">
              <Timer className="h-4 w-4 text-muted-foreground" />
              <h3 className="font-semibold">{t('cron.statusTitle')}</h3>
            </div>
            <div className="grid grid-cols-2 gap-x-6">
              <InfoRow label={t('cron.statusLabel')}>
                <div className="flex items-center gap-2">
                  {job.enabled ? (
                    <span className="text-green-600 dark:text-green-400 font-medium">{t('cron.enabled')}</span>
                  ) : (
                    <span className="text-muted-foreground">{t('cron.disabled')}</span>
                  )}
                  {isRunning ? (
                    <span className="px-1.5 py-0.5 rounded text-[11px] font-medium bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 flex items-center gap-1">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      {t('cron.running')}
                    </span>
                  ) : (
                    job.state?.lastStatus && <StatusBadge status={job.state.lastStatus} />
                  )}
                </div>
              </InfoRow>
              <InfoRow label={t('cron.createdAt')}>
                {formatTime(job.createdAtMs)}
              </InfoRow>
              {job.state?.nextRunAtMs && (
                <InfoRow label={t('cron.nextRun')}>
                  <span className="text-primary font-medium">{formatTime(job.state.nextRunAtMs)}</span>
                </InfoRow>
              )}
              {job.state?.lastRunAtMs && (
                <InfoRow label={t('cron.lastRun')}>
                  {formatTime(job.state.lastRunAtMs)}
                  {job.state.lastDurationMs != null && (
                    <span className="text-muted-foreground ml-2">({formatDuration(job.state.lastDurationMs)})</span>
                  )}
                </InfoRow>
              )}
              {job.state?.lastError && (
                <div className="col-span-2">
                  <InfoRow label={t('cron.lastError')}>
                    <span className="text-destructive text-xs">{job.state.lastError}</span>
                  </InfoRow>
                </div>
              )}
            </div>
          </div>

          <div className="border rounded-lg p-4 space-y-1">
            <div className="flex items-center gap-2 mb-2">
              <CalendarClock className="h-4 w-4 text-muted-foreground" />
              <h3 className="font-semibold">{t('cron.schedule')}</h3>
            </div>
            <InfoRow label={t('cron.scheduleType')}>
              <span className="font-mono text-xs bg-muted px-2 py-0.5 rounded">{formatSchedule(job)}</span>
            </InfoRow>
            <InfoRow label={t('cron.sessionTarget')}>
              {job.sessionTarget === 'main' ? t('cron.mainSession') : t('cron.isolated')}
            </InfoRow>
            <InfoRow label={t('cron.wakeMode')}>
              {job.wakeMode === 'now' ? t('cron.wakeNow') : t('cron.wakeHeartbeat')}
            </InfoRow>
          </div>

          <div className="border rounded-lg p-4 space-y-1">
            <div className="flex items-center gap-2 mb-2">
              <Zap className="h-4 w-4 text-muted-foreground" />
              <h3 className="font-semibold">{t('cron.execution')}</h3>
            </div>
            <InfoRow label={t('cron.payloadType')}>
              {job.payload.kind === 'systemEvent' ? t('cron.systemEvent') : t('cron.agentTurn')}
            </InfoRow>
            <div className="pt-1">
              <div className="text-xs text-muted-foreground mb-1">
                {job.payload.kind === 'agentTurn' ? t('cron.agentMessage') : t('cron.eventText')}
              </div>
              <div className="bg-muted/40 rounded-lg px-3 py-2 text-sm whitespace-pre-wrap break-words font-mono">
                {payloadText}
              </div>
            </div>
            {job.payload.kind === 'agentTurn' && job.payload.model && (
              <InfoRow label={t('cron.model')}>
                <span className="font-mono text-xs bg-muted px-2 py-0.5 rounded">{job.payload.model}</span>
              </InfoRow>
            )}
            {job.payload.kind === 'agentTurn' && job.payload.timeoutSeconds && (
              <InfoRow label={t('cron.timeout')}>
                {job.payload.timeoutSeconds}{t('cron.seconds')}
              </InfoRow>
            )}
          </div>

          {job.delivery && job.delivery.mode !== 'none' && (
            <div className="border rounded-lg p-4 space-y-1">
              <div className="flex items-center gap-2 mb-2">
                <Send className="h-4 w-4 text-muted-foreground" />
                <h3 className="font-semibold">{t('cron.delivery')}</h3>
              </div>
              <InfoRow label={t('cron.deliveryMode')}>
                {t(`cron.delivery_${job.delivery.mode}`)}
              </InfoRow>
              {job.delivery.channel && (
                <InfoRow label={t('cron.deliveryChannel')}>{job.delivery.channel}</InfoRow>
              )}
              {job.delivery.to && (
                <InfoRow label={t('cron.deliveryTo')}>{job.delivery.to}</InfoRow>
              )}
            </div>
          )}

          <div className="border rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <History className="h-4 w-4 text-muted-foreground" />
                <h3 className="font-semibold">{t('cron.runHistory')}</h3>
              </div>
              <button
                onClick={() => loadRuns(jobId)}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                {t('cron.refresh')}
              </button>
            </div>
            {(runsJobId === jobId && runs.length > 0) ? (
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {runs.map((run, i) => (
                  <RunEntry key={i} run={run} />
                ))}
              </div>
            ) : (
              <div className="text-center py-6 text-sm text-muted-foreground">{t('cron.noRuns')}</div>
            )}
          </div>
      </div>
    </PageShell>
  )
}

function DeliveryBadge({ run }: { run: CronRunLogEntry }) {
  if (!run.deliveryStatus || run.deliveryStatus === 'not-requested') return null
  const styles: Record<string, string> = {
    delivered: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    'not-delivered': 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
    unknown: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
  }
  const labels: Record<string, string> = {
    delivered: '已投递',
    'not-delivered': '未投递',
    unknown: '未知',
  }
  return (
    <span className={`px-1.5 py-0.5 rounded text-[11px] font-medium ${styles[run.deliveryStatus] || styles.unknown}`}>
      {labels[run.deliveryStatus] || run.deliveryStatus}
    </span>
  )
}

function Tag({ children }: { children: ReactNode }) {
  return (
    <span className="px-2 py-0.5 rounded-full border text-[11px] text-muted-foreground bg-muted/30">
      {children}
    </span>
  )
}

function RunEntry({ run }: { run: CronRunLogEntry }) {
  const [expanded, setExpanded] = useState(false)
  const hasDetails = !!(run.summary || run.error || run.deliveryError || run.sessionKey)

  return (
    <div
      className={`border rounded-lg px-4 py-3 ${hasDetails ? 'cursor-pointer hover:bg-muted/30' : ''} transition-colors`}
      onClick={hasDetails ? () => setExpanded(v => !v) : undefined}
    >
      {/* Header row: status badge + time + duration + arrow */}
      <div className="flex items-center gap-3">
        <StatusBadge status={run.status} />
        <div className="flex-1 min-w-0 text-xs text-muted-foreground">
          {formatTime(run.ts)}
        </div>
        {run.durationMs != null && (
          <div className="text-xs text-muted-foreground flex-shrink-0">
            {formatDuration(run.durationMs)}
          </div>
        )}
        {hasDetails && (
          <ChevronRight className={`h-3.5 w-3.5 text-muted-foreground/50 transition-transform ${expanded ? 'rotate-90' : ''}`} />
        )}
      </div>

      {/* Tags row: delivery, model, provider, tokens */}
      {(run.model || run.deliveryStatus) && (
        <div className="flex flex-wrap items-center gap-1.5 mt-2">
          <DeliveryBadge run={run} />
          {run.model && <Tag>{run.model}</Tag>}
          {run.provider && <Tag>{run.provider}</Tag>}
          {run.usage?.total_tokens != null && <Tag>{run.usage.total_tokens.toLocaleString()} tokens</Tag>}
        </div>
      )}

      {/* Expanded details */}
      {expanded && (
        <div className="mt-2 pt-2 border-t space-y-1.5">
          {run.summary && <div className="text-sm whitespace-pre-wrap">{run.summary}</div>}
          {run.error && (
            <div className="text-xs text-destructive">{run.error}</div>
          )}
          {run.deliveryError && (
            <div className="text-xs text-orange-600 dark:text-orange-400">{run.deliveryError}</div>
          )}
          {run.runAtMs && (
            <div className="text-xs text-muted-foreground">
              运行于 {formatTime(run.runAtMs)}
            </div>
          )}
          {run.sessionKey && (
            <div className="text-xs text-muted-foreground break-all">
              Session: {run.sessionKey}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Job Edit Form ──

type FormState = {
  name: string
  description: string
  enabled: boolean
  deleteAfterRun: boolean
  scheduleKind: 'at' | 'every' | 'cron'
  scheduleAt: string
  everyAmount: string
  everyUnit: 'minutes' | 'hours' | 'days'
  cronExpr: string
  cronTz: string
  sessionTarget: 'main' | 'isolated'
  wakeMode: 'next-heartbeat' | 'now'
  payloadKind: 'systemEvent' | 'agentTurn'
  payloadText: string
  payloadModel: string
  timeoutSeconds: string
  deliveryMode: 'none' | 'announce' | 'webhook'
  deliveryChannel: string
  deliveryTo: string
  deliveryBestEffort: boolean
}

const defaultForm: FormState = {
  name: '',
  description: '',
  enabled: true,
  deleteAfterRun: false,
  scheduleKind: 'every',
  scheduleAt: '',
  everyAmount: '30',
  everyUnit: 'minutes',
  cronExpr: '',
  cronTz: '',
  sessionTarget: 'isolated',
  wakeMode: 'now',
  payloadKind: 'agentTurn',
  payloadText: '',
  payloadModel: '',
  timeoutSeconds: '',
  deliveryMode: 'announce',
  deliveryChannel: 'last',
  deliveryTo: '',
  deliveryBestEffort: false,
}

function jobToForm(job: CronJob): FormState {
  const s = job.schedule
  let scheduleKind: FormState['scheduleKind'] = 'every'
  let scheduleAt = ''
  let everyAmount = '30'
  let everyUnit: FormState['everyUnit'] = 'minutes'
  let cronExpr = ''
  let cronTz = ''

  if (s.kind === 'at') {
    scheduleKind = 'at'
    // Convert ISO to datetime-local format
    const d = new Date(s.at)
    scheduleAt = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  } else if (s.kind === 'every') {
    scheduleKind = 'every'
    const ms = s.everyMs
    if (ms >= 86_400_000 && ms % 86_400_000 === 0) {
      everyAmount = String(ms / 86_400_000); everyUnit = 'days'
    } else if (ms >= 3_600_000 && ms % 3_600_000 === 0) {
      everyAmount = String(ms / 3_600_000); everyUnit = 'hours'
    } else {
      everyAmount = String(ms / 60_000); everyUnit = 'minutes'
    }
  } else {
    scheduleKind = 'cron'
    cronExpr = s.expr
    cronTz = s.tz || ''
  }

  const payloadKind = job.payload.kind
  const payloadText = payloadKind === 'systemEvent' ? job.payload.text : job.payload.message
  const timeoutSeconds = (payloadKind === 'agentTurn' && job.payload.timeoutSeconds) ? String(job.payload.timeoutSeconds) : ''
  const payloadModel = (payloadKind === 'agentTurn' && job.payload.model) ? job.payload.model : ''

  return {
    name: job.name,
    description: job.description || '',
    enabled: job.enabled,
    deleteAfterRun: job.deleteAfterRun || false,
    scheduleKind,
    scheduleAt,
    everyAmount,
    everyUnit,
    cronExpr,
    cronTz,
    sessionTarget: job.sessionTarget,
    wakeMode: job.wakeMode,
    payloadKind,
    payloadText,
    payloadModel,
    timeoutSeconds,
    deliveryMode: (job.delivery?.mode as FormState['deliveryMode']) || 'none',
    deliveryChannel: job.delivery?.channel || 'last',
    deliveryTo: job.delivery?.to || '',
    deliveryBestEffort: job.delivery?.bestEffort || false,
  }
}

function JobEditForm({ job, onBack }: { job: CronJob; onBack: () => void }) {
  const { t } = useTranslation()
  const { updateJob, busy, error } = useCronStore()
  const [form, setForm] = useState<FormState>(() => jobToForm(job))
  const [saved, setSaved] = useState(false)

  const update = (field: keyof FormState, value: string | boolean) => {
    setForm(f => ({ ...f, [field]: value }))
  }

  const handleSave = async () => {
    const schedule = buildSchedule(form)
    const payload = buildPayload(form)
    const delivery = (form.sessionTarget === 'isolated' && form.payloadKind === 'agentTurn')
      ? buildDelivery(form) : undefined

    const ok = await updateJob(job.id, {
      name: form.name.trim(),
      description: form.description.trim() || undefined,
      enabled: form.enabled,
      deleteAfterRun: form.deleteAfterRun || undefined,
      schedule,
      sessionTarget: form.sessionTarget,
      wakeMode: form.wakeMode,
      payload,
      delivery,
    })
    if (ok) {
      setSaved(true)
      setTimeout(() => { setSaved(false); onBack() }, 600)
    }
  }

  const canSave = form.name.trim() && form.payloadText.trim() && !busy

  return (
    <PageShell
      variant="form"
      header={(
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button onClick={onBack} className="p-1.5 -ml-1.5 rounded-md hover:bg-muted transition-colors">
              <ChevronLeft className="h-5 w-5" />
            </button>
            <h2 className="text-xl font-semibold">{t('cron.editJob')}</h2>
          </div>
          <Button
            onClick={handleSave}
            disabled={!canSave}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {saved ? t('common.saved') : t('common.save')}
          </Button>
        </div>
      )}
    >
      <div className="space-y-6">
        {error && (
          <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}
        <ScheduleFormFields form={form} update={update} />
      </div>
    </PageShell>
  )
}

function JobCreateForm({ onBack }: { onBack: () => void }) {
  const { t } = useTranslation()
  const { addJob, busy, error } = useCronStore()
  const [form, setForm] = useState<FormState>(defaultForm)

  const update = (field: keyof FormState, value: string | boolean) => {
    setForm(f => ({ ...f, [field]: value }))
  }

  const handleSubmit = async () => {
    const schedule = buildSchedule(form)
    const payload = buildPayload(form)
    const delivery = (form.sessionTarget === 'isolated' && form.payloadKind === 'agentTurn')
      ? buildDelivery(form) : undefined

    const ok = await addJob({
      name: form.name.trim(),
      description: form.description.trim() || undefined,
      enabled: form.enabled,
      deleteAfterRun: form.deleteAfterRun || undefined,
      schedule,
      sessionTarget: form.sessionTarget,
      wakeMode: form.wakeMode,
      payload,
      delivery,
    })
    if (ok) onBack()
  }

  const canSubmit = form.name.trim() && form.payloadText.trim() && !busy

  return (
    <PageShell
      variant="form"
      header={(
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button onClick={onBack} className="p-1.5 -ml-1.5 rounded-md hover:bg-muted transition-colors">
              <ChevronLeft className="h-5 w-5" />
            </button>
            <h2 className="text-xl font-semibold">{t('cron.addJob')}</h2>
          </div>
          <Button
            onClick={handleSubmit}
            disabled={!canSubmit}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            {t('cron.create')}
          </Button>
        </div>
      )}
    >
      <div className="space-y-6">
        {error && (
          <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}
        <ScheduleFormFields form={form} update={update} />
      </div>
    </PageShell>
  )
}

// ── Shared Form Fields ──

function ScheduleFormFields({ form, update }: { form: FormState; update: (field: keyof FormState, value: string | boolean) => void }) {
  const { t } = useTranslation()
  const { channels, loadChannels } = useCronStore()

  useEffect(() => { loadChannels() }, [])

  return (
    <>
      {/* Basic Info */}
      <div className="border rounded-lg p-4 space-y-3">
        <h3 className="font-semibold">{t('cron.basicInfo')}</h3>
        <div>
          <label className="text-xs text-muted-foreground">{t('cron.jobName')}</label>
          <Input
            type="text"
            value={form.name}
            onChange={e => update('name', e.target.value)}
            placeholder={t('cron.jobNamePlaceholder')}
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">{t('cron.jobDescription')}</label>
          <Input
            type="text"
            value={form.description}
            onChange={e => update('description', e.target.value)}
            placeholder={t('cron.jobDescriptionPlaceholder')}
          />
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="cronEnabled"
              checked={form.enabled}
              onChange={e => update('enabled', e.target.checked)}
              className="rounded border-input"
            />
            <label htmlFor="cronEnabled" className="text-sm text-muted-foreground cursor-pointer">
              {t('cron.enableOnCreate')}
            </label>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="deleteAfterRun"
              checked={form.deleteAfterRun}
              onChange={e => update('deleteAfterRun', e.target.checked)}
              className="rounded border-input"
            />
            <label htmlFor="deleteAfterRun" className="text-sm text-muted-foreground cursor-pointer">
              {t('cron.deleteAfterRun')}
            </label>
          </div>
        </div>
      </div>

      {/* Schedule */}
      <div className="border rounded-lg p-4 space-y-3">
        <h3 className="font-semibold">{t('cron.schedule')}</h3>
        <div className="flex gap-2">
          {(['every', 'cron', 'at'] as const).map(kind => (
            <Button
              key={kind}
              type="button"
              onClick={() => update('scheduleKind', kind)}
              variant={form.scheduleKind === kind ? 'default' : 'outline'}
              size="compact"
            >
              {t(`cron.schedule_${kind}`)}
            </Button>
          ))}
        </div>

        {form.scheduleKind === 'every' && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">{t('cron.every')}</span>
            <Input
              type="number"
              value={form.everyAmount}
              onChange={e => update('everyAmount', e.target.value)}
              className="w-20"
              min="1"
            />
            <select
              value={form.everyUnit}
              onChange={e => update('everyUnit', e.target.value)}
              className={selectControlClassName}
            >
              <option value="minutes">{t('cron.minutes')}</option>
              <option value="hours">{t('cron.hours')}</option>
              <option value="days">{t('cron.days')}</option>
            </select>
          </div>
        )}

        {form.scheduleKind === 'cron' && (
          <div className="space-y-2">
            <div>
              <label className="text-xs text-muted-foreground">{t('cron.cronExpression')}</label>
              <Input
                type="text"
                value={form.cronExpr}
                onChange={e => update('cronExpr', e.target.value)}
                className="font-mono"
                placeholder="0 9 * * 1-5"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">{t('cron.timezone')}</label>
              <Input
                type="text"
                value={form.cronTz}
                onChange={e => update('cronTz', e.target.value)}
                placeholder="Asia/Shanghai"
              />
            </div>
          </div>
        )}

        {form.scheduleKind === 'at' && (
          <div>
            <label className="text-xs text-muted-foreground">{t('cron.runAt')}</label>
            <Input
              type="datetime-local"
              value={form.scheduleAt}
              onChange={e => update('scheduleAt', e.target.value)}
            />
          </div>
        )}
      </div>

      {/* Execution */}
      <div className="border rounded-lg p-4 space-y-3">
        <h3 className="font-semibold">{t('cron.execution')}</h3>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-muted-foreground">{t('cron.sessionTarget')}</label>
            <select
              value={form.sessionTarget}
              onChange={e => update('sessionTarget', e.target.value)}
              className={selectControlClassName}
            >
              <option value="isolated">{t('cron.isolated')}</option>
              <option value="main">{t('cron.mainSession')}</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">{t('cron.wakeMode')}</label>
            <select
              value={form.wakeMode}
              onChange={e => update('wakeMode', e.target.value)}
              className={selectControlClassName}
            >
              <option value="now">{t('cron.wakeNow')}</option>
              <option value="next-heartbeat">{t('cron.wakeHeartbeat')}</option>
            </select>
          </div>
        </div>

        <div>
          <label className="text-xs text-muted-foreground">{t('cron.payloadType')}</label>
          <div className="flex gap-2 mt-1">
            {(['agentTurn', 'systemEvent'] as const).map(kind => (
              <Button
                key={kind}
                type="button"
                onClick={() => update('payloadKind', kind)}
                variant={form.payloadKind === kind ? 'default' : 'outline'}
                size="compact"
              >
                {kind === 'agentTurn' ? t('cron.agentTurn') : t('cron.systemEvent')}
              </Button>
            ))}
          </div>
        </div>

        <div>
          <label className="text-xs text-muted-foreground">
            {form.payloadKind === 'agentTurn' ? t('cron.agentMessage') : t('cron.eventText')}
          </label>
          <Textarea
            value={form.payloadText}
            onChange={e => update('payloadText', e.target.value)}
            rows={3}
            className="resize-none"
            placeholder={form.payloadKind === 'agentTurn' ? t('cron.agentMessagePlaceholder') : t('cron.eventTextPlaceholder')}
          />
        </div>

        {form.payloadKind === 'agentTurn' && (
          <>
            <div>
              <label className="text-xs text-muted-foreground">{t('cron.model')}</label>
              <Input
                type="text"
                value={form.payloadModel}
                onChange={e => update('payloadModel', e.target.value)}
                placeholder={t('cron.modelPlaceholder')}
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">{t('cron.timeout')}</label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  value={form.timeoutSeconds}
                  onChange={e => update('timeoutSeconds', e.target.value)}
                  className="w-32"
                  placeholder="300"
                  min="0"
                />
                <span className="text-xs text-muted-foreground">{t('cron.seconds')}</span>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Delivery (only for isolated + agentTurn) */}
      {form.sessionTarget === 'isolated' && form.payloadKind === 'agentTurn' && (
        <div className="border rounded-lg p-4 space-y-3">
          <h3 className="font-semibold">{t('cron.delivery')}</h3>
          <div>
            <label className="text-xs text-muted-foreground">{t('cron.deliveryMode')}</label>
            <div className="flex gap-2 mt-1">
              {(['announce', 'webhook', 'none'] as const).map(mode => (
                <Button
                  key={mode}
                  type="button"
                  onClick={() => update('deliveryMode', mode)}
                  variant={form.deliveryMode === mode ? 'default' : 'outline'}
                  size="compact"
                >
                  {t(`cron.delivery_${mode}`)}
                </Button>
              ))}
            </div>
          </div>

          {form.deliveryMode !== 'none' && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground">{t('cron.deliveryChannel')}</label>
                  <select
                    value={form.deliveryChannel}
                    onChange={e => update('deliveryChannel', e.target.value)}
                    className={selectControlClassName}
                  >
                    {channels.map(ch => (
                      <option key={ch.id} value={ch.id}>{ch.label}</option>
                    ))}
                    {form.deliveryChannel && !channels.some(ch => ch.id === form.deliveryChannel) && (
                      <option value={form.deliveryChannel}>{form.deliveryChannel}</option>
                    )}
                  </select>
                  <p className="text-[11px] text-muted-foreground mt-1">{t('cron.deliveryChannelHint')}</p>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">{t('cron.deliveryTo')}</label>
                  <Input
                    type="text"
                    value={form.deliveryTo}
                    onChange={e => update('deliveryTo', e.target.value)}
                    placeholder={getDeliveryToPlaceholder(form)}
                  />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="deliveryBestEffort"
                  checked={form.deliveryBestEffort}
                  onChange={e => update('deliveryBestEffort', e.target.checked)}
                  className="rounded border-input"
                />
                <label htmlFor="deliveryBestEffort" className="text-sm text-muted-foreground cursor-pointer">
                  {t('cron.deliveryBestEffort')}
                </label>
              </div>
            </>
          )}
        </div>
      )}
    </>
  )
}

// ── Helpers ──

function getDeliveryToPlaceholder(form: FormState): string {
  if (form.deliveryMode === 'webhook') return 'https://example.com/webhook'
  const ch = form.deliveryChannel
  if (ch === 'telegram') return 'Chat ID'
  if (ch === 'discord') return 'Channel ID'
  if (ch === 'slack') return 'Channel ID'
  if (ch === 'last' || !ch) return '留空使用默认目标'
  return '目标 ID'
}

function buildSchedule(form: FormState) {
  if (form.scheduleKind === 'at') {
    const ms = Date.parse(form.scheduleAt)
    if (!Number.isFinite(ms)) throw new Error('Invalid run time')
    return { kind: 'at' as const, at: new Date(ms).toISOString() }
  }
  if (form.scheduleKind === 'every') {
    const amount = Number(form.everyAmount)
    if (!amount || amount <= 0) throw new Error('Invalid interval')
    const mult = form.everyUnit === 'minutes' ? 60_000 : form.everyUnit === 'hours' ? 3_600_000 : 86_400_000
    return { kind: 'every' as const, everyMs: amount * mult }
  }
  const expr = form.cronExpr.trim()
  if (!expr) throw new Error('Cron expression required')
  return { kind: 'cron' as const, expr, tz: form.cronTz.trim() || undefined }
}

function buildPayload(form: FormState) {
  if (form.payloadKind === 'systemEvent') {
    return { kind: 'systemEvent' as const, text: form.payloadText.trim() }
  }
  const payload: { kind: 'agentTurn'; message: string; model?: string; timeoutSeconds?: number } = {
    kind: 'agentTurn',
    message: form.payloadText.trim(),
  }
  if (form.payloadModel.trim()) payload.model = form.payloadModel.trim()
  const timeout = Number(form.timeoutSeconds)
  if (timeout > 0) payload.timeoutSeconds = timeout
  return payload
}

function buildDelivery(form: FormState) {
  if (form.deliveryMode === 'none') {
    return { mode: 'none' as const }
  }
  return {
    mode: form.deliveryMode as 'announce' | 'webhook',
    channel: form.deliveryChannel.trim() || 'last',
    to: form.deliveryTo.trim() || undefined,
    bestEffort: form.deliveryBestEffort || undefined,
  }
}

// ── Main Export ──

export function CronView() {
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const loadJobs = useCronStore(s => s.loadJobs)

  if (selectedJobId) {
    return (
      <JobDetail
        jobId={selectedJobId}
        onBack={() => { setSelectedJobId(null); loadJobs() }}
      />
    )
  }

  if (showForm) {
    return <JobCreateForm onBack={() => { setShowForm(false); loadJobs() }} />
  }

  return (
    <JobList
      onSelectJob={(job) => setSelectedJobId(job.id)}
      onShowForm={() => setShowForm(true)}
    />
  )
}

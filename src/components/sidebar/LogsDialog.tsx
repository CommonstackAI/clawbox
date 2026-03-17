import { useEffect, useState, useRef } from 'react'
import { Download, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useSettingsStore } from '@/store/settings'

interface LogEntry {
  timestamp: number
  level: string
  message: string
}

interface LogsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

function getGatewayBaseUrl(gatewayUrl: string): string {
  // Strip /v1 suffix to get the base URL for logs endpoint
  return gatewayUrl.replace(/\/v1\/?$/, '')
}

function formatLogTime(ts: number): string {
  const d = new Date(ts)
  return d.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

export function LogsDialog({ open, onOpenChange }: LogsDialogProps) {
  const [logs, setLogs] = useState<LogEntry[]>([])
  const logsEndRef = useRef<HTMLDivElement>(null)
  const getGatewayUrl = useSettingsStore(s => s.getGatewayUrl)

  useEffect(() => {
    if (!open) return
    const baseUrl = getGatewayBaseUrl(getGatewayUrl())
    const loadLogs = async () => {
      try {
        const res = await fetch(`${baseUrl}/api/logs?limit=200`)
        if (res.ok) {
          const data = await res.json()
          setLogs(data.logs || [])
        }
      } catch {}
    }
    loadLogs()
    const interval = setInterval(loadLogs, 2000)
    return () => clearInterval(interval)
  }, [open])

  useEffect(() => {
    if (open) logsEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logs.length, open])

  const handleClear = async () => {
    const baseUrl = getGatewayBaseUrl(getGatewayUrl())
    await fetch(`${baseUrl}/api/logs`, { method: 'DELETE' }).catch(() => {})
    setLogs([])
  }

  const handleDownload = () => {
    const content = logs.map(l => `[${new Date(l.timestamp).toISOString()}] [${l.level.toUpperCase()}] ${l.message}`).join('\n')
    const blob = new Blob([content], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `clawbox-logs-${Date.now()}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Gateway Logs ({logs.length} entries)</DialogTitle>
          <div className="flex items-center gap-2 pt-2">
            <Button variant="ghost" size="sm" onClick={handleDownload} disabled={!logs.length}>
              <Download className="h-4 w-4 mr-2" />Download
            </Button>
            <Button variant="ghost" size="sm" onClick={handleClear} disabled={!logs.length}>
              <Trash2 className="h-4 w-4 mr-2" />Clear
            </Button>
          </div>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto bg-black/90 dark:bg-black rounded-md p-4 font-mono text-xs text-green-400">
          {logs.length === 0 ? (
            <div className="text-muted-foreground">No logs available</div>
          ) : (
            <div className="whitespace-pre-wrap">
              {logs.map((log, i) => {
                const time = formatLogTime(log.timestamp)
                const tag = log.level === 'error' ? '[ERROR]' : log.level === 'warn' ? '[WARN]' : '[INFO]'
                const color = log.level === 'error' ? 'text-red-400' : log.level === 'warn' ? 'text-yellow-400' : 'text-green-400'
                return <div key={i} className={color}>[{time}] {tag} {log.message}</div>
              })}
              <div ref={logsEndRef} />
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

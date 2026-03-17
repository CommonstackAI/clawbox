import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import type { SessionListItem } from '@/types'

interface SessionInfoDialogProps {
  session: SessionListItem | null
  resolvedTitle: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onDelete: (id: string) => void
}

export function SessionInfoDialog({ session, resolvedTitle, open, onOpenChange, onDelete }: SessionInfoDialogProps) {
  const { t } = useTranslation()
  const [confirmDelete, setConfirmDelete] = useState(false)

  if (!session) return null

  const formatDate = (ts: string) => {
    try {
      return new Date(ts).toLocaleString()
    } catch {
      return ts
    }
  }

  const handleDelete = () => {
    if (!confirmDelete) {
      setConfirmDelete(true)
      return
    }
    onDelete(session.id)
    onOpenChange(false)
    setConfirmDelete(false)
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) setConfirmDelete(false) }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('sessions.info')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">{t('sessions.titleLabel')}</span>
            <span className="font-medium truncate ml-4 text-right max-w-[250px]">{resolvedTitle}</span>
          </div>
          {session.originalSessionId && (
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">{t('sessions.originalSessionId')}</span>
              <span className="font-mono text-right break-all select-text max-w-[250px]">{session.originalSessionId}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-muted-foreground">{t('sessions.lastActive')}</span>
            <span>{formatDate(session.updatedAt)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">{t('sessions.messages')}</span>
            <span>{session.messageCount}</span>
          </div>
        </div>
        <div className="pt-3 border-t">
          <Button
            variant="destructive"
            className="w-full"
            onClick={handleDelete}
          >
            <Trash2 className="h-4 w-4 mr-2" />
            {confirmDelete ? t('sessions.deleteConfirm') : t('sessions.deleteSession')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

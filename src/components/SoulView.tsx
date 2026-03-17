import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSoulStore } from '@/store/soul'
import type { SoulTemplate } from '@/types'
import {
  Loader2, Pencil, Sparkles, AlertCircle, Save, Trash2, Plus,
} from 'lucide-react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { PageShell } from '@/components/layout/PageShell'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { SoulIconBadge } from '@/components/soul/SoulIconBadge'
import { SoulIconPickerPopover } from '@/components/soul/SoulIconPickerPopover'
import { normalizeSoulIconValue } from '@/lib/soul-icons'

const MAX_SOUL_CHARS = 20_000

// ── Active Soul Card ──

function ActiveSoulCard() {
  const { t } = useTranslation()
  const { content, missing, loading, activeMeta, openSoulEditor } = useSoulStore()

  if (loading) {
    return (
      <div className="border-2 border-primary/20 rounded-lg p-5 flex items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (missing) {
    return (
      <div className="border-2 border-dashed border-muted-foreground/30 rounded-lg p-5">
        <div className="text-center">
          <Sparkles className="h-8 w-8 text-muted-foreground/50 mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">{t('soul.noSoul')}</p>
          <p className="text-xs text-muted-foreground/70 mt-1">{t('soul.noSoulHint')}</p>
        </div>
      </div>
    )
  }

  const preview = content.split('\n').filter(l => l.trim())[0] || ''
  const displayName = activeMeta?.name || 'SOUL.md'

  return (
    <div className="border-2 border-primary/30 bg-primary/5 rounded-lg p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <SoulIconBadge value={activeMeta?.icon} className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-medium">{displayName}</span>
              <span className="px-1.5 py-0.5 rounded text-[11px] font-medium bg-primary/10 text-primary">
                {t('soul.active')}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-1 truncate font-mono">{preview}</p>
          </div>
        </div>
        <button
          onClick={() => openSoulEditor()}
          className="px-3 py-1.5 rounded-lg border text-sm flex items-center gap-1.5 hover:bg-muted transition-colors flex-shrink-0"
        >
          <Pencil className="h-3.5 w-3.5" />
          {t('soul.edit')}
        </button>
      </div>
    </div>
  )
}

// ── Template Card ──

function TemplateCard({ template, onPreview }: { template: SoulTemplate; onPreview: (t: SoulTemplate) => void }) {
  const { t } = useTranslation()
  const { save, saving, content: activeContent, missing, openEditTemplateEditor, deleteTemplate } = useSoulStore()
  const isActive = !missing && template.content === activeContent
  const [applying, setApplying] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const handleApply = async (e: React.MouseEvent) => {
    e.stopPropagation()
    setApplying(true)
    await save(template.content, { name: template.name, icon: template.icon })
    setApplying(false)
  }

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!confirmDelete) {
      setConfirmDelete(true)
      return
    }
    await deleteTemplate(template.id)
    setConfirmDelete(false)
  }

  return (
    <div
      className={`border rounded-lg p-4 flex flex-col hover:bg-accent/50 transition-colors group cursor-pointer min-h-[180px] ${isActive ? 'border-2 border-primary/30 bg-primary/5' : ''}`}
      onClick={() => onPreview(template)}
    >
      <div className="flex items-start gap-3 mb-3">
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <SoulIconBadge value={template.icon} className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <span className="font-medium text-sm">{template.name}</span>
          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
            {template.description || template.content.split('\n').filter(l => l.trim()).slice(0, 2).join(' ')}
          </p>
        </div>
        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
          <button
            onClick={(e) => { e.stopPropagation(); openEditTemplateEditor(template) }}
            className="p-1 rounded hover:bg-muted transition-colors"
            title={t('soul.editTemplate')}
          >
            <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
          <button
            onClick={handleDelete}
            className={`p-1 rounded transition-colors ${confirmDelete ? 'bg-destructive/10 text-destructive' : 'hover:bg-muted text-muted-foreground'}`}
            title={confirmDelete ? t('soul.confirmDelete') : t('common.delete')}
            onBlur={() => setConfirmDelete(false)}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      <div className="mt-auto">
        <button
          onClick={handleApply}
          disabled={saving || applying || isActive}
          className={`w-full px-3 py-1.5 rounded-lg text-xs flex items-center justify-center gap-1 ${isActive ? 'bg-muted text-muted-foreground cursor-default' : 'bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50'}`}
        >
          {applying ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
          {isActive ? t('soul.active') : t('soul.apply')}
        </button>
      </div>
    </div>
  )
}

// ── Template Preview Dialog ──

function TemplatePreviewDialog({
  template,
  open,
  onClose,
}: {
  template: SoulTemplate | null
  open: boolean
  onClose: () => void
}) {
  const { t } = useTranslation()
  const { save, saving, content: activeContent, missing, openEditTemplateEditor } = useSoulStore()
  const isActive = !!template && !missing && template.content === activeContent
  const [applying, setApplying] = useState(false)

  const handleApply = async () => {
    if (!template) return
    setApplying(true)
    await save(template.content, { name: template.name, icon: template.icon })
    setApplying(false)
    onClose()
  }

  const handleEdit = () => {
    if (!template) return
    onClose()
    openEditTemplateEditor(template)
  }

  if (!template) return null

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <SoulIconBadge value={template.icon} className="h-4.5 w-4.5" />
            </div>
            <span>{template.name}</span>
          </DialogTitle>
          {template.description && (
            <p className="text-sm text-muted-foreground mt-1">{template.description}</p>
          )}
        </DialogHeader>

        <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
          <div className="flex-1 flex flex-col rounded-lg border bg-muted/30 overflow-hidden min-h-[250px]">
            <div className="flex-1 w-full px-4 py-3 text-sm font-mono whitespace-pre-wrap overflow-y-auto">
              {template.content}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={handleEdit}
            className="px-4 py-1.5 rounded-lg border text-sm flex items-center gap-1.5 hover:bg-muted transition-colors"
          >
            <Pencil className="h-3.5 w-3.5" />
            {t('soul.editTemplate')}
          </button>
          <button
            type="button"
            onClick={isActive ? undefined : handleApply}
            disabled={saving || applying || isActive}
            className={`px-4 py-1.5 rounded-lg text-sm flex items-center gap-1.5 ${isActive ? 'bg-muted text-muted-foreground cursor-default' : 'bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50'}`}
          >
            {applying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            {isActive ? t('soul.active') : t('soul.apply')}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ── Add Template Card ──

function AddTemplateCard() {
  const { t } = useTranslation()
  const { openNewTemplateEditor } = useSoulStore()

  return (
    <button
      onClick={openNewTemplateEditor}
      className="border border-dashed rounded-lg p-4 flex flex-col items-center justify-center gap-2 hover:bg-accent/50 transition-colors min-h-[180px]"
    >
      <Plus className="h-6 w-6 text-muted-foreground" />
      <span className="text-sm text-muted-foreground">{t('soul.addTemplate')}</span>
    </button>
  )
}

// ── Edit Dialog (soul edit + template new/edit) ──

function SoulEditDialog() {
  const { t } = useTranslation()
  const {
    editDialogOpen, editContent, editMeta, editMode, editTemplateId, saving, error,
    closeEditor, setEditContent, setEditMeta, save, createTemplate, updateTemplate, clearError,
  } = useSoulStore()

  const charCount = editContent.length
  const overLimit = charCount > MAX_SOUL_CHARS
  const isTemplateMode = editMode === 'template-new' || editMode === 'template-edit'

  const handleSave = async () => {
    if (overLimit) return
    if (editMode === 'soul') {
      await save(editContent)
    } else if (editMode === 'template-new') {
      const icon = normalizeSoulIconValue(editMeta.icon)
      await createTemplate({
        name: editMeta.name || t('soul.untitled'),
        icon,
        description: editMeta.description,
        content: editContent,
      })
    } else if (editMode === 'template-edit' && editTemplateId) {
      const icon = normalizeSoulIconValue(editMeta.icon)
      await updateTemplate(editTemplateId, {
        name: editMeta.name,
        icon,
        description: editMeta.description,
        content: editContent,
      })
    }
  }

  const dialogTitle = editMode === 'soul'
    ? t('soul.editSoulTitle')
    : editMode === 'template-new'
      ? t('soul.newTemplateTitle')
      : t('soul.editTemplateTitle')

  const saveLabel = editMode === 'soul'
    ? t('soul.saveAndApply')
    : t('common.save')

  return (
    <Dialog open={editDialogOpen} onOpenChange={(open) => { if (!open) closeEditor() }}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{dialogTitle}</DialogTitle>
        </DialogHeader>

        <div className="flex-1 flex flex-col gap-3 overflow-hidden">
          {/* Error display inside dialog */}
          {error && (
            <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 rounded-md px-3 py-2">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              <span className="flex-1">{error}</span>
              <button onClick={clearError} className="text-xs underline flex-shrink-0">{t('common.cancel')}</button>
            </div>
          )}
          {/* Template metadata fields */}
          {isTemplateMode && (
            <div className="space-y-3 rounded-lg border bg-muted/20 p-3">
              <div className="flex gap-3 items-start">
                <SoulIconPickerPopover value={editMeta.icon} onChange={(icon) => setEditMeta({ icon })} />
                <div className="flex-1 space-y-2">
                  <Input
                    value={editMeta.name}
                    onChange={(e) => setEditMeta({ name: e.target.value })}
                    className="h-9"
                    placeholder={t('soul.templateNamePlaceholder')}
                  />
                  <Input
                    value={editMeta.description}
                    onChange={(e) => setEditMeta({ description: e.target.value })}
                    className="h-9"
                    placeholder={t('soul.templateDescPlaceholder')}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Markdown editor */}
          <div className="flex-1 min-h-0 flex flex-col">
            <div className="flex-1 flex flex-col rounded-lg border bg-background overflow-hidden focus-within:border-primary min-h-[300px]">
              <Textarea
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                className="min-h-0 flex-1 rounded-none border-0 bg-transparent px-3 py-2 font-mono shadow-none focus-visible:ring-0"
                placeholder={t('soul.editorPlaceholder')}
              />
            </div>
            <div className={`flex justify-end mt-1 text-xs ${overLimit ? 'text-destructive' : 'text-muted-foreground'}`}>
              {charCount.toLocaleString()} / {MAX_SOUL_CHARS.toLocaleString()}
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-2 pt-2">
            <Button
              type="button"
              onClick={closeEditor}
              variant="outline"
              size="compact"
            >
              {t('common.cancel')}
            </Button>
            <Button
              type="button"
              onClick={handleSave}
              disabled={saving || overLimit || (isTemplateMode && !editMeta.name.trim())}
              size="compact"
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              {saveLabel}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ── Main View ──

export function SoulView() {
  const { t } = useTranslation()
  const { loading, error, clearError, load, templates, templatesLoading, loadTemplates } = useSoulStore()
  const [previewTemplate, setPreviewTemplate] = useState<SoulTemplate | null>(null)

  useEffect(() => {
    load()
    loadTemplates()
  }, [])

  return (
    <>
      <PageShell
        variant="list"
        header={(
          <>
            <h2 className="text-xl font-semibold">{t('soul.title')}</h2>
            <p className="text-sm text-muted-foreground">{t('soul.description')}</p>
          </>
        )}
      >
        <div className="space-y-6">
          {error && (
            <div className="flex items-center gap-2 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              <span className="flex-1">{error}</span>
              <button onClick={clearError} className="text-xs underline flex-shrink-0">{t('common.cancel')}</button>
            </div>
          )}

          <div>
            <h3 className="mb-2 text-sm font-medium text-muted-foreground">{t('soul.currentSoul')}</h3>
            <ActiveSoulCard />
          </div>

          <div>
            <h3 className="mb-2 text-sm font-medium text-muted-foreground">{t('soul.templateSection')}</h3>
            {templatesLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {templates.map(tpl => (
                  <TemplateCard key={tpl.id} template={tpl} onPreview={setPreviewTemplate} />
                ))}
                <AddTemplateCard />
              </div>
            )}
          </div>
        </div>
      </PageShell>

      <TemplatePreviewDialog
        template={previewTemplate}
        open={!!previewTemplate}
        onClose={() => setPreviewTemplate(null)}
      />
      <SoulEditDialog />
    </>
  )
}

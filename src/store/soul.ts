import { create } from 'zustand'
import { soulApi } from '@/services/api'
import { DEFAULT_SOUL_ICON_KEY, normalizeSoulIconValue } from '@/lib/soul-icons'
import type { SoulTemplate } from '@/types'

interface SoulState {
  // Active soul (SOUL.md in OpenClaw workspace)
  content: string
  missing: boolean
  loading: boolean
  saving: boolean
  error: string | null
  activeMeta: { name: string; icon: string } | null

  // Template library
  templates: SoulTemplate[]
  templatesLoading: boolean

  // Editor dialog state
  editDialogOpen: boolean
  editContent: string
  editMeta: { name: string; icon: string; description: string }
  editMode: 'soul' | 'template-new' | 'template-edit'
  editTemplateId: string | null

  // Actions — active soul
  load: () => Promise<void>
  save: (content: string, meta?: { name: string; icon: string }) => Promise<boolean>

  // Actions — templates
  loadTemplates: () => Promise<void>
  createTemplate: (data: { name: string; icon: string; description: string; content: string }) => Promise<boolean>
  updateTemplate: (id: string, data: Partial<{ name: string; icon: string; description: string; content: string }>) => Promise<boolean>
  deleteTemplate: (id: string) => Promise<boolean>

  // Actions — editor dialog
  openSoulEditor: () => void
  openNewTemplateEditor: () => void
  openEditTemplateEditor: (template: SoulTemplate) => void
  closeEditor: () => void
  setEditContent: (content: string) => void
  setEditMeta: (meta: Partial<{ name: string; icon: string; description: string }>) => void
  clearError: () => void
}

export const useSoulStore = create<SoulState>((set, get) => ({
  content: '',
  missing: true,
  loading: false,
  saving: false,
  error: null,
  activeMeta: null,

  templates: [],
  templatesLoading: false,

  editDialogOpen: false,
  editContent: '',
  editMeta: { name: '', icon: DEFAULT_SOUL_ICON_KEY, description: '' },
  editMode: 'soul',
  editTemplateId: null,

  load: async () => {
    set({ loading: true, error: null })
    try {
      const result = await soulApi.get()
      // Try to match content against known templates to restore activeMeta
      const { templates } = get()
      const matched = templates.find(t => t.content === result.content)
      set({
        content: result.content,
        missing: result.missing,
        loading: false,
        activeMeta: matched ? { name: matched.name, icon: matched.icon } : null,
      })
    } catch (e: any) {
      set({ error: e.message, loading: false })
    }
  },

  save: async (content: string, meta?: { name: string; icon: string }) => {
    set({ saving: true, error: null })
    try {
      await soulApi.save(content)
      set({ content, missing: false, saving: false, editDialogOpen: false, activeMeta: meta ?? null })
      return true
    } catch (e: any) {
      set({ error: e.message, saving: false })
      return false
    }
  },

  loadTemplates: async () => {
    set({ templatesLoading: true })
    try {
      const result = await soulApi.templates()
      // If no activeMeta yet, try to match current content against loaded templates
      const { content, missing, activeMeta } = get()
      let newMeta = activeMeta
      if (!activeMeta && !missing && content) {
        const matched = result.templates.find(t => t.content === content)
        if (matched) newMeta = { name: matched.name, icon: matched.icon }
      }
      set({ templates: result.templates, templatesLoading: false, activeMeta: newMeta })
    } catch (e: any) {
      set({ error: e.message, templatesLoading: false })
    }
  },

  createTemplate: async (data) => {
    set({ saving: true, error: null })
    try {
      await soulApi.createTemplate(data)
      set({ saving: false, editDialogOpen: false })
      await get().loadTemplates()
      return true
    } catch (e: any) {
      set({ error: e.message, saving: false })
      return false
    }
  },

  updateTemplate: async (id, data) => {
    set({ saving: true, error: null })
    try {
      await soulApi.updateTemplate(id, data)
      set({ saving: false, editDialogOpen: false })
      await get().loadTemplates()
      return true
    } catch (e: any) {
      set({ error: e.message, saving: false })
      return false
    }
  },

  deleteTemplate: async (id) => {
    set({ error: null })
    try {
      await soulApi.deleteTemplate(id)
      // Clear activeMeta if the deleted template was the active one
      const { activeMeta, templates } = get()
      if (activeMeta) {
        const deleted = templates.find(t => t.id === id)
        if (deleted && deleted.name === activeMeta.name && deleted.icon === activeMeta.icon) {
          set({ activeMeta: null })
        }
      }
      await get().loadTemplates()
      return true
    } catch (e: any) {
      set({ error: e.message })
      return false
    }
  },

  openSoulEditor: () => {
    const current = get()
    set({
      editDialogOpen: true,
      editContent: current.content,
      editMode: 'soul',
      editTemplateId: null,
      editMeta: { name: '', icon: '', description: '' },
    })
  },

  openNewTemplateEditor: () => {
    set({
      editDialogOpen: true,
      editContent: '',
      editMode: 'template-new',
      editTemplateId: null,
      editMeta: { name: '', icon: DEFAULT_SOUL_ICON_KEY, description: '' },
    })
  },

  openEditTemplateEditor: (template: SoulTemplate) => {
    set({
      editDialogOpen: true,
      editContent: template.content,
      editMode: 'template-edit',
      editTemplateId: template.id,
      editMeta: {
        name: template.name,
        icon: normalizeSoulIconValue(template.icon),
        description: template.description,
      },
    })
  },

  closeEditor: () => set({ editDialogOpen: false, error: null }),
  setEditContent: (content: string) => set({ editContent: content }),
  setEditMeta: (meta) => set({ editMeta: { ...get().editMeta, ...meta } }),
  clearError: () => set({ error: null }),
}))

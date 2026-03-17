import { useState, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Send, Square, ChevronDown, Loader2, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { GatewayRestartHint } from '@/components/GatewayRestartHint'
import { useSettingsStore } from '@/store/settings'
import { useChatStore } from '@/store/chat'
import { useSoulStore } from '@/store/soul'
import { nanoid } from 'nanoid'
import { getActiveUpstreamProviderType, stripModelRefProvider } from '@/lib/provider-config'
import { SoulIconBadge } from '@/components/soul/SoulIconBadge'

interface ChatInputProps {
  onSend: (prompt: string, thinking?: string) => void
  onAbort: () => void
  isStreaming: boolean
  centered?: boolean
}

export function ChatInput({ onSend, onAbort, isStreaming, centered = false }: ChatInputProps) {
  const { t } = useTranslation()
  const [input, setInput] = useState('')
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false)
  const [soulMenuOpen, setSoulMenuOpen] = useState(false)
  const [switching, setSwitching] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const soulMenuRef = useRef<HTMLDivElement>(null)

  const { config, models, fetchModels, selectModel, loadConfig, pendingModel } = useSettingsStore()
  const rawDefaultModel = config?.providers?.openclaw?.defaultModel || ''
  const defaultModel = stripModelRefProvider(rawDefaultModel)
  const pendingModelLabel = pendingModel ? stripModelRefProvider(pendingModel) : ''
  const activeProviderType = getActiveUpstreamProviderType(config)
  const providerLabel = activeProviderType === 'commonstack'
    ? t('settings.providerCommonstack')
    : t('settings.providerCustom')

  const {
    content: activeContent, missing, activeMeta, templates, templatesLoading,
    save, load, loadTemplates,
  } = useSoulStore()

  useEffect(() => {
    loadConfig().then(() => fetchModels())
    load()
    loadTemplates()
  }, [])

  // Close dropdowns on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setModelDropdownOpen(false)
      }
      if (soulMenuRef.current && !soulMenuRef.current.contains(e.target as Node)) {
        setSoulMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleSubmit = () => {
    const trimmed = input.trim()
    if (!trimmed || isStreaming) return
    onSend(trimmed)
    setInput('')
  }
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.nativeEvent.isComposing || e.keyCode === 229) return
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (!isStreaming) handleSubmit()
    }
  }

  const handleSwitchModel = (modelRef: string) => {
    setModelDropdownOpen(false)
    selectModel(modelRef)
    const model = stripModelRefProvider(modelRef)
    const convId = useChatStore.getState().currentConversationId
    if (convId) {
      useChatStore.getState().addMessage(convId, {
        id: nanoid(),
        role: 'assistant',
        blocks: [{ type: 'text', content: t('chat.modelSwitched', { model }) }],
        timestamp: Date.now(),
      })
    }
  }

  const handleSwitchSoul = async (template: typeof templates[number]) => {
    setSoulMenuOpen(false)
    if (!missing && template.content === activeContent) return
    setSwitching(true)
    await save(template.content, { name: template.name, icon: template.icon })
    setSwitching(false)
  }

  const soulDisplayName = activeMeta?.name || (missing ? t('soul.none') : 'SOUL.md')
  return (
    <div className={centered ? "w-full" : "px-6 py-4 bg-background relative"}>
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center gap-1.5 mb-2 text-xs text-muted-foreground">
          <span>{t('chat.provider')}:</span>
          <span className="font-medium text-foreground/80">{providerLabel}</span>
          <span className="mx-1 opacity-40">·</span>
          <span>{t('chat.model')}:</span>
          <div className="relative" ref={dropdownRef}>
            <button
              type="button"
              onClick={() => setModelDropdownOpen(!modelDropdownOpen)}
              className="inline-flex items-center gap-1 font-medium text-foreground hover:underline cursor-pointer"
            >
              {defaultModel || t('chat.modelNotSet')}
              <ChevronDown className="h-3 w-3" />
            </button>
            {modelDropdownOpen && models.length > 0 && (
              <div className="absolute bottom-full left-0 mb-1 w-64 max-h-48 overflow-y-auto rounded-md border bg-popover p-1 shadow-md z-50">
                {models.map((modelRef) => {
                  const modelLabel = stripModelRefProvider(modelRef)
                  return (
                  <button
                    key={modelRef}
                    type="button"
                    onClick={() => handleSwitchModel(modelRef)}
                    className={`w-full text-left px-3 py-1.5 text-xs rounded-sm hover:bg-accent hover:text-accent-foreground transition-colors ${
                      modelRef === rawDefaultModel ? 'bg-accent text-accent-foreground' : ''
                    }`}
                  >
                    {modelLabel}
                  </button>
                  )
                })}
              </div>
            )}
          </div>

          {/* Soul Capsule */}
          <div className="flex-1" />
          <div className="relative" ref={soulMenuRef}>
            <button
              type="button"
              onClick={() => { if (!templatesLoading) setSoulMenuOpen(!soulMenuOpen) }}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium transition-colors bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20"
            >
              {switching ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <SoulIconBadge value={activeMeta?.icon} className="h-3.5 w-3.5" />
              )}
              <span className="max-w-[100px] truncate">{soulDisplayName}</span>
              <ChevronDown className="h-3 w-3 opacity-60" />
            </button>
            {soulMenuOpen && (
              <div className="absolute bottom-full left-0 mb-1 w-56 max-h-64 overflow-y-auto rounded-md border bg-popover p-1 shadow-md z-50">
                {templates.map((tpl) => {
                  const isActive = !missing && tpl.content === activeContent
                  return (
                    <button
                      key={tpl.id}
                      type="button"
                      onClick={() => handleSwitchSoul(tpl)}
                      className={`w-full text-left px-3 py-2 rounded-sm hover:bg-accent hover:text-accent-foreground transition-colors flex items-center gap-2 ${
                        isActive ? 'bg-accent/50' : ''
                      }`}
                    >
                      <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                        <SoulIconBadge value={tpl.icon} className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-medium truncate">{tpl.name}</div>
                        {tpl.description && (
                          <div className="text-[10px] text-muted-foreground truncate">{tpl.description}</div>
                        )}
                      </div>
                      {isActive && <Check className="h-3.5 w-3.5 text-primary flex-shrink-0" />}
                    </button>
                  )
                })}
                {templates.length === 0 && (
                  <div className="px-3 py-2 text-xs text-muted-foreground text-center">
                    {t('soul.noSoulHint')}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {pendingModel && (
          <GatewayRestartHint compact className="mb-2">
            {t('chat.pendingModelRestartHint', { model: pendingModelLabel })}
          </GatewayRestartHint>
        )}

        <div className="flex items-stretch gap-2">
          <Textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t('chat.placeholder')}
            disabled={isStreaming}
            className="resize-none text-base !min-h-0 h-[44px] overflow-hidden rounded-xl border-border/60 bg-muted/30 focus-visible:bg-background transition-colors"
            rows={1}
          />
          <Button
            onClick={isStreaming ? onAbort : handleSubmit}
            disabled={!isStreaming && !input.trim()}
            className="w-[44px] rounded-xl shrink-0 self-stretch"
            size="icon"
            variant={isStreaming ? 'destructive' : 'default'}
          >
            {isStreaming ? <Square className="h-4 w-4" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
      </div>
    </div>
  )
}

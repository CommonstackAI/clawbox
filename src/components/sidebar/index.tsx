import { useEffect, useState } from 'react'
import { MessageSquare, Plus, Info } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { View } from '@/App'
import type { SessionListItem } from '@/types'
import { useChatStore } from '@/store/chat'
import { useSessionStore } from '@/store/sessions'
import { useSettingsStore } from '@/store/settings'
import { useTitleStore } from '@/store/titles'
import { Button } from '@/components/ui/button'
import { SidebarLogo } from './SidebarLogo'
import { StatusFooter } from './StatusFooter'
import { SessionInfoDialog } from './SessionInfoDialog'

export interface NavItem {
  id: View
  icon: LucideIcon
  label: string
}

interface SidebarProps {
  navItems: NavItem[]
  currentView: View
  onViewChange: (view: View) => void
}

export function Sidebar({ navItems, currentView, onViewChange }: SidebarProps) {
  const sessions = useSessionStore(s => s.sessions)
  const loadSessions = useSessionStore(s => s.loadSessions)
  const deleteSession = useSessionStore(s => s.deleteSession)
  const currentConversationId = useChatStore(s => s.currentConversationId)
  const currentSessionId = useSessionStore(s => s.currentSessionId)
  const settingsStore = useSettingsStore()
  const titles = useTitleStore(s => s.titles)
  const [infoSession, setInfoSession] = useState<SessionListItem | null>(null)

  useEffect(() => { loadSessions() }, [])
  useEffect(() => { useTitleStore.getState().loadTitles() }, [])

  const resolveTitle = (session: SessionListItem) => titles[session.id.toLowerCase()] || session.title

  const openSession = async (id: string, title: string) => {
    const gatewayUrl = settingsStore.getGatewayUrl()
    useSessionStore.getState().setCurrentSession(id)
    const resolved = titles[id.toLowerCase()] || title
    await useChatStore.getState().openOpenclawSession(id, gatewayUrl, resolved)
    onViewChange('chat')
  }

  const handleNewChat = () => {
    useChatStore.getState().setCurrentConversation(null)
    useSessionStore.getState().setCurrentSession(null)
    onViewChange('chat')
  }

  const handleInfo = (session: SessionListItem, e: React.MouseEvent) => {
    e.stopPropagation()
    setInfoSession(session)
  }

  const handleDeleteFromDialog = async (id: string) => {
    await deleteSession(id)
    useChatStore.getState().deleteConversation(id)
    useTitleStore.getState().deleteTitle(id)
  }

  const formatTime = (ts: string) => {
    const diff = Date.now() - new Date(ts).getTime()
    if (diff < 60000) return 'just now'
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m`
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h`
    return `${Math.floor(diff / 86400000)}d`
  }

  return (
    <div className="w-64 subtle-separator-r flex flex-col bg-[hsl(var(--sidebar-bg))] h-full">
      <SidebarLogo />

      {/* Navigation - matching newbox SidebarNav */}
      <nav className="flex-1 p-3 flex flex-col overflow-hidden min-h-0">
        <div className="space-y-1 flex-shrink-0">
          {navItems.map(item => (
            <Button
              key={item.id}
              variant={currentView === item.id ? 'default' : 'ghost'}
              className="w-full justify-start h-11 text-base"
              onClick={() => onViewChange(item.id)}
            >
              <item.icon className="w-5 h-5 mr-3" />
              {item.label}
            </Button>
          ))}
        </div>

        {/* Conversation list - matching newbox ConversationList */}
        {currentView === 'chat' && (
          <>
            <div className="h-px bg-gradient-to-r from-transparent via-border to-transparent my-3 mx-2" />
            <div className="flex flex-col flex-1 min-h-0">
              <div className="flex items-center justify-between px-2 mb-2">
                <span className="text-xs font-semibold text-muted-foreground uppercase">Conversations</span>
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={handleNewChat} title="New conversation">
                  <Plus className="h-4 w-4" />
                </Button>
              </div>

              <div className="flex-1 overflow-y-auto">
                <div className="pb-2">
                  {sessions.length === 0 ? (
                    <div className="text-xs text-muted-foreground text-center py-4">No conversations yet</div>
                  ) : (
                    sessions.map(session => {
                      const sid = session.id.toLowerCase()
                      const activeId = (currentConversationId || currentSessionId || '').toLowerCase()
                      const isActive = sid === activeId
                      return (
                        <div
                          key={session.id}
                          onClick={() => openSession(session.id, session.title)}
                          className={`group flex items-center gap-2 px-2.5 py-2 mx-1 rounded-lg cursor-pointer transition-all duration-150 ${
                            isActive ? 'bg-accent/80 shadow-sm' : 'hover:bg-accent/50'
                          }`}
                        >
                          <div className="relative flex-shrink-0">
                            <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm truncate">{resolveTitle(session)}</p>
                            <p className="text-xs text-muted-foreground">{formatTime(session.updatedAt)}</p>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={(e) => handleInfo(session, e)}
                            title="Info"
                          >
                            <Info className="h-3 w-3 text-muted-foreground" />
                          </Button>
                        </div>
                      )
                    })
                  )}
                </div>
              </div>
            </div>
          </>
        )}
      </nav>

      {/* Session Info Dialog */}
      <SessionInfoDialog
        session={infoSession}
        resolvedTitle={infoSession ? resolveTitle(infoSession) : ''}
        open={!!infoSession}
        onOpenChange={(open) => { if (!open) setInfoSession(null) }}
        onDelete={handleDeleteFromDialog}
      />

      <StatusFooter />
    </div>
  )
}

import { startTransition, useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChatView } from '@/components/ChatView'
import { SettingsView } from '@/components/SettingsView'
import PluginsView from '@/components/PluginsView'
import SkillsView from '@/components/SkillsView'
import { CronView } from '@/components/CronView'
import { SoulView } from '@/components/SoulView'
import { Sidebar } from '@/components/sidebar'
import { ThemeToggle } from '@/components/ThemeToggle'
import { LanguageToggle } from '@/components/LanguageToggle'
import { StartupScreen } from '@/components/StartupScreen'
import { OnboardView } from '@/components/OnboardView'
import { GatewayRestartBanner } from '@/components/GatewayRestartBanner'
import { useThemeEffect } from '@/store/theme'
import { useAppInit } from '@/hooks/useAppInit'
import { useChatStore } from '@/store/chat'
import { useTitleStore } from '@/store/titles'
import { useAgentStore } from '@/store/agents'
import { MessageCircle, Settings, Plug, Clock, Sparkles, Loader2, Wrench } from 'lucide-react'

export type View = 'chat' | 'soul' | 'cron' | 'settings' | 'plugins' | 'skills'
type OnboardTransitionStage = 'idle' | 'closing' | 'opening'

const RECONFIGURE_SWITCH_DELAY_MS = 180
const RECONFIGURE_OVERLAY_FADE_MS = 360

function App() {
  const [currentView, setCurrentView] = useState<View>('chat')
  const [isReconfigure, setIsReconfigure] = useState(false)
  const [savedApiKey, setSavedApiKey] = useState('')
  const [onboardTransitionStage, setOnboardTransitionStage] = useState<OnboardTransitionStage>('idle')
  const transitionTimersRef = useRef<number[]>([])
  const { t } = useTranslation()

  useThemeEffect()
  const { showStartup, startupStatus, startupError, needsOnboard, setNeedsOnboard } = useAppInit()
  const conversation = useChatStore(s => s.getCurrentConversation())
  const titles = useTitleStore(s => s.titles)
  const headerTitle = conversation
    ? (titles[conversation.id.toLowerCase()] || conversation.title)
    : ''

  const navItems = [
    { id: 'chat' as View, icon: MessageCircle, label: t('nav.chat') },
    { id: 'soul' as View, icon: Sparkles, label: t('nav.soul') },
    { id: 'cron' as View, icon: Clock, label: t('nav.cron') },
    { id: 'plugins' as View, icon: Plug, label: t('nav.plugins') },
    { id: 'skills' as View, icon: Wrench, label: t('nav.skills') },
    { id: 'settings' as View, icon: Settings, label: t('nav.settings') },
  ]

  const clearTransitionTimers = useCallback(() => {
    transitionTimersRef.current.forEach(timer => window.clearTimeout(timer))
    transitionTimersRef.current = []
  }, [])

  useEffect(() => () => clearTransitionTimers(), [clearTransitionTimers])

  const handleReconfigure = useCallback((apiKey?: string) => {
    if (needsOnboard || onboardTransitionStage !== 'idle') return

    clearTransitionTimers()
    setSavedApiKey(apiKey || '')
    setIsReconfigure(true)
    setOnboardTransitionStage('closing')

    const switchTimer = window.setTimeout(() => {
      startTransition(() => setNeedsOnboard(true))
      setOnboardTransitionStage('opening')
    }, RECONFIGURE_SWITCH_DELAY_MS)

    const finishTimer = window.setTimeout(() => {
      setOnboardTransitionStage('idle')
      transitionTimersRef.current = []
    }, RECONFIGURE_SWITCH_DELAY_MS + RECONFIGURE_OVERLAY_FADE_MS)

    transitionTimersRef.current = [switchTimer, finishTimer]
  }, [clearTransitionTimers, needsOnboard, onboardTransitionStage, setNeedsOnboard])

  if (showStartup) {
    return <StartupScreen status={startupStatus} error={startupError} />
  }

  const onboardContent = (
    <div className={onboardTransitionStage === 'opening' ? 'animate-in fade-in-0 zoom-in-95 duration-500' : ''}>
      <OnboardView
        skipEnvCheck={isReconfigure}
        initialApiKey={isReconfigure ? savedApiKey : undefined}
        onComplete={async (destination = 'settings') => {
          clearTransitionTimers()
          setOnboardTransitionStage('idle')
          setNeedsOnboard(false)
          setIsReconfigure(false)
          setSavedApiKey('')
          await useAgentStore.getState().loadAgents()
          setCurrentView(isReconfigure ? 'settings' : destination)
        }}
      />
    </div>
  )

  const renderView = () => {
    switch (currentView) {
      case 'chat': return <ChatView />
      case 'soul': return <SoulView />
      case 'cron': return <CronView />
      case 'plugins': return <PluginsView />
      case 'skills': return <SkillsView />
      case 'settings': return <SettingsView onReconfigure={handleReconfigure} />
      default: return <ChatView />
    }
  }

  const appShell = (
    <div
      className={`flex h-screen bg-background transform-gpu transition-all duration-300 ease-out ${
        onboardTransitionStage === 'closing'
          ? 'opacity-0 scale-[0.985] translate-y-3 blur-[3px]'
          : 'opacity-100 scale-100 translate-y-0 blur-0'
      }`}
    >
      <Sidebar navItems={navItems} currentView={currentView} onViewChange={setCurrentView} />
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="subtle-separator-b px-6 py-2.5 flex items-center justify-between bg-background/80 backdrop-blur-md">
          <h1 className="text-lg font-semibold truncate flex-1 mr-4">
            {currentView === 'chat' && conversation ? headerTitle : ''}
          </h1>
          <div className="flex items-center gap-1">
            <LanguageToggle />
            <ThemeToggle />
          </div>
        </div>
        <GatewayRestartBanner />
        <div className="flex-1 overflow-hidden">
          {renderView()}
        </div>
      </div>
    </div>
  )

  return (
    <>
      {needsOnboard ? onboardContent : appShell}

      {onboardTransitionStage !== 'idle' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden">
          <div
            className={`absolute inset-0 bg-background/84 backdrop-blur-xl transition-opacity duration-500 ${
              onboardTransitionStage === 'closing' ? 'opacity-100' : 'opacity-0'
            }`}
          />
          <div
            className={`absolute inset-0 bg-gradient-to-b from-primary/10 via-background/40 to-background transition-opacity duration-500 ${
              onboardTransitionStage === 'closing' ? 'opacity-100' : 'opacity-0'
            }`}
          />
          <div
            className={`relative mx-4 w-full max-w-md overflow-hidden rounded-2xl border border-primary/15 bg-background/88 px-5 py-4 shadow-2xl backdrop-blur-xl transform-gpu transition-all duration-500 ${
              onboardTransitionStage === 'closing'
                ? 'opacity-100 translate-y-0 scale-100'
                : 'opacity-0 -translate-y-4 scale-[0.96]'
            }`}
          >
            <div className="absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-primary/70 to-transparent" />
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/10">
                <Loader2 className="h-5 w-5 animate-spin" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold tracking-tight">
                  {t('settings.reconfigureTransitionTitle')}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t('settings.reconfigureTransitionDesc')}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

export default App

import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { healthApi, onboardApi } from '@/services/api'
import { useAgentStore } from '@/store/agents'
import { useSettingsStore } from '@/store/settings'

export function useAppInit() {
  const { t } = useTranslation()
  const [showStartup, setShowStartup] = useState(true)
  const [startupStatus, setStartupStatus] = useState(t('startup.connectingServer'))
  const [startupError, setStartupError] = useState<string | null>(null)
  const [needsOnboard, setNeedsOnboard] = useState(false)

  useEffect(() => {
    const waitForGatewayReady = async (): Promise<boolean> => {
      let gatewayAttempts = 0
      while (gatewayAttempts < 60) {
        await useSettingsStore.getState().loadConfig()
        const gatewayUrl = useSettingsStore.getState().getGatewayUrl()
        const ok = await healthApi.checkGateway(gatewayUrl)
        if (ok) return true
        await new Promise(r => setTimeout(r, 1000))
        gatewayAttempts++
      }
      return false
    }

    const init = async () => {
      try {
        setStartupError(null)

        setStartupStatus(t('startup.waitingServer'))
        let attempts = 0
        while (attempts < 60) {
          const ok = await healthApi.check()
          if (ok) break
          await new Promise(r => setTimeout(r, 500))
          attempts++
        }
        if (attempts >= 60) {
          setStartupError(t('startup.errors.serverTimeout'))
          return
        }

        setStartupStatus(t('startup.loadingConfig'))
        await useSettingsStore.getState().loadConfig()

        setStartupStatus(t('startup.checkingSetup'))
        try {
          const { needed } = await onboardApi.status()
          if (needed) {
            setNeedsOnboard(true)
            setShowStartup(false)
            return
          }
        } catch {
          // If onboard status check fails, proceed normally
        }

        // Check OpenClaw version after onboard is complete
        setStartupStatus(t('startup.checkingVersion'))
        try {
          const versionResult = await onboardApi.openclawVersionCheck()
          if (versionResult.status === 'not_installed' || versionResult.status === 'outdated') {
            // Re-enter onboard flow to fix environment
            setNeedsOnboard(true)
            setShowStartup(false)
            return
          }
          // 'newer' or 'ok' — proceed normally (no more separate dialog)
        } catch {
          // If version check fails, proceed normally
        }

        setStartupStatus(t('startup.waitingGateway'))
        const gatewayReady = await waitForGatewayReady()
        if (!gatewayReady) {
          setStartupError(t('startup.errors.gatewayTimeout'))
          return
        }

        setStartupStatus(t('startup.loadingAgents'))
        await useAgentStore.getState().loadAgents()

        setShowStartup(false)
      } catch (error) {
        setStartupError(error instanceof Error ? error.message : 'Unknown error')
      }
    }
    init()
  }, [t])

  return { showStartup, startupStatus, startupError, needsOnboard, setNeedsOnboard }
}

import { create } from 'zustand'
import { ApiError, skillsApi } from '@/services/api'
import type {
  ClawhubAuthStatus,
  ClawhubCliStatus,
  ClawhubSearchItem,
  ManualSkillImportSource,
  SkillStatusReport,
} from '@/types'

export type SkillNotice =
  | { kind: 'success'; action: 'toggle'; enabled: boolean }
  | { kind: 'success'; action: 'saveKey' }
  | { kind: 'success'; action: 'install'; message?: string }
  | { kind: 'error'; action: 'toggle' | 'saveKey' | 'install'; message: string }

export type SkillsMarketNotice =
  | { kind: 'success'; action: 'prepareCli'; version?: string }
  | { kind: 'success'; action: 'install'; slug: string }

export type SkillsMarketAuthNotice =
  | { kind: 'success'; action: 'login'; handle?: string | null; displayName?: string | null }
  | { kind: 'success'; action: 'logout' }

export interface SkillsMarketError {
  message: string
  code?: string
  retryAfterSeconds?: number
  slug?: string
  version?: string
}

export interface SkillsManualImportError {
  message: string
  code?: string
}

export interface SkillsManualImportNotice {
  skillName: string
  source: ManualSkillImportSource
}

interface SkillsStore {
  report: SkillStatusReport | null
  loading: boolean
  hydrated: boolean
  error: string | null
  busyKey: string | null
  edits: Record<string, string>
  notices: Record<string, SkillNotice>
  marketCli: ClawhubCliStatus | null
  marketCliLoading: boolean
  marketAuth: ClawhubAuthStatus | null
  marketAuthLoading: boolean
  marketAuthBusy: 'login' | 'browser_login' | 'logout' | null
  marketAuthError: SkillsMarketError | null
  marketAuthNotice: SkillsMarketAuthNotice | null
  marketResults: ClawhubSearchItem[]
  marketLoading: boolean
  marketHydrated: boolean
  marketQuery: string
  marketError: SkillsMarketError | null
  marketBusySlug: string | null
  marketNotice: SkillsMarketNotice | null
  manualImportLoading: boolean
  manualImportError: SkillsManualImportError | null
  manualImportNotice: SkillsManualImportNotice | null
  fetchStatus: (options?: { agentId?: string; clearNotices?: boolean }) => Promise<void>
  updateEdit: (skillKey: string, value: string) => void
  toggleSkill: (skillKey: string, enabled: boolean) => Promise<void>
  saveApiKey: (skillKey: string) => Promise<void>
  installSkill: (skillKey: string, name: string, installId: string) => Promise<void>
  fetchMarketStatus: () => Promise<void>
  fetchMarketAuthStatus: () => Promise<void>
  prepareMarketCli: (lang?: string) => Promise<void>
  loginMarketAuth: (token: string, options?: { lang?: string }) => Promise<void>
  loginMarketAuthInBrowser: (options?: { lang?: string; label?: string }) => Promise<void>
  logoutMarketAuth: (options?: { lang?: string }) => Promise<void>
  searchMarket: (query: string) => Promise<void>
  installMarketSkill: (slug: string, options?: { version?: string; lang?: string; force?: boolean }) => Promise<void>
  importManualSkill: (params: {
    source: ManualSkillImportSource
    value: string
    overwrite?: boolean
  }) => Promise<void>
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }
  return String(error)
}

function getMarketError(
  error: unknown,
  context?: { slug?: string; version?: string },
): SkillsMarketError {
  if (error instanceof ApiError) {
    return {
      message: error.message,
      code: error.code,
      retryAfterSeconds: error.retryAfterSeconds,
      slug: context?.slug,
      version: context?.version,
    }
  }

  return {
    message: getErrorMessage(error),
    slug: context?.slug,
    version: context?.version,
  }
}

function getManualImportError(error: unknown): SkillsManualImportError {
  if (error instanceof ApiError) {
    return {
      message: error.message,
      code: error.code,
    }
  }

  return {
    message: getErrorMessage(error),
  }
}

function getMarketAuthStateError(auth: ClawhubAuthStatus): SkillsMarketError | null {
  if (auth.verified || !auth.error) {
    return null
  }

  return {
    message: auth.error,
    code: auth.code,
  }
}

function getMarketLoginRequiredError(context?: {
  slug?: string
  version?: string
}): SkillsMarketError {
  return {
    message: 'ClawHub is not logged in',
    code: 'not_logged_in',
    slug: context?.slug,
    version: context?.version,
  }
}

function setNotice(
  notices: Record<string, SkillNotice>,
  skillKey: string,
  notice?: SkillNotice,
): Record<string, SkillNotice> {
  if (!skillKey.trim()) {
    return notices
  }

  const next = { ...notices }
  if (notice) {
    next[skillKey] = notice
  } else {
    delete next[skillKey]
  }
  return next
}

export const useSkillsStore = create<SkillsStore>((set, get) => ({
  report: null,
  loading: false,
  hydrated: false,
  error: null,
  busyKey: null,
  edits: {},
  notices: {},
  marketCli: null,
  marketCliLoading: false,
  marketAuth: null,
  marketAuthLoading: false,
  marketAuthBusy: null,
  marketAuthError: null,
  marketAuthNotice: null,
  marketResults: [],
  marketLoading: false,
  marketHydrated: false,
  marketQuery: '',
  marketError: null,
  marketBusySlug: null,
  marketNotice: null,
  manualImportLoading: false,
  manualImportError: null,
  manualImportNotice: null,

  fetchStatus: async (options) => {
    if (get().loading) return

    set((state) => ({
      loading: true,
      error: null,
      ...(options?.clearNotices ? { notices: {} } : {}),
      report: state.report,
    }))

    try {
      const report = await skillsApi.status(options?.agentId)
      set({
        report,
        loading: false,
        hydrated: true,
      })
    } catch (error) {
      set({
        loading: false,
        hydrated: true,
        error: getErrorMessage(error),
      })
    }
  },

  updateEdit: (skillKey, value) => {
    set((state) => ({
      edits: {
        ...state.edits,
        [skillKey]: value,
      },
    }))
  },

  toggleSkill: async (skillKey, enabled) => {
    set((state) => ({
      busyKey: skillKey,
      error: null,
      notices: setNotice(state.notices, skillKey),
    }))

    try {
      await skillsApi.update({ skillKey, enabled })
      await get().fetchStatus()
      set((state) => ({
        busyKey: null,
        notices: setNotice(state.notices, skillKey, {
          kind: 'success',
          action: 'toggle',
          enabled,
        }),
      }))
    } catch (error) {
      const message = getErrorMessage(error)
      set((state) => ({
        busyKey: null,
        error: message,
        notices: setNotice(state.notices, skillKey, {
          kind: 'error',
          action: 'toggle',
          message,
        }),
      }))
      throw error
    }
  },

  saveApiKey: async (skillKey) => {
    set((state) => ({
      busyKey: skillKey,
      error: null,
      notices: setNotice(state.notices, skillKey),
    }))

    try {
      const apiKey = get().edits[skillKey] ?? ''
      await skillsApi.update({ skillKey, apiKey })
      await get().fetchStatus()
      set((state) => ({
        busyKey: null,
        edits: {
          ...state.edits,
          [skillKey]: '',
        },
        notices: setNotice(state.notices, skillKey, {
          kind: 'success',
          action: 'saveKey',
        }),
      }))
    } catch (error) {
      const message = getErrorMessage(error)
      set((state) => ({
        busyKey: null,
        error: message,
        notices: setNotice(state.notices, skillKey, {
          kind: 'error',
          action: 'saveKey',
          message,
        }),
      }))
      throw error
    }
  },

  installSkill: async (skillKey, name, installId) => {
    set((state) => ({
      busyKey: skillKey,
      error: null,
      notices: setNotice(state.notices, skillKey),
    }))

    try {
      const result = await skillsApi.install({
        skillKey,
        name,
        installId,
        timeoutMs: 120000,
      })
      await get().fetchStatus()
      set((state) => ({
        busyKey: null,
        notices: setNotice(state.notices, skillKey, {
          kind: 'success',
          action: 'install',
          message: result?.message,
        }),
      }))
    } catch (error) {
      const message = getErrorMessage(error)
      set((state) => ({
        busyKey: null,
        error: message,
        notices: setNotice(state.notices, skillKey, {
          kind: 'error',
          action: 'install',
          message,
        }),
      }))
      throw error
    }
  },

  fetchMarketStatus: async () => {
    if (get().marketCliLoading) return

    set({
      marketCliLoading: true,
      marketError: null,
    })

    try {
      const marketCli = await skillsApi.marketStatus()
      set({
        marketCli,
        marketCliLoading: false,
      })
    } catch (error) {
      const marketError = getMarketError(error)
      set({
        marketCliLoading: false,
        marketError,
      })
    }
  },

  fetchMarketAuthStatus: async () => {
    if (get().marketAuthLoading) return

    set({
      marketAuthLoading: true,
      marketAuthError: null,
    })

    try {
      const marketAuth = await skillsApi.marketAuthStatus()
      const marketAuthError = getMarketAuthStateError(marketAuth)
      set({
        marketAuth,
        marketAuthLoading: false,
        marketAuthError,
      })
    } catch (error) {
      const marketAuthError = getMarketError(error)
      set({
        marketAuthLoading: false,
        marketAuthError,
      })
    }
  },

  prepareMarketCli: async (lang) => {
    set({
      marketCliLoading: true,
      marketError: null,
      marketNotice: null,
    })

    try {
      const marketCli = await skillsApi.installClawhubCli(lang)
      set({
        marketCli,
        marketCliLoading: false,
        marketNotice: {
          kind: 'success',
          action: 'prepareCli',
          version: marketCli.version,
        },
      })
    } catch (error) {
      const marketError = getMarketError(error)
      set({
        marketCliLoading: false,
        marketError,
        marketNotice: null,
      })
      throw error
    }
  },

  loginMarketAuth: async (token, options) => {
    set({
      marketAuthBusy: 'login',
      marketAuthError: null,
      marketAuthNotice: null,
      marketCliLoading: true,
    })

    try {
      const marketAuth = await skillsApi.loginClawhub({
        token,
        lang: options?.lang,
      })

      const marketCli = await skillsApi.marketStatus().catch(() => get().marketCli)
      const marketAuthError = getMarketAuthStateError(marketAuth)

      set({
        marketCli,
        marketCliLoading: false,
        marketAuth,
        marketAuthError,
        marketAuthBusy: null,
        marketAuthNotice: marketAuthError
          ? null
          : {
            kind: 'success',
            action: 'login',
            handle: marketAuth.handle,
            displayName: marketAuth.displayName,
          },
      })
    } catch (error) {
      const marketAuthError = getMarketError(error)
      set({
        marketCliLoading: false,
        marketAuthBusy: null,
        marketAuthError,
        marketAuthNotice: null,
      })
      throw error
    }
  },

  loginMarketAuthInBrowser: async (options) => {
    set({
      marketAuthBusy: 'browser_login',
      marketAuthError: null,
      marketAuthNotice: null,
      marketCliLoading: true,
    })

    try {
      const marketAuth = await skillsApi.loginClawhubInBrowser({
        lang: options?.lang,
        label: options?.label,
      })

      const marketCli = await skillsApi.marketStatus().catch(() => get().marketCli)
      const marketAuthError = getMarketAuthStateError(marketAuth)

      set({
        marketCli,
        marketCliLoading: false,
        marketAuth,
        marketAuthError,
        marketAuthBusy: null,
        marketAuthNotice: marketAuthError
          ? null
          : {
            kind: 'success',
            action: 'login',
            handle: marketAuth.handle,
            displayName: marketAuth.displayName,
          },
      })
    } catch (error) {
      const marketAuthError = getMarketError(error)
      set({
        marketCliLoading: false,
        marketAuthBusy: null,
        marketAuthError,
        marketAuthNotice: null,
      })
      throw error
    }
  },

  logoutMarketAuth: async (options) => {
    set({
      marketAuthBusy: 'logout',
      marketAuthError: null,
      marketAuthNotice: null,
    })

    try {
      const marketAuth = await skillsApi.logoutClawhub(options?.lang)
      set({
        marketAuth,
        marketAuthBusy: null,
        marketAuthNotice: {
          kind: 'success',
          action: 'logout',
        },
        marketResults: [],
        marketQuery: '',
        marketHydrated: false,
        marketError: null,
        marketNotice: null,
      })
    } catch (error) {
      const marketAuthError = getMarketError(error)
      set({
        marketAuthBusy: null,
        marketAuthError,
        marketAuthNotice: null,
      })
      throw error
    }
  },

  searchMarket: async (query) => {
    const normalizedQuery = query.trim()
    set({
      marketLoading: true,
      marketError: null,
      marketNotice: null,
      marketQuery: normalizedQuery,
    })

    if (!normalizedQuery) {
      set({
        marketResults: [],
        marketLoading: false,
        marketHydrated: true,
      })
      return
    }

    if (!get().marketAuth?.verified) {
      set({
        marketResults: [],
        marketLoading: false,
        marketHydrated: true,
        marketError: getMarketLoginRequiredError(),
      })
      return
    }

    try {
      const result = await skillsApi.marketSearch(normalizedQuery)
      set({
        marketResults: result.results,
        marketLoading: false,
        marketHydrated: true,
      })
    } catch (error) {
      const marketError = getMarketError(error)
      set({
        marketResults: [],
        marketLoading: false,
        marketHydrated: true,
        marketError,
      })
    }
  },

  installMarketSkill: async (slug, options) => {
    if (!get().marketAuth?.verified) {
      const marketError = getMarketLoginRequiredError({
        slug,
        version: options?.version,
      })
      set({
        marketBusySlug: null,
        marketError,
        marketNotice: null,
      })
      throw new Error(marketError.message)
    }

    set({
      marketBusySlug: slug,
      marketError: null,
      marketNotice: null,
    })

    try {
      await skillsApi.marketInstall({
        slug,
        version: options?.version,
        lang: options?.lang,
        force: options?.force,
      })
      await Promise.all([
        get().fetchStatus(),
        get().fetchMarketStatus(),
      ])
      set({
        marketBusySlug: null,
        marketNotice: {
          kind: 'success',
          action: 'install',
          slug,
        },
      })
    } catch (error) {
      const marketError = getMarketError(error, {
        slug,
        version: options?.version,
      })
      set({
        marketBusySlug: null,
        marketError,
        marketNotice: null,
      })
      throw error
    }
  },

  importManualSkill: async (params) => {
    set({
      manualImportLoading: true,
      manualImportError: null,
      manualImportNotice: null,
    })

    try {
      const result = await skillsApi.manualImport(params)
      await get().fetchStatus()
      set({
        manualImportLoading: false,
        manualImportNotice: {
          skillName: result.skillName,
          source: params.source,
        },
      })
    } catch (error) {
      const manualImportError = getManualImportError(error)
      set({
        manualImportLoading: false,
        manualImportError,
        manualImportNotice: null,
      })
      throw error
    }
  },
}))

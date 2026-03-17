import { create } from 'zustand'
import { useEffect } from 'react'

type Theme = 'light' | 'dark' | 'system'

interface ThemeState {
  theme: Theme
  setTheme: (theme: Theme) => void
}

export const useThemeStore = create<ThemeState>((set) => ({
  theme: (localStorage.getItem('clawbox-theme') as Theme) || 'system',
  setTheme: (theme) => {
    localStorage.setItem('clawbox-theme', theme)
    set({ theme })
  },
}))

export function useThemeEffect() {
  const theme = useThemeStore(s => s.theme)

  useEffect(() => {
    const root = document.documentElement
    root.classList.remove('light', 'dark')

    if (theme === 'system') {
      const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches
      root.classList.add(isDark ? 'dark' : 'light')
    } else {
      root.classList.add(theme)
    }
  }, [theme])
}

import { Moon, Sun, Monitor } from 'lucide-react'
import { useThemeStore } from '@/store/theme'

export function ThemeToggle() {
  const { theme, setTheme } = useThemeStore()
  const next = theme === 'light' ? 'dark' : theme === 'dark' ? 'system' : 'light'
  const icon = theme === 'light' ? <Sun className="h-4 w-4" /> : theme === 'dark' ? <Moon className="h-4 w-4" /> : <Monitor className="h-4 w-4" />

  return (
    <button onClick={() => setTheme(next)} className="h-8 w-8 rounded-full flex items-center justify-center hover:bg-muted transition-colors">
      {icon}
    </button>
  )
}

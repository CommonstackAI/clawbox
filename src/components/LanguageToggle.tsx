import { useState, useRef, useEffect } from 'react'
import { Globe } from 'lucide-react'
import { useTranslation } from 'react-i18next'

const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'zh', label: '中文' },
]

export function LanguageToggle() {
  const { i18n } = useTranslation()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const currentCode = i18n.language?.startsWith('zh') ? 'zh' : 'en'

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="h-8 w-8 rounded-full flex items-center justify-center hover:bg-muted transition-colors"
        title={LANGUAGES.find(l => l.code === currentCode)?.label}
      >
        <Globe className="h-4 w-4" />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 w-32 rounded-md border bg-popover p-1 shadow-md z-50">
          {LANGUAGES.map(lang => (
            <button
              key={lang.code}
              onClick={() => { i18n.changeLanguage(lang.code); setOpen(false) }}
              className={`w-full text-left px-3 py-1.5 text-sm rounded-sm transition-colors ${
                currentCode === lang.code
                  ? 'bg-accent text-accent-foreground font-medium'
                  : 'hover:bg-accent hover:text-accent-foreground'
              }`}
            >
              {lang.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

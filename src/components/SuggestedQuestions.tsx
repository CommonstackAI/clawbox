import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { titlesApi } from '@/services/api'

const CACHE_TTL_MS = 10 * 60 * 1000
const suggestionsCache: Record<string, { data: string[]; ts: number }> = {}
const SUGGESTION_SKELETON_WIDTHS = ['68%', '82%', '74%']

interface SuggestedQuestionsProps {
  onSelect: (question: string) => void
}

export function SuggestedQuestions({ onSelect }: SuggestedQuestionsProps) {
  const { i18n } = useTranslation()
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const lang = i18n.language?.startsWith('zh') ? 'zh' : 'en'

  useEffect(() => {
    const cached = suggestionsCache[lang]
    if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
      setSuggestions(cached.data)
      setIsLoading(false)
      return
    }

    let cancelled = false
    setIsLoading(true)
    setError(null)
    titlesApi.getSuggestions(lang)
      .then(({ suggestions }) => {
        if (cancelled) return
        suggestionsCache[lang] = { data: suggestions, ts: Date.now() }
        setSuggestions(suggestions)
      })
      .catch((e: any) => { if (!cancelled) { console.error('Failed to load suggestions:', e); setError(e.message) } })
      .finally(() => { if (!cancelled) setIsLoading(false) })
    return () => { cancelled = true }
  }, [lang])

  if (isLoading) {
    return (
      <div className="w-full py-2" aria-hidden="true">
        <div className="flex flex-col gap-2.5">
          {SUGGESTION_SKELETON_WIDTHS.map((width, index) => (
            <div
              key={index}
              className="flex items-center justify-between gap-3 rounded-lg px-1 py-1.5 animate-pulse"
            >
              <div
                className="h-4 rounded-full bg-muted/80"
                style={{ width }}
              />
              <div className="h-4 w-4 flex-shrink-0 rounded-full bg-muted/70" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (error || suggestions.length === 0) {
    return null
  }

  return (
    <div className="w-full">
      <div className="flex flex-col gap-2">
        {suggestions.map((question, index) => (
          <button
            key={index}
            onClick={() => onSelect(question)}
            className="flex items-center justify-between text-sm text-muted-foreground hover:text-foreground transition-colors group text-left"
          >
            <span>{question}</span>
            <svg
              className="h-4 w-4 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13 7l5 5m0 0l-5 5m5-5H6"
              />
            </svg>
          </button>
        ))}
      </div>
    </div>
  )
}

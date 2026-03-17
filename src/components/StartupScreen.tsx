import { Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'

interface StartupScreenProps {
  status: string
  error: string | null
}

export function StartupScreen({ status, error }: StartupScreenProps) {
  const { t } = useTranslation()

  return (
    <div className="h-screen flex items-center justify-center bg-background">
      <div className="text-center space-y-4">
        <h1 className="text-3xl font-bold">ClawBox</h1>
        {error ? (
          <div className="space-y-2">
            <p className="text-destructive">{error}</p>
            <p className="text-sm text-muted-foreground">{t('startup.errorHint')}</p>
          </div>
        ) : (
          <div className="flex items-center gap-2 justify-center text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-sm">{status}</span>
          </div>
        )}
      </div>
    </div>
  )
}

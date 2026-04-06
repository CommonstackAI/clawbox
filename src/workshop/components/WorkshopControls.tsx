/**
 * WorkshopControls — Camera and settings controls for the workshop view.
 */

import { Eye, EyeOff, RotateCcw } from 'lucide-react'
import { useWorkshopStore } from '../store/workshop'

export function WorkshopControls() {
  const showFeed = useWorkshopStore((s) => s.settings.showFeed)
  const updateSettings = useWorkshopStore((s) => s.updateSettings)
  const clearFeed = useWorkshopStore((s) => s.clearFeed)

  return (
    <div className="absolute left-3 bottom-3 flex gap-1.5 pointer-events-auto">
      <button
        onClick={() => updateSettings({ showFeed: !showFeed })}
        className="flex items-center gap-1.5 rounded-lg border border-border/50 bg-background/80 backdrop-blur-lg px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        title={showFeed ? 'Hide feed' : 'Show feed'}
      >
        {showFeed ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
        Feed
      </button>
      <button
        onClick={clearFeed}
        className="flex items-center gap-1.5 rounded-lg border border-border/50 bg-background/80 backdrop-blur-lg px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        title="Clear feed"
      >
        <RotateCcw className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}

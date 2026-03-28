/**
 * WorkshopFeedOverlay — Activity feed panel overlaid on the 3D scene.
 * Shows real-time events from the chat bridge.
 */

import { useEffect, useRef } from 'react'
import { useWorkshopStore } from '../store/workshop'

export function WorkshopFeedOverlay() {
  const feed = useWorkshopStore((s) => s.feed)
  const showFeed = useWorkshopStore((s) => s.settings.showFeed)
  const scrollRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom on new items
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [feed.length])

  if (!showFeed) return null

  return (
    <div className="absolute right-3 top-3 bottom-3 w-72 pointer-events-auto">
      <div className="h-full rounded-xl border border-border/50 bg-background/80 backdrop-blur-lg overflow-hidden flex flex-col">
        <div className="px-3 py-2 border-b border-border/50">
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Activity
          </h3>
        </div>
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto px-3 py-2 space-y-1.5"
        >
          {feed.length === 0 ? (
            <p className="text-xs text-muted-foreground/60 text-center py-8">
              Waiting for activity...
            </p>
          ) : (
            feed.map((item) => (
              <div
                key={item.id}
                className={`text-xs rounded-lg px-2.5 py-1.5 ${
                  item.type === 'error'
                    ? 'bg-destructive/10 text-destructive'
                    : item.type === 'tool_start'
                    ? 'bg-primary/5'
                    : 'bg-muted/30'
                }`}
              >
                <div className="flex items-center gap-1.5">
                  {item.icon && <span className="text-xs">{item.icon}</span>}
                  <span className="font-medium">{item.label}</span>
                  <span className="ml-auto text-[10px] text-muted-foreground/50">
                    {formatTime(item.timestamp)}
                  </span>
                </div>
                {item.detail && (
                  <p className="text-muted-foreground/70 mt-0.5 truncate">
                    {item.detail}
                  </p>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

function formatTime(ts: number): string {
  const d = new Date(ts)
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

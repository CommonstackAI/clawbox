/**
 * WorkshopView — Top-level workshop tab view.
 * Full-screen layout with 3D canvas, feed overlay, and controls.
 * No PageShell — takes over the entire content area.
 */

import { WorkshopCanvas } from './WorkshopCanvas'
import { WorkshopFeedOverlay } from './WorkshopFeedOverlay'
import { WorkshopControls } from './WorkshopControls'

export function WorkshopView() {
  return (
    <div className="relative h-full w-full overflow-hidden bg-[#0a0a0f]">
      {/* 3D Scene */}
      <WorkshopCanvas className="absolute inset-0" />

      {/* Overlays (pointer-events-none container, children opt-in) */}
      <div className="absolute inset-0 pointer-events-none">
        <WorkshopFeedOverlay />
        <WorkshopControls />
      </div>
    </div>
  )
}

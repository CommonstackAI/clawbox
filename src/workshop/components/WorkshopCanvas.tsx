/**
 * WorkshopCanvas — React host for the Three.js workshop scene.
 * Handles mount, resize, animate, and dispose lifecycle.
 */

import { useEffect, useRef, useCallback } from 'react'
import { WorkshopScene } from '../scene/WorkshopScene'
import { EventBus } from '../events/EventBus'
import { EventBridge } from '../bridge/EventBridge'
import { setActiveBridge } from '../bridge/ClawBoxEventTap'
import { registerAllHandlers } from '../events/handlers'
import { Claude } from '../entities/ClaudeMon'
import { useWorkshopStore } from '../store/workshop'

interface WorkshopCanvasProps {
  className?: string
}

export function WorkshopCanvas({ className }: WorkshopCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const sceneRef = useRef<WorkshopScene | null>(null)
  const busRef = useRef<EventBus | null>(null)
  const bridgeRef = useRef<EventBridge | null>(null)
  const claudeRef = useRef<Claude | null>(null)

  const setupScene = useCallback(() => {
    const container = containerRef.current
    if (!container) return

    // Create event bus and scene
    const bus = new EventBus()
    busRef.current = bus

    const scene = new WorkshopScene(container, bus)
    sceneRef.current = scene

    // Register event handlers
    registerAllHandlers(bus)

    // Create a default zone for the main agent
    scene.createZone('clawbox-main')

    // Create the Claude character
    const claude = new Claude(scene, { startStation: 'center' })
    claudeRef.current = claude

    // Create event bridge with context
    const bridge = new EventBridge(bus, {
      scene,
      session: {
        id: 'clawbox-main',
        color: 0x4ac8e8,
        claude,
        subagents: null,
        zone: scene.zones.get('clawbox-main') ?? null,
        stats: {
          toolsUsed: 0,
          filesTouched: new Set(),
          activeSubagents: 0,
        },
      },
      soundEnabled: false,
    })
    bridgeRef.current = bridge

    // Register bridge as active tap
    setActiveBridge(bridge)

    // Mark scene as ready
    useWorkshopStore.getState().setSceneReady(true)
  }, [])

  useEffect(() => {
    setupScene()

    return () => {
      // Cleanup
      setActiveBridge(null)
      useWorkshopStore.getState().setSceneReady(false)

      if (claudeRef.current) {
        claudeRef.current.dispose()
        claudeRef.current = null
      }

      if (bridgeRef.current) {
        bridgeRef.current.dispose()
        bridgeRef.current = null
      }

      if (busRef.current) {
        busRef.current.clear()
        busRef.current = null
      }

      if (sceneRef.current) {
        sceneRef.current.dispose()
        sceneRef.current = null
      }
    }
  }, [setupScene])

  return (
    <div
      ref={containerRef}
      className={className}
      style={{ width: '100%', height: '100%' }}
    />
  )
}

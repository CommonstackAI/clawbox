/**
 * SubagentManager — Vendored from Vibecraft2. Manages subagent visualizations.
 */

import * as THREE from 'three'
import { Claude, type ClaudeOptions } from './ClaudeMon'

export interface Subagent {
  id: string
  toolUseId: string
  claude: Claude
  spawnTime: number
  description?: string
}

const TINT_LEVELS = [0.35, 0.5, 0.65, 0.8]

function lightenColor(baseHex: number, amount: number): number {
  const base = new THREE.Color(baseHex)
  const white = new THREE.Color(0xffffff)
  base.lerp(white, amount)
  return base.getHex()
}

interface SceneHost {
  scene: THREE.Scene
  stations: Map<string, { position: THREE.Vector3 }>
  onRender(cb: (delta: number) => void): void
  offRender(cb: (delta: number) => void): void
}

export class SubagentManager {
  private host: SceneHost
  private subagents: Map<string, Subagent> = new Map()
  private spawnIndex = 0
  private parentColor: number

  constructor(host: SceneHost, parentColor?: number) {
    this.host = host
    this.parentColor = parentColor ?? 0x4ac8e8
  }

  setParentColor(color: number): void {
    this.parentColor = color
  }

  spawn(toolUseId: string, description?: string): Subagent {
    if (this.subagents.has(toolUseId)) {
      return this.subagents.get(toolUseId)!
    }

    const tint = TINT_LEVELS[this.spawnIndex % TINT_LEVELS.length]
    const color = lightenColor(this.parentColor, tint)
    this.spawnIndex++

    const options: ClaudeOptions = {
      scale: 0.6,
      color,
      statusColor: color,
      startStation: 'portal',
    }

    const claude = new Claude(this.host as any, options)
    claude.setState('thinking')

    const offset = this.subagents.size * 0.5
    const angle = this.subagents.size * Math.PI * 0.4
    claude.mesh.position.x += Math.sin(angle) * offset
    claude.mesh.position.z += Math.cos(angle) * offset

    const subagent: Subagent = {
      id: claude.id,
      toolUseId,
      claude,
      spawnTime: Date.now(),
      description,
    }

    this.subagents.set(toolUseId, subagent)
    return subagent
  }

  remove(toolUseId: string): void {
    const subagent = this.subagents.get(toolUseId)
    if (subagent) {
      subagent.claude.dispose()
      this.subagents.delete(toolUseId)
    }
  }

  get(toolUseId: string): Subagent | undefined {
    return this.subagents.get(toolUseId)
  }

  getAll(): Subagent[] {
    return Array.from(this.subagents.values())
  }

  get count(): number {
    return this.subagents.size
  }

  dispose(): void {
    for (const subagent of this.subagents.values()) {
      subagent.claude.dispose()
    }
    this.subagents.clear()
  }
}

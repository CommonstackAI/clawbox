/**
 * ICharacter — Vendored from Vibecraft2. Character interface for workshop entities.
 */

import * as THREE from 'three'
import type { StationType } from '../types'

export type CharacterState = 'idle' | 'walking' | 'working' | 'thinking'

export interface CharacterOptions {
  scale?: number
  color?: number
  statusColor?: number
  startStation?: StationType
}

export interface ICharacter {
  readonly mesh: THREE.Group
  state: CharacterState
  currentStation: StationType
  readonly id: string
  moveTo(station: StationType): void
  moveToPosition(position: THREE.Vector3, station: StationType): void
  setState(state: CharacterState): void
  dispose(): void
}

export type CharacterModel = 'claudemon'
export const DEFAULT_CHARACTER_MODEL: CharacterModel = 'claudemon'

/**
 * SpawnBeam - Glowing particle trail arcing between zones
 *
 * Used when the Architect spawns a sub-agent: a stream of particles
 * travels along a quadratic bezier arc from the portal station to the
 * new sub-agent zone center.
 */

import * as THREE from 'three'

// ============================================================================
// Types
// ============================================================================

interface ActiveBeam {
  points: THREE.Points
  geometry: THREE.BufferGeometry
  /** Per-particle progress along the arc (0→1), staggered */
  particleProgress: Float32Array
  /** Bezier control points */
  p0: THREE.Vector3
  p1: THREE.Vector3  // elevated midpoint
  p2: THREE.Vector3
  /** Overall beam age in seconds */
  age: number
  color: THREE.Color
}

// ============================================================================
// Constants
// ============================================================================

const PARTICLE_COUNT = 15
const BEAM_DURATION = 1.2        // total seconds
const TRAVEL_END = 0.7           // progress at which lead particle arrives
const FADE_START = 0.85          // progress at which fade begins
const ARC_HEIGHT = 4             // how high the midpoint control point rises
const PARTICLE_SIZE = 0.25
const SCATTER_RADIUS = 0.3       // scatter at arrival

// ============================================================================
// SpawnBeamManager
// ============================================================================

export class SpawnBeamManager {
  private scene: THREE.Scene
  private beams: ActiveBeam[] = []

  constructor(scene: THREE.Scene) {
    this.scene = scene
  }

  /**
   * Launch a beam from one world position to another.
   * @param from  Source position (portal station)
   * @param to    Target position (zone center)
   * @param color Beam color (hex number, e.g. 0x60a5fa)
   */
  launch(from: THREE.Vector3, to: THREE.Vector3, color: number): void {
    const geometry = new THREE.BufferGeometry()
    const positions = new Float32Array(PARTICLE_COUNT * 3)
    const alphas = new Float32Array(PARTICLE_COUNT)
    const sizes = new Float32Array(PARTICLE_COUNT)

    // All particles start at the source
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      positions[i * 3] = from.x
      positions[i * 3 + 1] = from.y
      positions[i * 3 + 2] = from.z
      alphas[i] = 0
      sizes[i] = PARTICLE_SIZE
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geometry.setAttribute('alpha', new THREE.BufferAttribute(alphas, 1))
    geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1))

    const material = new THREE.PointsMaterial({
      color,
      size: PARTICLE_SIZE,
      transparent: true,
      opacity: 1,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,
    })

    const points = new THREE.Points(geometry, material)
    this.scene.add(points)

    // Quadratic bezier: midpoint elevated
    const mid = new THREE.Vector3().lerpVectors(from, to, 0.5)
    mid.y += ARC_HEIGHT

    // Stagger each particle so they form a trail
    const particleProgress = new Float32Array(PARTICLE_COUNT)
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      // Stagger: particle 0 leads, last particle trails
      particleProgress[i] = -(i / PARTICLE_COUNT) * TRAVEL_END
    }

    this.beams.push({
      points,
      geometry,
      particleProgress,
      p0: from.clone(),
      p1: mid,
      p2: to.clone(),
      age: 0,
      color: new THREE.Color(color),
    })
  }

  /**
   * Advance all active beams. Called each frame from the render loop.
   */
  update(delta: number): void {
    const toRemove: number[] = []

    for (let b = 0; b < this.beams.length; b++) {
      const beam = this.beams[b]
      beam.age += delta

      const overallProgress = beam.age / BEAM_DURATION
      if (overallProgress >= 1) {
        toRemove.push(b)
        continue
      }

      const pos = beam.geometry.getAttribute('position') as THREE.BufferAttribute
      const material = beam.points.material as THREE.PointsMaterial

      // Global fade during the fade phase
      if (overallProgress >= FADE_START) {
        const fadeProg = (overallProgress - FADE_START) / (1 - FADE_START)
        material.opacity = 1 - fadeProg
      }

      const tmp = new THREE.Vector3()

      for (let i = 0; i < PARTICLE_COUNT; i++) {
        // Advance this particle's progress along the arc
        beam.particleProgress[i] += delta / (BEAM_DURATION * TRAVEL_END)

        const t = Math.max(0, Math.min(1, beam.particleProgress[i]))

        // Quadratic bezier: B(t) = (1-t)²P0 + 2(1-t)tP1 + t²P2
        const omt = 1 - t
        tmp.set(
          omt * omt * beam.p0.x + 2 * omt * t * beam.p1.x + t * t * beam.p2.x,
          omt * omt * beam.p0.y + 2 * omt * t * beam.p1.y + t * t * beam.p2.y,
          omt * omt * beam.p0.z + 2 * omt * t * beam.p1.z + t * t * beam.p2.z,
        )

        // Scatter slightly at arrival
        if (t >= 0.95) {
          const scatter = (t - 0.95) / 0.05 * SCATTER_RADIUS
          tmp.x += (Math.random() - 0.5) * scatter
          tmp.y += (Math.random() - 0.5) * scatter
          tmp.z += (Math.random() - 0.5) * scatter
        }

        pos.setXYZ(i, tmp.x, tmp.y, tmp.z)
      }

      pos.needsUpdate = true
    }

    // Remove finished beams (iterate in reverse to keep indices valid)
    for (let i = toRemove.length - 1; i >= 0; i--) {
      const beam = this.beams[toRemove[i]]
      this.scene.remove(beam.points)
      beam.geometry.dispose()
      ;(beam.points.material as THREE.PointsMaterial).dispose()
      this.beams.splice(toRemove[i], 1)
    }
  }

  /** Clean up all active beams */
  dispose(): void {
    for (const beam of this.beams) {
      this.scene.remove(beam.points)
      beam.geometry.dispose()
      ;(beam.points.material as THREE.PointsMaterial).dispose()
    }
    this.beams = []
  }
}

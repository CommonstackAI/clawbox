/**
 * WorkshopScene — Simplified 3D workshop environment for ClawBox
 *
 * Vendored and adapted from Vibecraft2's WorkshopScene.ts.
 * Removed: audio, drawMode, text tiles, hex painting, permission modals,
 * context menus, pending zone spinners, git labels, multiple camera animation
 * targets, FPS counter.
 * Kept: full visual quality, hex grid, stations, particles, camera,
 * zone lifecycle, click pulses, notifications, panels, spawn beams.
 */

import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import type { StationType } from '../types'
import { HexGrid } from '../utils/HexGrid'
import { ZoneNotifications, type NotificationStyle } from './ZoneNotifications'
import { SpawnBeamManager } from './SpawnBeam'
import { StationPanels } from './StationPanels'
import {
  addBookshelfDetails,
  addTerminalDetails,
  addAntennaDetails,
  addPortalDetails,
  addScannerDetails,
  addDeskDetails,
  addWorkbenchDetails,
  addTaskboardDetails,
} from './stations'

// ============================================================================
// Types
// ============================================================================

export interface Station {
  type: StationType
  position: THREE.Vector3       // World position (updated when zone elevation changes)
  localPosition: THREE.Vector3  // Position relative to zone
  mesh: THREE.Group
  label: string
  contextSprite?: THREE.Sprite
}

export type AttentionReason = 'question' | 'finished' | 'error' | null

export interface Zone {
  id: string
  group: THREE.Group
  stations: Map<StationType, Station>
  platform: THREE.Mesh
  ring: THREE.Mesh
  floor: THREE.Mesh
  color: number
  position: THREE.Vector3
  label?: THREE.Sprite
  pulseIntensity: number
  attentionReason: AttentionReason
  attentionTime: number
  particles: THREE.Points
  particleVelocities: Float32Array
  status: 'idle' | 'working' | 'waiting' | 'attention' | 'offline'
  animationState?: 'entering' | 'exiting'
  animationProgress?: number
  elevation: number
  edgeLines?: THREE.LineSegments
  sideMesh?: THREE.Mesh
}

export type CameraMode = 'focused' | 'overview'

// Zone colors — ice/cyan theme
export const ZONE_COLORS = [
  0x4ac8e8, // Cyan (primary)
  0x60a5fa, // Blue
  0x22d3d8, // Teal
  0x4ade80, // Green
  0xa78bfa, // Purple
  0xfbbf24, // Orange
  0xf472b6, // Pink
  0xa3e635, // Lime
]

// ============================================================================
// EventBus interface (optional dependency injection)
// ============================================================================

export interface EventBus {
  emit(event: string, ...args: unknown[]): void
  on(event: string, handler: (...args: unknown[]) => void): void
  off(event: string, handler: (...args: unknown[]) => void): void
}

// ============================================================================
// WorkshopScene
// ============================================================================

export class WorkshopScene {
  public scene: THREE.Scene
  public camera: THREE.PerspectiveCamera
  public renderer: THREE.WebGLRenderer
  public controls: OrbitControls

  // Multi-zone support
  public zones: Map<string, Zone> = new Map()
  public hexGrid: HexGrid
  private zoneColorIndex = 0

  // Camera modes
  public cameraMode: CameraMode = 'focused'
  public focusedZoneId: string | null = null
  private onCameraModeChange: ((mode: CameraMode) => void) | null = null
  private onZoneElevationChange: ((sessionId: string, elevation: number) => void) | null = null

  // Camera animation
  private cameraTargetPos = new THREE.Vector3()
  private cameraTargetLookAt = new THREE.Vector3()
  private cameraAnimating = false
  private readonly cameraLerpSpeed = 8

  // Legacy single-zone compat (points to first zone)
  public stations: Map<StationType, Station> = new Map()

  private container: HTMLElement
  private eventBus: EventBus | null
  private animationId: number | null = null
  private onRenderCallbacks: Array<(delta: number) => void> = []
  private clock = new THREE.Clock()

  // Click pulse effects
  private clickPulses: Array<{
    mesh: THREE.Mesh | THREE.Line
    age: number
    maxAge: number
    type?: 'ring' | 'hex' | 'ripple'
    delay?: number
    startOpacity?: number
    baseOpacity?: number
    highlightColor?: THREE.Color
    baseColor?: THREE.Color
  }> = []

  // Station glow pulses
  private stationPulses: Array<{
    ring: THREE.Mesh
    age: number
    maxAge: number
    baseOpacity: number
    peakOpacity: number
  }> = []

  // Zone notification system
  public zoneNotifications: ZoneNotifications

  // Station info panels
  public stationPanels: StationPanels

  // Spawn beam effects
  public spawnBeams: SpawnBeamManager

  // Ambient floating particles
  private ambientParticles: THREE.Points | null = null
  private ambientParticleData: Array<{
    baseY: number
    phase: number
    speed: number
    radius: number
    angle: number
  }> = []

  // Time accumulator for animations
  private time = 0

  // World hex grid overlay
  private worldHexGrid: THREE.Group | THREE.LineSegments | null = null

  // Hover highlight
  private hoverHighlight: THREE.Line | null = null
  private hoverRaycaster = new THREE.Raycaster()
  private hoverMouse = new THREE.Vector2()
  private lastHoveredHex: { q: number; r: number } | null = null

  // World grid size (number of hex rings from center)
  private gridRange = 20

  // World floor for click detection
  public worldFloor: THREE.Mesh | null = null

  // Floating notifications (legacy)
  private notifications: Array<{
    sprite: THREE.Sprite
    startY: number
    age: number
    maxAge: number
  }> = []

  constructor(container: HTMLElement, eventBus?: EventBus) {
    this.container = container
    this.eventBus = eventBus ?? null

    // Scene — dark blue-black like ice cave
    this.scene = new THREE.Scene()
    this.scene.background = new THREE.Color(0x080c14)

    // Hex grid for zone placement
    this.hexGrid = new HexGrid(10, 1.0)

    // Camera
    this.camera = new THREE.PerspectiveCamera(
      50,
      container.clientWidth / container.clientHeight,
      0.1,
      500,
    )
    const isMobile = window.innerWidth <= 640
    this.camera.position.set(isMobile ? 40 : 8, isMobile ? 32 : 6, isMobile ? 40 : 8)
    this.camera.lookAt(0, 0, 0)

    // Renderer
    this.renderer = new THREE.WebGLRenderer({
      antialias: false,
      alpha: false,
      powerPreference: 'high-performance',
    })
    this.renderer.setSize(container.clientWidth, container.clientHeight)
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5))
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.BasicShadowMap
    container.appendChild(this.renderer.domElement)

    // Controls
    this.controls = new OrbitControls(this.camera, this.renderer.domElement)
    this.controls.enableDamping = true
    this.controls.dampingFactor = 0.05
    this.controls.maxPolarAngle = Math.PI / 2.1
    this.controls.minDistance = 5
    this.controls.maxDistance = 150
    this.controls.target.set(0, 0, 0)

    // Stop camera animation when user manually drags
    this.controls.addEventListener('start', () => {
      this.cameraAnimating = false
    })

    // Build the world
    this.setupLighting()
    this.createWorldFloor()
    this.createWorldHexGrid()
    this.createAmbientParticles()
    this.setupHoverHighlight()

    // Subsystems
    this.zoneNotifications = new ZoneNotifications(this.scene)
    this.stationPanels = new StationPanels(this.scene)
    this.spawnBeams = new SpawnBeamManager(this.scene)

    // Resize
    window.addEventListener('resize', this.handleResize)
  }

  // ==========================================================================
  // Lighting
  // ==========================================================================

  private setupLighting(): void {
    // Ambient
    const ambient = new THREE.AmbientLight(0x606080, 0.8)
    this.scene.add(ambient)

    // Directional (sun)
    const sun = new THREE.DirectionalLight(0xfff5e6, 1.2)
    sun.position.set(5, 10, 5)
    sun.castShadow = true
    sun.shadow.mapSize.width = 512
    sun.shadow.mapSize.height = 512
    sun.shadow.camera.near = 1
    sun.shadow.camera.far = 20
    sun.shadow.camera.left = -8
    sun.shadow.camera.right = 8
    sun.shadow.camera.top = 8
    sun.shadow.camera.bottom = -8
    this.scene.add(sun)

    // Hemisphere fill
    const hemi = new THREE.HemisphereLight(0xfff5e6, 0x404060, 0.4)
    this.scene.add(hemi)
  }

  // ==========================================================================
  // World floor (invisible, for raycasting)
  // ==========================================================================

  private createWorldFloor(): void {
    const geo = new THREE.PlaneGeometry(500, 500)
    const mat = new THREE.MeshBasicMaterial({ visible: false })
    const floor = new THREE.Mesh(geo, mat)
    floor.rotation.x = -Math.PI / 2
    floor.position.y = -0.05
    floor.name = 'worldFloor'
    this.scene.add(floor)
    this.worldFloor = floor
  }

  // ==========================================================================
  // World hex grid overlay (single merged LineSegments for performance)
  // ==========================================================================

  private createWorldHexGrid(): void {
    const hexRadius = this.hexGrid.hexRadius
    const gridRange = this.gridRange
    const vertices: number[] = []

    // Precompute corner angles (pointy-top)
    const angles: number[] = []
    for (let i = 0; i < 6; i++) {
      angles.push((Math.PI / 3) * i - Math.PI / 2)
    }

    for (let q = -gridRange; q <= gridRange; q++) {
      for (let r = -gridRange; r <= gridRange; r++) {
        if (Math.abs(q) + Math.abs(r) + Math.abs(-q - r) > gridRange * 2) continue
        const { x, z } = this.hexGrid.axialToCartesian({ q, r })

        for (let i = 0; i < 6; i++) {
          const sa = angles[i]
          const ea = angles[(i + 1) % 6]
          vertices.push(x + hexRadius * Math.cos(sa), 0, z + hexRadius * Math.sin(sa))
          vertices.push(x + hexRadius * Math.cos(ea), 0, z + hexRadius * Math.sin(ea))
        }
      }
    }

    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3))

    const mat = new THREE.LineBasicMaterial({
      color: 0x4ac8e8,
      transparent: true,
      opacity: 0.35,
    })

    const lines = new THREE.LineSegments(geo, mat)
    lines.position.y = 0.01
    this.scene.add(lines)
    this.worldHexGrid = lines
  }

  // ==========================================================================
  // Hover highlight
  // ==========================================================================

  private setupHoverHighlight(): void {
    const hexRadius = this.hexGrid.hexRadius
    const pts: THREE.Vector3[] = []
    for (let i = 0; i <= 6; i++) {
      const angle = (Math.PI / 3) * i - Math.PI / 2
      pts.push(new THREE.Vector3(hexRadius * Math.cos(angle), 0.03, hexRadius * Math.sin(angle)))
    }

    const geo = new THREE.BufferGeometry().setFromPoints(pts)
    const mat = new THREE.LineBasicMaterial({ color: 0x8eeeff, transparent: true, opacity: 0.7 })

    this.hoverHighlight = new THREE.Line(geo, mat)
    this.hoverHighlight.visible = false
    this.scene.add(this.hoverHighlight)

    this.renderer.domElement.addEventListener('mousemove', this.handleHover)
    this.renderer.domElement.addEventListener('mouseleave', this.handleHoverLeave)
  }

  private handleHover = (event: MouseEvent): void => {
    if (!this.hoverHighlight || !this.worldFloor) return

    const rect = this.renderer.domElement.getBoundingClientRect()
    this.hoverMouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
    this.hoverMouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1

    this.hoverRaycaster.setFromCamera(this.hoverMouse, this.camera)
    const intersects = this.hoverRaycaster.intersectObject(this.worldFloor)

    if (intersects.length > 0) {
      const point = intersects[0].point
      const hexCoord = this.hexGrid.cartesianToHex(point.x, point.z)
      const hexCenter = this.hexGrid.axialToCartesian(hexCoord)

      const isNewHex =
        !this.lastHoveredHex ||
        this.lastHoveredHex.q !== hexCoord.q ||
        this.lastHoveredHex.r !== hexCoord.r

      if (isNewHex) {
        this.lastHoveredHex = { q: hexCoord.q, r: hexCoord.r }
      }

      this.hoverHighlight.position.set(hexCenter.x, 0, hexCenter.z)
      this.hoverHighlight.visible = true
    } else {
      this.hoverHighlight.visible = false
      this.lastHoveredHex = null
    }
  }

  private handleHoverLeave = (): void => {
    if (this.hoverHighlight) this.hoverHighlight.visible = false
    this.lastHoveredHex = null
  }

  // ==========================================================================
  // Ambient particles
  // ==========================================================================

  private createAmbientParticles(): void {
    const count = 60
    const positions = new Float32Array(count * 3)

    for (let i = 0; i < count; i++) {
      const radius = 2 + Math.random() * 15
      const angle = Math.random() * Math.PI * 2
      const baseY = 6 + Math.random() * 12

      positions[i * 3] = Math.cos(angle) * radius
      positions[i * 3 + 1] = baseY
      positions[i * 3 + 2] = Math.sin(angle) * radius

      this.ambientParticleData.push({
        baseY,
        phase: Math.random() * Math.PI * 2,
        speed: 0.3 + Math.random() * 0.5,
        radius,
        angle,
      })
    }

    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))

    const mat = new THREE.PointsMaterial({
      color: 0x4ac8e8,
      size: 0.12,
      transparent: true,
      opacity: 0.4,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })

    this.ambientParticles = new THREE.Points(geo, mat)
    this.scene.add(this.ambientParticles)
  }

  private updateAmbientParticles(delta: number): void {
    if (!this.ambientParticles) return

    const positions = this.ambientParticles.geometry.attributes.position.array as Float32Array

    for (let i = 0; i < this.ambientParticleData.length; i++) {
      const d = this.ambientParticleData[i]
      d.angle += delta * 0.02 * d.speed
      const yOff = Math.sin(this.time * d.speed + d.phase) * 1.5

      positions[i * 3] = Math.cos(d.angle) * d.radius
      positions[i * 3 + 1] = d.baseY + yOff
      positions[i * 3 + 2] = Math.sin(d.angle) * d.radius
    }

    this.ambientParticles.geometry.attributes.position.needsUpdate = true
  }

  // ==========================================================================
  // Zone creation
  // ==========================================================================

  createZone(
    sessionId: string,
    options?: { color?: number; hintPosition?: { x: number; z: number } },
  ): Zone {
    const existing = this.zones.get(sessionId)
    if (existing) return existing

    // Hex placement
    const hexCoord = options?.hintPosition
      ? this.hexGrid.findNearestFree(this.hexGrid.cartesianToHex(options.hintPosition.x, options.hintPosition.z))
      : this.hexGrid.getNextInSpiral()

    this.hexGrid.occupy(hexCoord, sessionId)

    const zoneColor = options?.color ?? ZONE_COLORS[this.zoneColorIndex++ % ZONE_COLORS.length]
    const { x, z } = this.hexGrid.axialToCartesian(hexCoord)
    const position = new THREE.Vector3(x, 0, z)

    // Group
    const group = new THREE.Group()
    group.position.copy(position)
    this.scene.add(group)
    group.updateMatrixWorld(true)

    // Platform, ring, floor
    const { platform, ring, floor } = this.createZonePlatform(group, zoneColor)

    // Stations
    const stations = this.createZoneStations(group, zoneColor)

    // Floating label
    const label = this.createZoneLabel(sessionId, zoneColor)
    label.position.set(0, 4, 0)
    group.add(label)

    // Particle system
    const { particles, velocities } = this.createParticleSystem(zoneColor)
    group.add(particles)

    // Edge lines (hidden until elevated)
    const edgeLines = this.createZoneEdgeLines(zoneColor)
    edgeLines.visible = false
    this.scene.add(edgeLines)
    edgeLines.position.copy(position)

    // Side mesh (hidden until elevated)
    const sideMesh = this.createZoneSideMesh(zoneColor)
    sideMesh.visible = false
    this.scene.add(sideMesh)
    sideMesh.position.copy(position)

    const zone: Zone = {
      id: sessionId,
      group,
      stations,
      platform,
      ring,
      floor,
      color: zoneColor,
      position,
      label,
      pulseIntensity: 0,
      attentionReason: null,
      attentionTime: 0,
      particles,
      particleVelocities: velocities,
      status: 'idle',
      animationState: 'entering',
      animationProgress: 0,
      elevation: 0,
      edgeLines,
      sideMesh,
    }

    // Start at scale 0 for enter animation
    group.scale.setScalar(0.01)
    for (const station of stations.values()) station.mesh.visible = false
    if (label) label.visible = false
    particles.visible = false

    this.zones.set(sessionId, zone)

    // Register with subsystems
    this.zoneNotifications.registerZone(sessionId, position)
    this.stationPanels.createPanelsForZone(sessionId, position, zoneColor)

    // Legacy compat: first zone's stations become default
    if (this.zones.size === 1) {
      this.stations = stations
      this.focusZone(sessionId)
    }

    return zone
  }

  getZone(sessionId: string): Zone | undefined {
    return this.zones.get(sessionId)
  }

  getZoneWorldPosition(sessionId: string): { x: number; z: number } | null {
    const zone = this.zones.get(sessionId)
    if (!zone) return null
    return { x: zone.position.x, z: zone.position.z }
  }

  getZoneHexPosition(sessionId: string): { q: number; r: number } | null {
    const zone = this.zones.get(sessionId)
    if (!zone) return null
    return this.hexGrid.cartesianToHex(zone.position.x, zone.position.z)
  }

  getZoneByIndex(index: number): Zone | undefined {
    return Array.from(this.zones.values())[index]
  }

  getZoneAtHex(hex: { q: number; r: number }): Zone | null {
    const sessionId = this.hexGrid.getOccupant(hex)
    if (!sessionId) return null
    return this.zones.get(sessionId) ?? null
  }

  // ==========================================================================
  // Zone deletion
  // ==========================================================================

  deleteZone(sessionId: string): boolean {
    const zone = this.zones.get(sessionId)
    if (!zone) return false
    if (zone.animationState === 'exiting') return true

    zone.animationState = 'exiting'
    zone.animationProgress = 0
    this.hexGrid.release(sessionId)
    return true
  }

  private finalizeZoneDelete(sessionId: string): void {
    const zone = this.zones.get(sessionId)
    if (!zone) return

    this.zoneNotifications.unregisterZone(sessionId)
    this.stationPanels.removePanelsForZone(sessionId)

    this.scene.remove(zone.group)
    zone.group.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry?.dispose()
        if (Array.isArray(obj.material)) {
          obj.material.forEach((m) => m.dispose())
        } else if (obj.material) {
          obj.material.dispose()
        }
      } else if (obj instanceof THREE.Sprite) {
        obj.material.map?.dispose()
        obj.material.dispose()
      } else if (obj instanceof THREE.Points) {
        obj.geometry?.dispose()
        ;(obj.material as THREE.PointsMaterial)?.dispose()
      }
    })

    if (zone.label) {
      const mat = zone.label.material as THREE.SpriteMaterial
      mat.map?.dispose()
      mat.dispose()
    }

    for (const station of zone.stations.values()) {
      if (station.contextSprite) {
        station.contextSprite.material.map?.dispose()
        station.contextSprite.material.dispose()
      }
    }

    if (zone.edgeLines) {
      this.scene.remove(zone.edgeLines)
      zone.edgeLines.geometry.dispose()
      ;(zone.edgeLines.material as THREE.LineBasicMaterial).dispose()
    }

    if (zone.sideMesh) {
      this.scene.remove(zone.sideMesh)
      zone.sideMesh.geometry.dispose()
      ;(zone.sideMesh.material as THREE.MeshStandardMaterial).dispose()
    }

    this.zones.delete(sessionId)

    if (this.focusedZoneId === sessionId) {
      this.focusedZoneId = null
    }
  }

  // ==========================================================================
  // Camera
  // ==========================================================================

  focusZone(sessionId: string, animate = true): void {
    const zone = this.zones.get(sessionId)
    if (!zone) return

    this.focusedZoneId = sessionId
    this.cameraMode = 'focused'

    const target = zone.position.clone()
    target.y += zone.elevation

    const isMobile = window.innerWidth <= 640
    const offset = isMobile ? new THREE.Vector3(40, 32, 40) : new THREE.Vector3(8, 6, 8)
    const cameraPos = target.clone().add(offset)

    if (animate) {
      this.animateCameraTo(cameraPos, target)
    } else {
      this.controls.target.copy(target)
      this.camera.position.copy(cameraPos)
    }

    this.notifyCameraModeChange()
  }

  setOverviewMode(): void {
    this.cameraMode = 'overview'
    this.focusedZoneId = null

    if (this.zones.size === 0) return

    let minX = Infinity,
      maxX = -Infinity,
      minZ = Infinity,
      maxZ = -Infinity

    for (const zone of this.zones.values()) {
      minX = Math.min(minX, zone.position.x - 10)
      maxX = Math.max(maxX, zone.position.x + 10)
      minZ = Math.min(minZ, zone.position.z - 10)
      maxZ = Math.max(maxZ, zone.position.z + 10)
    }

    const cx = (minX + maxX) / 2
    const cz = (minZ + maxZ) / 2
    const extent = Math.max(maxX - minX, maxZ - minZ, 30)

    const isMobile = window.innerWidth <= 640
    const hMul = isMobile ? 1.0 : 0.8
    const height = extent * hMul
    const lookAt = new THREE.Vector3(cx, 0, cz)
    const pos = new THREE.Vector3(cx, height, cz + extent * (isMobile ? 0.2 : 0.3))

    this.animateCameraTo(pos, lookAt)
    this.notifyCameraModeChange()
  }

  private animateCameraTo(position: THREE.Vector3, lookAt: THREE.Vector3): void {
    this.cameraTargetPos.copy(position)
    this.cameraTargetLookAt.copy(lookAt)
    this.cameraAnimating = true
  }

  onCameraMode(callback: (mode: CameraMode) => void): void {
    this.onCameraModeChange = callback
  }

  private notifyCameraModeChange(): void {
    this.onCameraModeChange?.(this.cameraMode)
  }

  // ==========================================================================
  // Zone elevation
  // ==========================================================================

  onZoneElevation(callback: (sessionId: string, elevation: number) => void): void {
    this.onZoneElevationChange = callback
  }

  private notifyZoneElevationChange(sessionId: string, elevation: number): void {
    this.updateStationPositions(sessionId)
    this.zoneNotifications.updateZoneElevation(sessionId, elevation)
    this.onZoneElevationChange?.(sessionId, elevation)
  }

  private updateStationPositions(sessionId: string): void {
    const zone = this.zones.get(sessionId)
    if (!zone) return

    const origScale = zone.group.scale.clone()
    zone.group.scale.setScalar(1)
    zone.group.updateMatrixWorld(true)

    for (const station of zone.stations.values()) {
      const worldPos = station.localPosition.clone()
      zone.group.localToWorld(worldPos)
      station.position.copy(worldPos)
    }

    zone.group.scale.copy(origScale)
    zone.group.updateMatrixWorld(true)
  }

  setZoneElevation(sessionId: string, elevation: number): void {
    const zone = this.zones.get(sessionId)
    if (!zone) return

    zone.elevation = elevation
    zone.group.position.y = elevation
    this.updateZoneEdgeLines(zone)
    this.updateZoneSideMesh(zone)
    this.notifyZoneElevationChange(sessionId, elevation)
  }

  // ==========================================================================
  // Zone platform / floor
  // ==========================================================================

  private createHexagonShape(radius: number): THREE.Shape {
    const shape = new THREE.Shape()
    for (let i = 0; i < 6; i++) {
      const angle = (Math.PI / 3) * i - Math.PI / 2
      const x = radius * Math.cos(angle)
      const y = radius * Math.sin(angle)
      if (i === 0) shape.moveTo(x, y)
      else shape.lineTo(x, y)
    }
    shape.closePath()
    return shape
  }

  private createZonePlatform(
    group: THREE.Group,
    color: number,
  ): { platform: THREE.Mesh; ring: THREE.Mesh; floor: THREE.Mesh } {
    const hexRadius = 10

    // Floor
    const floorShape = this.createHexagonShape(hexRadius)
    const floorGeo = new THREE.ShapeGeometry(floorShape)
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x1a2535,
      roughness: 0.7,
      metalness: 0.15,
      emissive: color,
      emissiveIntensity: 0.02,
    })
    const floor = new THREE.Mesh(floorGeo, floorMat)
    floor.rotation.x = -Math.PI / 2
    floor.receiveShadow = true
    group.add(floor)

    // Ring
    const outerShape = this.createHexagonShape(hexRadius)
    const innerShape = this.createHexagonShape(hexRadius - 0.5)
    outerShape.holes.push(innerShape as unknown as THREE.Path)
    const ringGeo = new THREE.ShapeGeometry(outerShape)
    const ringMat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.5,
      side: THREE.DoubleSide,
    })
    const ring = new THREE.Mesh(ringGeo, ringMat)
    ring.rotation.x = -Math.PI / 2
    ring.position.y = 0.02
    group.add(ring)

    // Center platform (pedestal)
    const platformGeo = new THREE.CylinderGeometry(1, 1.2, 0.2, 6)
    const platformMat = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.5,
      metalness: 0.3,
      emissive: color,
      emissiveIntensity: 0.1,
    })
    const platform = new THREE.Mesh(platformGeo, platformMat)
    platform.position.y = 0.1
    platform.rotation.y = Math.PI / 6
    platform.receiveShadow = true
    platform.castShadow = true
    group.add(platform)

    return { platform, ring, floor }
  }

  // ==========================================================================
  // Zone edge lines + side mesh (shown when elevated)
  // ==========================================================================

  private createZoneEdgeLines(color: number): THREE.LineSegments {
    const hexRadius = 10
    const positions: number[] = []

    for (let i = 0; i < 6; i++) {
      const angle = (Math.PI / 3) * i - Math.PI / 2
      const x = hexRadius * Math.cos(angle)
      const z = hexRadius * Math.sin(angle)
      positions.push(x, 0, z, x, 1, z)
    }

    for (let i = 0; i < 6; i++) {
      const a1 = (Math.PI / 3) * i - Math.PI / 2
      const a2 = (Math.PI / 3) * ((i + 1) % 6) - Math.PI / 2
      positions.push(
        hexRadius * Math.cos(a1), 1, hexRadius * Math.sin(a1),
        hexRadius * Math.cos(a2), 1, hexRadius * Math.sin(a2),
      )
    }

    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))

    const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.8, linewidth: 2 })
    return new THREE.LineSegments(geo, mat)
  }

  private createZoneSideMesh(color: number): THREE.Mesh {
    const hexRadius = 10
    const vertexCount = 6 * 6
    const positions = new Float32Array(vertexCount * 3)
    const normals = new Float32Array(vertexCount * 3)

    let idx = 0
    for (let i = 0; i < 6; i++) {
      const a1 = (Math.PI / 3) * i - Math.PI / 2
      const a2 = (Math.PI / 3) * ((i + 1) % 6) - Math.PI / 2
      const x1 = hexRadius * Math.cos(a1), z1 = hexRadius * Math.sin(a1)
      const x2 = hexRadius * Math.cos(a2), z2 = hexRadius * Math.sin(a2)
      const midAngle = (a1 + a2) / 2
      const nx = Math.cos(midAngle), nz = Math.sin(midAngle)

      // Triangle 1
      positions[idx * 3] = x1; positions[idx * 3 + 1] = 0; positions[idx * 3 + 2] = z1
      normals[idx * 3] = nx; normals[idx * 3 + 1] = 0; normals[idx * 3 + 2] = nz; idx++
      positions[idx * 3] = x2; positions[idx * 3 + 1] = 0; positions[idx * 3 + 2] = z2
      normals[idx * 3] = nx; normals[idx * 3 + 1] = 0; normals[idx * 3 + 2] = nz; idx++
      positions[idx * 3] = x2; positions[idx * 3 + 1] = 1; positions[idx * 3 + 2] = z2
      normals[idx * 3] = nx; normals[idx * 3 + 1] = 0; normals[idx * 3 + 2] = nz; idx++

      // Triangle 2
      positions[idx * 3] = x1; positions[idx * 3 + 1] = 0; positions[idx * 3 + 2] = z1
      normals[idx * 3] = nx; normals[idx * 3 + 1] = 0; normals[idx * 3 + 2] = nz; idx++
      positions[idx * 3] = x2; positions[idx * 3 + 1] = 1; positions[idx * 3 + 2] = z2
      normals[idx * 3] = nx; normals[idx * 3 + 1] = 0; normals[idx * 3 + 2] = nz; idx++
      positions[idx * 3] = x1; positions[idx * 3 + 1] = 1; positions[idx * 3 + 2] = z1
      normals[idx * 3] = nx; normals[idx * 3 + 1] = 0; normals[idx * 3 + 2] = nz; idx++
    }

    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3))

    const mat = new THREE.MeshStandardMaterial({
      color,
      transparent: true,
      opacity: 0.7,
      side: THREE.DoubleSide,
    })

    return new THREE.Mesh(geo, mat)
  }

  updateZoneEdgeLines(zone: Zone): void {
    if (!zone.edgeLines) return
    const el = zone.elevation
    if (el <= 0) { zone.edgeLines.visible = false; return }

    zone.edgeLines.visible = true
    const pos = zone.edgeLines.geometry.attributes.position as THREE.BufferAttribute
    const hexRadius = 10
    let idx = 0

    for (let i = 0; i < 6; i++) {
      const angle = (Math.PI / 3) * i - Math.PI / 2
      const x = hexRadius * Math.cos(angle)
      const z = hexRadius * Math.sin(angle)
      pos.setXYZ(idx++, x, 0, z)
      pos.setXYZ(idx++, x, el, z)
    }

    for (let i = 0; i < 6; i++) {
      const a1 = (Math.PI / 3) * i - Math.PI / 2
      const a2 = (Math.PI / 3) * ((i + 1) % 6) - Math.PI / 2
      pos.setXYZ(idx++, hexRadius * Math.cos(a1), el, hexRadius * Math.sin(a1))
      pos.setXYZ(idx++, hexRadius * Math.cos(a2), el, hexRadius * Math.sin(a2))
    }

    pos.needsUpdate = true
  }

  updateZoneSideMesh(zone: Zone): void {
    if (!zone.sideMesh) return
    const el = zone.elevation
    if (el <= 0) { zone.sideMesh.visible = false; return }

    zone.sideMesh.visible = true
    const pos = zone.sideMesh.geometry.attributes.position as THREE.BufferAttribute
    const hexRadius = 10
    let idx = 0

    for (let i = 0; i < 6; i++) {
      const a1 = (Math.PI / 3) * i - Math.PI / 2
      const a2 = (Math.PI / 3) * ((i + 1) % 6) - Math.PI / 2
      const x1 = hexRadius * Math.cos(a1), z1 = hexRadius * Math.sin(a1)
      const x2 = hexRadius * Math.cos(a2), z2 = hexRadius * Math.sin(a2)

      pos.setXYZ(idx++, x1, 0, z1)
      pos.setXYZ(idx++, x2, 0, z2)
      pos.setXYZ(idx++, x2, el, z2)

      pos.setXYZ(idx++, x1, 0, z1)
      pos.setXYZ(idx++, x2, el, z2)
      pos.setXYZ(idx++, x1, el, z1)
    }

    pos.needsUpdate = true
  }

  // ==========================================================================
  // Stations
  // ==========================================================================

  private createZoneStations(group: THREE.Group, zoneColor: number): Map<StationType, Station> {
    const stations = new Map<StationType, Station>()

    const configs: Array<{
      type: StationType
      position: [number, number, number]
      label: string
      color: number
    }> = [
      { type: 'center', position: [0, 0, 0], label: 'Center', color: zoneColor },
      { type: 'bookshelf', position: [0, 0, -4], label: 'Library', color: 0x2a4a5a },
      { type: 'desk', position: [4, 0, 0], label: 'Desk', color: 0x3a4a5a },
      { type: 'workbench', position: [-4, 0, 0], label: 'Workbench', color: 0x3a4a55 },
      { type: 'terminal', position: [0, 0, 4], label: 'Terminal', color: 0x1a2a3a },
      { type: 'scanner', position: [3, 0, -3], label: 'Scanner', color: 0x2a4a6a },
      { type: 'antenna', position: [-3, 0, -3], label: 'Antenna', color: 0x3a5a6a },
      { type: 'portal', position: [-3, 0, 3], label: 'Portal', color: 0x3a4a6a },
      { type: 'taskboard', position: [3, 0, 3], label: 'Task Board', color: 0x3a4a5a },
    ]

    for (const cfg of configs) {
      stations.set(cfg.type, this.createStationInZone(group, cfg))
    }

    return stations
  }

  private createStationInZone(
    zoneGroup: THREE.Group,
    config: { type: StationType; position: [number, number, number]; label: string; color: number },
  ): Station {
    const stationGroup = new THREE.Group()
    const [x, y, z] = config.position

    if (config.type === 'center') {
      stationGroup.position.set(x, y, z)
      zoneGroup.add(stationGroup)

      const localPos = new THREE.Vector3(x, 0.3, z)
      const worldPos = localPos.clone()
      zoneGroup.localToWorld(worldPos)

      return { type: config.type, position: worldPos, localPosition: localPos, mesh: stationGroup, label: config.label }
    }

    // Base/table
    const baseGeo = new THREE.BoxGeometry(1.5, 0.8, 1)
    const baseMat = new THREE.MeshStandardMaterial({ color: config.color, roughness: 0.7, metalness: 0.2 })
    const base = new THREE.Mesh(baseGeo, baseMat)
    base.position.y = 0.4
    base.castShadow = true
    base.receiveShadow = true
    stationGroup.add(base)

    // Station-specific details
    switch (config.type) {
      case 'bookshelf':  addBookshelfDetails(stationGroup);  break
      case 'desk':       addDeskDetails(stationGroup);       break
      case 'workbench':  addWorkbenchDetails(stationGroup);  break
      case 'terminal':   addTerminalDetails(stationGroup);   break
      case 'antenna':    addAntennaDetails(stationGroup);    break
      case 'portal':     addPortalDetails(stationGroup);     break
      case 'scanner':    addScannerDetails(stationGroup);    break
      case 'taskboard':  addTaskboardDetails(stationGroup);  break
    }

    // Station indicator ring
    const ringGeo = new THREE.RingGeometry(0.9, 1, 32)
    const ringMat = new THREE.MeshBasicMaterial({ color: config.color, transparent: true, opacity: 0.3, side: THREE.DoubleSide })
    const ring = new THREE.Mesh(ringGeo, ringMat)
    ring.rotation.x = -Math.PI / 2
    ring.position.y = 0.02
    stationGroup.add(ring)

    stationGroup.position.set(x, y, z)
    zoneGroup.add(stationGroup)

    // Calculate world position for Claude to stand
    const localPos = new THREE.Vector3(x, 0.3, z)
    const toCenter = new THREE.Vector3(-x, 0, -z).normalize()
    localPos.add(toCenter.multiplyScalar(1.2))
    const worldPos = localPos.clone()
    zoneGroup.localToWorld(worldPos)

    return { type: config.type, position: worldPos, localPosition: localPos, mesh: stationGroup, label: config.label }
  }

  // ==========================================================================
  // Zone labels
  // ==========================================================================

  private createZoneLabel(sessionId: string, color: number): THREE.Sprite {
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')!
    canvas.width = 512
    canvas.height = 96

    this.drawLabelText(ctx, canvas.width, canvas.height, color, sessionId.slice(0, 8))

    const texture = new THREE.CanvasTexture(canvas)
    texture.minFilter = THREE.LinearFilter
    texture.magFilter = THREE.LinearFilter

    const mat = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false })
    const sprite = new THREE.Sprite(mat)
    sprite.scale.set(5, 1.2, 1)
    return sprite
  }

  private drawLabelText(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    color: number,
    text: string,
    keybind?: string,
  ): void {
    const colorHex = `#${color.toString(16).padStart(6, '0')}`
    ctx.clearRect(0, 0, width, height)

    ctx.font = '600 36px system-ui, -apple-system, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'

    // Truncate if needed
    let display = text
    const maxW = width - 80
    let tw = ctx.measureText(display).width
    if (tw > maxW) {
      while (tw > maxW && display.length > 3) {
        display = display.slice(0, -1)
        tw = ctx.measureText(display + '\u2026').width
      }
      display += '\u2026'
    }

    const full = keybind ? `${keybind}  ${display}` : display
    const cx = width / 2
    const cy = height / 2

    // Dark backdrop
    ctx.save()
    ctx.shadowColor = 'rgba(0,0,0,0.9)'; ctx.shadowBlur = 12
    ctx.fillStyle = 'rgba(0,0,0,0.8)'
    ctx.fillText(full, cx, cy); ctx.fillText(full, cx, cy)
    ctx.restore()

    // Outer glow
    ctx.save()
    ctx.shadowColor = colorHex; ctx.shadowBlur = 30
    ctx.fillStyle = colorHex; ctx.globalAlpha = 0.3
    ctx.fillText(full, cx, cy); ctx.fillText(full, cx, cy)
    ctx.restore()

    // Middle glow
    ctx.save()
    ctx.shadowColor = colorHex; ctx.shadowBlur = 12
    ctx.fillStyle = colorHex; ctx.globalAlpha = 0.5
    ctx.fillText(full, cx, cy)
    ctx.restore()

    // Inner glow
    ctx.save()
    ctx.shadowColor = colorHex; ctx.shadowBlur = 4
    ctx.fillStyle = colorHex; ctx.globalAlpha = 0.8
    ctx.fillText(full, cx, cy)
    ctx.restore()

    // Crisp white text
    ctx.fillStyle = '#ffffff'
    ctx.fillText(full, cx, cy)
  }

  updateZoneLabel(sessionId: string, newLabel: string, keybind?: string): void {
    const zone = this.zones.get(sessionId)
    if (!zone?.label) return

    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')!
    canvas.width = 512
    canvas.height = 96

    this.drawLabelText(ctx, canvas.width, canvas.height, zone.color, newLabel, keybind)

    const mat = zone.label.material as THREE.SpriteMaterial
    mat.map?.dispose()
    const texture = new THREE.CanvasTexture(canvas)
    texture.minFilter = THREE.LinearFilter
    texture.magFilter = THREE.LinearFilter
    mat.map = texture
    mat.needsUpdate = true
  }

  // ==========================================================================
  // Station context text
  // ==========================================================================

  private createTextSprite(text: string, color = '#ffffff'): THREE.Sprite {
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')!
    canvas.width = 512
    canvas.height = 96
    const maxW = canvas.width - 60

    let fontSize = 28
    const minFontSize = 14
    ctx.font = `600 ${fontSize}px system-ui, -apple-system, sans-serif`
    while (ctx.measureText(text).width > maxW && fontSize > minFontSize) {
      fontSize -= 2
      ctx.font = `600 ${fontSize}px system-ui, -apple-system, sans-serif`
    }

    let display = text
    if (ctx.measureText(text).width > maxW) {
      if (text.includes('/')) {
        const parts = text.split('/')
        display = parts.length >= 2 ? '.../' + parts.slice(-2).join('/') : '.../' + parts.pop()!
      }
      if (ctx.measureText(display).width > maxW) {
        const mc = Math.floor(maxW / (fontSize * 0.6))
        const half = Math.floor((mc - 3) / 2)
        display = text.slice(0, half) + '...' + text.slice(-half)
      }
    }

    const cx = canvas.width / 2
    const cy = canvas.height / 2
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'

    // Dark backdrop
    ctx.save()
    ctx.shadowColor = 'rgba(0,0,0,0.9)'; ctx.shadowBlur = 10
    ctx.fillStyle = 'rgba(0,0,0,0.8)'
    ctx.fillText(display, cx, cy); ctx.fillText(display, cx, cy)
    ctx.restore()

    // Outer glow
    ctx.save()
    ctx.shadowColor = color; ctx.shadowBlur = 20
    ctx.fillStyle = color; ctx.globalAlpha = 0.4
    ctx.fillText(display, cx, cy); ctx.fillText(display, cx, cy)
    ctx.restore()

    // Inner glow
    ctx.save()
    ctx.shadowColor = color; ctx.shadowBlur = 6
    ctx.fillStyle = color; ctx.globalAlpha = 0.7
    ctx.fillText(display, cx, cy)
    ctx.restore()

    // Main text
    ctx.fillStyle = '#ffffff'
    ctx.fillText(display, cx, cy)

    const texture = new THREE.CanvasTexture(canvas)
    texture.minFilter = THREE.LinearFilter
    texture.magFilter = THREE.LinearFilter

    const mat = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false })
    const sprite = new THREE.Sprite(mat)
    sprite.scale.set(4, 0.8, 1)
    return sprite
  }

  setStationContext(stationType: StationType, context: string | null, sessionId?: string): void {
    let stations: Map<StationType, Station>
    if (sessionId) {
      const zone = this.zones.get(sessionId)
      if (!zone) return
      stations = zone.stations
    } else {
      stations = this.stations
    }

    const station = stations.get(stationType)
    if (!station) return

    if (station.contextSprite) {
      station.mesh.remove(station.contextSprite)
      station.contextSprite.material.map?.dispose()
      station.contextSprite.material.dispose()
      station.contextSprite = undefined
    }

    if (context) {
      const c = this.getStationColor(stationType)
      station.contextSprite = this.createTextSprite(context, c)
      station.contextSprite.position.set(0, 2.5, 0)
      station.mesh.add(station.contextSprite)
    }
  }

  clearAllContexts(sessionId?: string): void {
    if (sessionId) {
      const zone = this.zones.get(sessionId)
      if (!zone) return
      for (const [type] of zone.stations) this.setStationContext(type, null, sessionId)
    } else {
      for (const [zoneId, zone] of this.zones) {
        for (const [type] of zone.stations) this.setStationContext(type, null, zoneId)
      }
    }
  }

  private getStationColor(type: StationType): string {
    const colors: Record<StationType, string> = {
      center: '#4ac8e8',
      bookshelf: '#fbbf24',
      desk: '#4ade80',
      workbench: '#f97316',
      terminal: '#22d3ee',
      scanner: '#60a5fa',
      antenna: '#4ac8e8',
      portal: '#22d3d8',
      taskboard: '#fb923c',
    }
    return colors[type] || '#ffffff'
  }

  // ==========================================================================
  // Zone activity / attention
  // ==========================================================================

  pulseZone(sessionId: string): void {
    const zone = this.zones.get(sessionId)
    if (!zone) return
    zone.pulseIntensity = 1.0
    this.emitParticles(zone)
  }

  setZoneAttention(sessionId: string, reason: AttentionReason): void {
    const zone = this.zones.get(sessionId)
    if (!zone) return
    zone.attentionReason = reason
    zone.attentionTime = 0
  }

  clearZoneAttention(sessionId: string): void {
    const zone = this.zones.get(sessionId)
    if (!zone) return
    zone.attentionReason = null
    zone.attentionTime = 0
    zone.ring.scale.setScalar(1)
  }

  setZoneStatus(sessionId: string, status: Zone['status']): void {
    const zone = this.zones.get(sessionId)
    if (!zone) return

    zone.status = status
    const floorMat = zone.floor.material as THREE.MeshStandardMaterial
    const ringMat = zone.ring.material as THREE.MeshBasicMaterial

    const statusColors: Record<Zone['status'], { emissive: number; intensity: number; ring: number; ringOpacity: number }> = {
      idle: { emissive: zone.color, intensity: 0.02, ring: zone.color, ringOpacity: 0.4 },
      working: { emissive: 0x22d3ee, intensity: 0.08, ring: 0x22d3ee, ringOpacity: 0.5 },
      waiting: { emissive: 0xfbbf24, intensity: 0.06, ring: 0xfbbf24, ringOpacity: 0.6 },
      attention: { emissive: 0xf87171, intensity: 0.10, ring: 0xf87171, ringOpacity: 0.7 },
      offline: { emissive: 0x404050, intensity: 0.01, ring: 0x404050, ringOpacity: 0.2 },
    }

    const c = statusColors[status]
    floorMat.emissive.setHex(c.emissive)
    floorMat.emissiveIntensity = c.intensity
    ringMat.color.setHex(c.ring)
    ringMat.opacity = c.ringOpacity
  }

  getZonesNeedingAttention(): { id: string; reason: AttentionReason }[] {
    const result: { id: string; reason: AttentionReason }[] = []
    for (const [id, zone] of this.zones) {
      if (zone.attentionReason) result.push({ id, reason: zone.attentionReason })
    }
    return result
  }

  // ==========================================================================
  // Station pulse
  // ==========================================================================

  pulseStation(sessionId: string, stationType: StationType): void {
    const zone = this.zones.get(sessionId)
    if (!zone) return

    const station = zone.stations.get(stationType)
    if (!station || stationType === 'center') return

    let ring: THREE.Mesh | undefined
    station.mesh.traverse((child) => {
      if (child instanceof THREE.Mesh && child.geometry instanceof THREE.RingGeometry) ring = child
    })
    if (!ring) return

    const ringMat = ring.material as THREE.MeshBasicMaterial
    const baseOpacity = ringMat.opacity

    if (this.stationPulses.some((p) => p.ring === ring)) return

    this.stationPulses.push({
      ring,
      age: 0,
      maxAge: 1.3,
      baseOpacity,
      peakOpacity: Math.min(1, baseOpacity + 0.5),
    })
  }

  // ==========================================================================
  // Particles
  // ==========================================================================

  private createParticleSystem(color: number): { particles: THREE.Points; velocities: Float32Array } {
    const count = 20
    const positions = new Float32Array(count * 3)
    const velocities = new Float32Array(count * 3)

    for (let i = 0; i < count; i++) {
      positions[i * 3] = 0
      positions[i * 3 + 1] = -1000
      positions[i * 3 + 2] = 0
    }

    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))

    const mat = new THREE.PointsMaterial({
      color,
      size: 0.15,
      transparent: true,
      opacity: 0.8,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })

    return { particles: new THREE.Points(geo, mat), velocities }
  }

  private emitParticles(zone: Zone): void {
    const positions = zone.particles.geometry.attributes.position.array as Float32Array
    const velocities = zone.particleVelocities
    let activated = 0

    for (let i = 0; i < positions.length / 3 && activated < 5; i++) {
      if (positions[i * 3 + 1] < -5) {
        positions[i * 3] = (Math.random() - 0.5) * 2
        positions[i * 3 + 1] = 0.5
        positions[i * 3 + 2] = (Math.random() - 0.5) * 2

        velocities[i * 3] = (Math.random() - 0.5) * 2
        velocities[i * 3 + 1] = 2 + Math.random() * 2
        velocities[i * 3 + 2] = (Math.random() - 0.5) * 2
        activated++
      }
    }

    zone.particles.geometry.attributes.position.needsUpdate = true
  }

  // ==========================================================================
  // Click pulses
  // ==========================================================================

  spawnClickPulse(x: number, z: number, color = 0x4ac8e8, y = 0.03): void {
    const hexRadius = this.hexGrid.hexRadius
    const clickedHex = this.hexGrid.cartesianToHex(x, z)

    // Expanding ring
    const ringGeo = new THREE.RingGeometry(0.2, 0.4, 32)
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x8eefff,
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
    const ring = new THREE.Mesh(ringGeo, ringMat)
    ring.rotation.x = -Math.PI / 2
    ring.position.set(x, y, z)
    this.scene.add(ring)

    this.clickPulses.push({ mesh: ring, age: 0, maxAge: 0.5, type: 'ring' })

    // Hex wave ripple
    const spawnHexRing = (ringNum: number, strength: number) => {
      const hexes = ringNum === 0 ? [clickedHex] : this.getHexRing(clickedHex, ringNum)

      for (const hex of hexes) {
        const center = this.hexGrid.axialToCartesian(hex)
        const pts: THREE.Vector3[] = []
        for (let i = 0; i <= 6; i++) {
          const angle = (Math.PI / 3) * i - Math.PI / 2
          pts.push(new THREE.Vector3(
            center.x + hexRadius * Math.cos(angle),
            0.02,
            center.z + hexRadius * Math.sin(angle),
          ))
        }

        const geo = new THREE.BufferGeometry().setFromPoints(pts)
        const mat = new THREE.LineBasicMaterial({
          color: 0x8eefff,
          transparent: true,
          opacity: strength,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
        const line = new THREE.Line(geo, mat)
        this.scene.add(line)

        this.clickPulses.push({
          mesh: line,
          age: 0,
          maxAge: 0.5,
          type: 'ripple',
          startOpacity: strength,
        })
      }
    }

    const maxRings = 7
    const msPerRing = 45

    for (let r = 0; r <= maxRings; r++) {
      const strength = Math.pow(0.6, r)
      if (strength < 0.03) continue
      if (r === 0) {
        spawnHexRing(0, strength)
      } else {
        setTimeout(() => spawnHexRing(r, strength), r * msPerRing)
      }
    }
  }

  private getHexRing(center: { q: number; r: number }, ring: number): Array<{ q: number; r: number }> {
    if (ring === 0) return [center]

    const results: Array<{ q: number; r: number }> = []
    const directions = [
      { q: 1, r: 0 },  { q: 1, r: -1 }, { q: 0, r: -1 },
      { q: -1, r: 0 }, { q: -1, r: 1 }, { q: 0, r: 1 },
    ]

    let hex = { q: center.q + ring, r: center.r }

    for (let side = 0; side < 6; side++) {
      for (let step = 0; step < ring; step++) {
        results.push({ ...hex })
        const dir = directions[(side + 2) % 6]
        hex = { q: hex.q + dir.q, r: hex.r + dir.r }
      }
    }

    return results
  }

  private updateClickPulses(delta: number): void {
    for (let i = this.clickPulses.length - 1; i >= 0; i--) {
      const pulse = this.clickPulses[i]

      if (pulse.delay && pulse.delay > 0) { pulse.delay -= delta; continue }

      pulse.age += delta
      const progress = pulse.age / pulse.maxAge

      if (progress >= 1) {
        this.scene.remove(pulse.mesh)
        pulse.mesh.geometry.dispose()
        ;(pulse.mesh.material as THREE.Material).dispose()
        this.clickPulses.splice(i, 1)
      } else if (pulse.type === 'ring') {
        const scale = 1 + progress * 4
        pulse.mesh.scale.set(scale, scale, 1)
        ;(pulse.mesh.material as THREE.MeshBasicMaterial).opacity = 0.9 * (1 - progress * progress)
      } else if (pulse.type === 'ripple') {
        const mat = pulse.mesh.material as THREE.LineBasicMaterial
        const peak = pulse.startOpacity ?? 1.0
        mat.opacity = peak * Math.pow(1 - progress, 2)
      } else {
        const pulsePhase = Math.sin(progress * Math.PI * 2) * 0.3
        const fadeOut = 1 - progress * progress
        ;(pulse.mesh.material as THREE.LineBasicMaterial).opacity = Math.min(1, (0.7 + pulsePhase) * fadeOut)
      }
    }
  }

  private updateStationPulses(delta: number): void {
    for (let i = this.stationPulses.length - 1; i >= 0; i--) {
      const pulse = this.stationPulses[i]
      pulse.age += delta
      const progress = pulse.age / pulse.maxAge

      if (progress >= 1) {
        (pulse.ring.material as THREE.MeshBasicMaterial).opacity = pulse.baseOpacity
        this.stationPulses.splice(i, 1)
      } else {
        const mat = pulse.ring.material as THREE.MeshBasicMaterial
        const fadeInEnd = 0.23
        const holdEnd = 0.62

        let opacity: number
        if (progress < fadeInEnd) {
          opacity = pulse.baseOpacity + (pulse.peakOpacity - pulse.baseOpacity) * (progress / fadeInEnd)
        } else if (progress < holdEnd) {
          opacity = pulse.peakOpacity
        } else {
          const t = (progress - holdEnd) / (1 - holdEnd)
          opacity = pulse.peakOpacity - (pulse.peakOpacity - pulse.baseOpacity) * t
        }
        mat.opacity = opacity
      }
    }
  }

  // ==========================================================================
  // Spawn beams
  // ==========================================================================

  launchSpawnBeam(fromSessionId: string, toSessionId: string): void {
    const fromZone = this.zones.get(fromSessionId)
    const toZone = this.zones.get(toSessionId)
    if (!fromZone || !toZone) return

    const portal = fromZone.stations.get('portal')
    if (!portal) return

    const from = new THREE.Vector3(
      fromZone.position.x + portal.localPosition.x,
      fromZone.elevation + 0.5,
      fromZone.position.z + portal.localPosition.z,
    )
    const to = new THREE.Vector3(
      toZone.position.x,
      toZone.elevation + 0.5,
      toZone.position.z,
    )

    this.spawnBeams.launch(from, to, toZone.color)
  }

  // ==========================================================================
  // Floating notifications (legacy)
  // ==========================================================================

  showNotification(sessionId: string, text: string, color = '#4ade80'): void {
    const zone = this.zones.get(sessionId)
    if (!zone) return

    const sprite = this.createNotificationSprite(text, color)
    const zoneCenter = zone.floor.position.clone()
    const startY = 2.5
    sprite.position.set(zoneCenter.x, startY, zoneCenter.z)
    this.scene.add(sprite)

    this.notifications.push({ sprite, startY, age: 0, maxAge: 3 })
  }

  private createNotificationSprite(text: string, color: string): THREE.Sprite {
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')!
    canvas.width = 512
    canvas.height = 64

    const fontSize = 24
    ctx.font = `600 ${fontSize}px ui-monospace, SFMono-Regular, monospace`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'

    const cx = canvas.width / 2
    const cy = canvas.height / 2

    const tw = ctx.measureText(text).width
    const pad = 20
    const pw = tw + pad * 2
    const ph = 40

    ctx.fillStyle = 'rgba(0,0,0,0.85)'
    ctx.beginPath()
    ctx.roundRect(cx - pw / 2, cy - ph / 2, pw, ph, 8)
    ctx.fill()

    ctx.fillStyle = color
    ctx.fillText(text, cx, cy)

    const texture = new THREE.CanvasTexture(canvas)
    texture.needsUpdate = true
    const mat = new THREE.SpriteMaterial({ map: texture, transparent: true, opacity: 1, depthTest: false })
    const sprite = new THREE.Sprite(mat)
    sprite.scale.set(4, 0.5, 1)
    return sprite
  }

  private updateNotifications(delta: number): void {
    for (let i = this.notifications.length - 1; i >= 0; i--) {
      const n = this.notifications[i]
      n.age += delta
      const progress = n.age / n.maxAge

      if (progress >= 1) {
        this.scene.remove(n.sprite)
        n.sprite.material.map?.dispose()
        n.sprite.material.dispose()
        this.notifications.splice(i, 1)
      } else {
        n.sprite.position.y = n.startY + progress * 1.5
        const fadeStart = 0.6
        n.sprite.material.opacity = progress < fadeStart ? 1 : 1 - (progress - fadeStart) / (1 - fadeStart)
      }
    }
  }

  // ==========================================================================
  // Resize
  // ==========================================================================

  private handleResize = (): void => {
    const w = this.container.clientWidth
    const h = this.container.clientHeight
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(w, h)
  }

  // ==========================================================================
  // Render callbacks
  // ==========================================================================

  onRender(callback: (delta: number) => void): void {
    this.onRenderCallbacks.push(callback)
  }

  offRender(callback: (delta: number) => void): void {
    const idx = this.onRenderCallbacks.indexOf(callback)
    if (idx !== -1) this.onRenderCallbacks.splice(idx, 1)
  }

  // ==========================================================================
  // Animation loop
  // ==========================================================================

  start(): void {
    const animate = () => {
      this.animationId = requestAnimationFrame(animate)
      const delta = this.clock.getDelta()

      // Camera animation
      if (this.cameraAnimating) {
        const lf = 1 - Math.exp(-this.cameraLerpSpeed * delta)
        this.camera.position.lerp(this.cameraTargetPos, lf)
        this.controls.target.lerp(this.cameraTargetLookAt, lf)

        if (
          this.camera.position.distanceTo(this.cameraTargetPos) < 0.01 &&
          this.controls.target.distanceTo(this.cameraTargetLookAt) < 0.01
        ) {
          this.camera.position.copy(this.cameraTargetPos)
          this.controls.target.copy(this.cameraTargetLookAt)
          this.cameraAnimating = false
        }
      }

      this.controls.update()
      this.time += delta

      // External callbacks
      for (const cb of this.onRenderCallbacks) cb(delta)

      // Ambient particles
      this.updateAmbientParticles(delta)

      // Zone animations
      const zonesToFinalize: string[] = []
      for (const zone of this.zones.values()) {
        // Enter animation
        if (zone.animationState === 'entering') {
          zone.animationProgress = Math.min(1, (zone.animationProgress ?? 0) + delta * 2)
          const t = zone.animationProgress
          const eased = 1 - Math.pow(1 - t, 3)

          zone.group.scale.setScalar(eased)

          const ringMat = zone.ring.material as THREE.MeshBasicMaterial
          const floorMat = zone.floor.material as THREE.MeshStandardMaterial
          ringMat.opacity = eased * 0.4
          floorMat.opacity = eased

          if (t > 0.5) {
            for (const s of zone.stations.values()) s.mesh.visible = true
            zone.particles.visible = true
          }
          if (t > 0.7 && zone.label) zone.label.visible = true
          if (t >= 1) {
            zone.animationState = undefined
            zone.animationProgress = undefined
          }
        }
        // Exit animation
        else if (zone.animationState === 'exiting') {
          zone.animationProgress = Math.min(1, (zone.animationProgress ?? 0) + delta * 2.5)
          const t = zone.animationProgress
          const eased = 1 - Math.pow(t, 2)

          zone.group.scale.setScalar(Math.max(0.01, eased))

          const ringMat = zone.ring.material as THREE.MeshBasicMaterial
          const floorMat = zone.floor.material as THREE.MeshStandardMaterial
          ringMat.opacity = eased * 0.4
          floorMat.opacity = eased

          if (t > 0.3) { if (zone.label) zone.label.visible = false; zone.particles.visible = false }
          if (t > 0.5) { for (const s of zone.stations.values()) s.mesh.visible = false }
          if (t >= 1) zonesToFinalize.push(zone.id)
        }

        // Station floating bob
        for (const station of zone.stations.values()) {
          if (station.type !== 'center') {
            station.mesh.position.y = Math.sin(this.time * 1.5 + station.position.x * 0.5) * 0.03
          }
        }

        // Ring pulse / attention animation
        if (zone.attentionReason) {
          zone.attentionTime += delta
          if (zone.attentionReason === 'finished') {
            const p = Math.sin(zone.attentionTime * 2) * 0.5 + 0.5
            zone.ring.scale.setScalar(1 + p * 0.02)
          } else {
            const p = Math.sin(zone.attentionTime * 4) * 0.5 + 0.5
            zone.ring.scale.setScalar(1 + p * 0.08)
          }
        } else if (zone.pulseIntensity > 0) {
          zone.pulseIntensity = Math.max(0, zone.pulseIntensity - delta * 0.5)
          zone.ring.scale.setScalar(1 + zone.pulseIntensity * 0.05)
        } else {
          zone.ring.scale.setScalar(1)
        }

        // Update zone particles
        const positions = zone.particles.geometry.attributes.position.array as Float32Array
        const velocities = zone.particleVelocities
        let needsUpdate = false

        for (let i = 0; i < positions.length / 3; i++) {
          if (positions[i * 3 + 1] > -5) {
            positions[i * 3] += velocities[i * 3] * delta
            positions[i * 3 + 1] += velocities[i * 3 + 1] * delta
            positions[i * 3 + 2] += velocities[i * 3 + 2] * delta
            velocities[i * 3 + 1] -= 5 * delta
            if (positions[i * 3 + 1] < 0) positions[i * 3 + 1] = -1000
            needsUpdate = true
          }
        }
        if (needsUpdate) zone.particles.geometry.attributes.position.needsUpdate = true
      }

      // Finalize deletions
      for (const id of zonesToFinalize) this.finalizeZoneDelete(id)

      // Update effects
      this.updateClickPulses(delta)
      this.updateStationPulses(delta)
      this.updateNotifications(delta)

      // Update subsystems
      this.zoneNotifications.update(delta)
      this.spawnBeams.update(delta)
      this.stationPanels.update()

      // Render
      this.renderer.render(this.scene, this.camera)
    }

    animate()
  }

  stop(): void {
    if (this.animationId !== null) {
      cancelAnimationFrame(this.animationId)
      this.animationId = null
    }
  }

  // ==========================================================================
  // Dispose
  // ==========================================================================

  dispose(): void {
    this.stop()
    this.clearAllContexts()
    this.zoneNotifications.dispose()

    for (const notif of this.notifications) {
      this.scene.remove(notif.sprite)
      notif.sprite.material.map?.dispose()
      notif.sprite.material.dispose()
    }
    this.notifications = []

    for (const pulse of this.clickPulses) {
      this.scene.remove(pulse.mesh)
      pulse.mesh.geometry.dispose()
      ;(pulse.mesh.material as THREE.MeshBasicMaterial).dispose()
    }
    this.clickPulses = []

    this.renderer.domElement.removeEventListener('mousemove', this.handleHover)
    this.renderer.domElement.removeEventListener('mouseleave', this.handleHoverLeave)
    window.removeEventListener('resize', this.handleResize)
    this.renderer.dispose()
    this.container.removeChild(this.renderer.domElement)
  }
}

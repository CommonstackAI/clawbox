/**
 * HexGrid — Vendored from Vibecraft2. Hex coordinate math for zone placement.
 */

export interface HexCoord {
  q: number
  r: number
}

interface CubeCoord {
  x: number
  y: number
  z: number
}

const HEX_DIRECTIONS: HexCoord[] = [
  { q: 1, r: 0 },
  { q: 1, r: -1 },
  { q: 0, r: -1 },
  { q: -1, r: 0 },
  { q: -1, r: 1 },
  { q: 0, r: 1 },
]

export class HexGrid {
  readonly hexRadius: number
  readonly spacing: number
  readonly hexWidth: number
  readonly hexHeight: number

  private occupied = new Map<string, string>()
  private sessionToHex = new Map<string, string>()
  private spiralIndex = 0

  constructor(hexRadius = 10, spacing = 1.1) {
    this.hexRadius = hexRadius
    this.spacing = spacing
    this.hexWidth = Math.sqrt(3) * hexRadius * spacing
    this.hexHeight = 2 * hexRadius * spacing
  }

  axialToCartesian(hex: HexCoord): { x: number; z: number } {
    const x = this.hexWidth * (hex.q + hex.r / 2)
    const z = this.hexHeight * (3 / 4) * hex.r
    return { x, z }
  }

  cartesianToAxial(x: number, z: number): { q: number; r: number } {
    const r = z / (this.hexHeight * 0.75)
    const q = x / this.hexWidth - r / 2
    return { q, r }
  }

  roundToHex(q: number, r: number): HexCoord {
    const cube = this.axialToCube({ q, r })
    let rx = Math.round(cube.x)
    let ry = Math.round(cube.y)
    let rz = Math.round(cube.z)

    const dx = Math.abs(rx - cube.x)
    const dy = Math.abs(ry - cube.y)
    const dz = Math.abs(rz - cube.z)

    if (dx > dy && dx > dz) rx = -ry - rz
    else if (dy > dz) ry = -rx - rz
    else rz = -rx - ry

    return this.cubeToAxial({ x: rx, y: ry, z: rz })
  }

  cartesianToHex(x: number, z: number): HexCoord {
    const { q, r } = this.cartesianToAxial(x, z)
    return this.roundToHex(q, r)
  }

  private axialToCube(hex: HexCoord): CubeCoord {
    return { x: hex.q, z: hex.r, y: -hex.q - hex.r }
  }

  private cubeToAxial(cube: CubeCoord): HexCoord {
    return { q: cube.x, r: cube.z }
  }

  hexKey(hex: HexCoord): string {
    return `${hex.q},${hex.r}`
  }

  parseHexKey(key: string): HexCoord {
    const [q, r] = key.split(',').map(Number)
    return { q, r }
  }

  getNeighbors(hex: HexCoord): HexCoord[] {
    return HEX_DIRECTIONS.map(dir => ({
      q: hex.q + dir.q,
      r: hex.r + dir.r,
    }))
  }

  distance(a: HexCoord, b: HexCoord): number {
    const cubeA = this.axialToCube(a)
    const cubeB = this.axialToCube(b)
    return Math.max(
      Math.abs(cubeA.x - cubeB.x),
      Math.abs(cubeA.y - cubeB.y),
      Math.abs(cubeA.z - cubeB.z)
    )
  }

  equals(a: HexCoord, b: HexCoord): boolean {
    return a.q === b.q && a.r === b.r
  }

  getHexesInRadius(center: HexCoord, radius: number): HexCoord[] {
    const results: HexCoord[] = []
    for (let q = -radius + 1; q < radius; q++) {
      for (let r = Math.max(-radius + 1, -q - radius + 1); r < Math.min(radius, -q + radius); r++) {
        results.push({ q: center.q + q, r: center.r + r })
      }
    }
    return results
  }

  occupy(hex: HexCoord, sessionId: string): void {
    const key = this.hexKey(hex)
    this.occupied.set(key, sessionId)
    this.sessionToHex.set(sessionId, key)
  }

  release(sessionId: string): void {
    const key = this.sessionToHex.get(sessionId)
    if (key) {
      this.occupied.delete(key)
      this.sessionToHex.delete(sessionId)
    }
  }

  isOccupied(hex: HexCoord): boolean {
    return this.occupied.has(this.hexKey(hex))
  }

  getOccupant(hex: HexCoord): string | undefined {
    return this.occupied.get(this.hexKey(hex))
  }

  getSessionHex(sessionId: string): HexCoord | undefined {
    const key = this.sessionToHex.get(sessionId)
    return key ? this.parseHexKey(key) : undefined
  }

  get occupiedCount(): number {
    return this.occupied.size
  }

  findNearestFree(target: HexCoord): HexCoord {
    if (!this.isOccupied(target)) return target
    for (let ring = 1; ring <= 50; ring++) {
      for (const hex of this.getHexesInRing(target, ring)) {
        if (!this.isOccupied(hex)) return hex
      }
    }
    return target
  }

  getNextInSpiral(): HexCoord {
    for (let i = this.spiralIndex; i < 1000; i++) {
      const hex = this.indexToHexCoord(i)
      if (!this.isOccupied(hex)) {
        this.spiralIndex = i + 1
        return hex
      }
    }
    return { q: 0, r: 0 }
  }

  private getHexesInRing(center: HexCoord, ring: number): HexCoord[] {
    if (ring === 0) return [center]
    const results: HexCoord[] = []
    let hex: HexCoord = { q: center.q + ring, r: center.r }
    for (let side = 0; side < 6; side++) {
      for (let step = 0; step < ring; step++) {
        results.push({ ...hex })
        hex = {
          q: hex.q + HEX_DIRECTIONS[(side + 2) % 6].q,
          r: hex.r + HEX_DIRECTIONS[(side + 2) % 6].r,
        }
      }
    }
    return results
  }

  private indexToHexCoord(index: number): HexCoord {
    if (index === 0) return { q: 0, r: 0 }
    let ring = 1
    let ringStart = 1
    while (ringStart + ring * 6 <= index) {
      ringStart += ring * 6
      ring++
    }
    const posInRing = index - ringStart
    const side = Math.floor(posInRing / ring)
    const posOnSide = posInRing % ring
    let q = ring
    let r = 0
    for (let s = 0; s < side; s++) {
      q += HEX_DIRECTIONS[(s + 2) % 6].q * ring
      r += HEX_DIRECTIONS[(s + 2) % 6].r * ring
    }
    q += HEX_DIRECTIONS[(side + 2) % 6].q * posOnSide
    r += HEX_DIRECTIONS[(side + 2) % 6].r * posOnSide
    return { q, r }
  }

  clear(): void {
    this.occupied.clear()
    this.sessionToHex.clear()
    this.spiralIndex = 0
  }
}

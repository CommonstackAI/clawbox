/**
 * Antenna Station - WebFetch/WebSearch station decorations
 */

import * as THREE from 'three'

export function addAntennaDetails(group: THREE.Group): void {
  const metalMaterial = new THREE.MeshStandardMaterial({
    color: 0x666677,
    metalness: 0.7,
    roughness: 0.3,
  })

  // Main tower pole
  const tower = new THREE.Mesh(
    new THREE.CylinderGeometry(0.04, 0.06, 1.2),
    metalMaterial
  )
  tower.position.set(0, 1.4, 0)
  group.add(tower)

  // Cross beams (lattice tower look)
  for (const y of [1.0, 1.4, 1.8]) {
    const beam = new THREE.Mesh(
      new THREE.BoxGeometry(0.4, 0.02, 0.02),
      metalMaterial
    )
    beam.position.set(0, y, 0)
    group.add(beam)
  }

  // Satellite dish at top
  const dishGeometry = new THREE.SphereGeometry(0.25, 12, 6, 0, Math.PI)
  const dishMaterial = new THREE.MeshStandardMaterial({
    color: 0xaaaabb,
    metalness: 0.8,
    roughness: 0.2,
    side: THREE.DoubleSide,
  })
  const dish = new THREE.Mesh(dishGeometry, dishMaterial)
  dish.position.set(0.15, 1.85, 0)
  dish.rotation.x = -Math.PI / 3
  dish.rotation.z = -0.3
  group.add(dish)

  // Signal waves (decorative rings)
  const waveMaterial = new THREE.MeshBasicMaterial({
    color: 0x66aaff,
    transparent: true,
    opacity: 0.3,
    side: THREE.DoubleSide,
  })
  for (let i = 0; i < 2; i++) {
    const wave = new THREE.Mesh(
      new THREE.RingGeometry(0.15 + i * 0.12, 0.18 + i * 0.12, 16),
      waveMaterial
    )
    wave.position.set(0.3 + i * 0.15, 1.95, 0.1)
    wave.rotation.y = Math.PI / 3
    group.add(wave)
  }

  // Small blinking light at top
  const light = new THREE.Mesh(
    new THREE.SphereGeometry(0.03, 8, 8),
    new THREE.MeshBasicMaterial({ color: 0xff4444 })
  )
  light.position.set(0, 2.0, 0)
  group.add(light)
}

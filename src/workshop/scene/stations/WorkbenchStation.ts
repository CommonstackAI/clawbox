/**
 * Workbench Station - Edit tool station decorations
 */

import * as THREE from 'three'

export function addWorkbenchDetails(group: THREE.Group): void {
  const metalMaterial = new THREE.MeshStandardMaterial({
    color: 0x888899,
    metalness: 0.8,
    roughness: 0.2,
  })

  // Vice/clamp on the side
  const viceBase = new THREE.Mesh(
    new THREE.BoxGeometry(0.2, 0.15, 0.15),
    metalMaterial
  )
  viceBase.position.set(-0.55, 0.88, 0)
  group.add(viceBase)

  const viceJaw = new THREE.Mesh(
    new THREE.BoxGeometry(0.08, 0.2, 0.12),
    metalMaterial
  )
  viceJaw.position.set(-0.55, 1.0, 0.08)
  group.add(viceJaw)

  // Hammer
  const hammerHead = new THREE.Mesh(
    new THREE.BoxGeometry(0.15, 0.08, 0.08),
    metalMaterial
  )
  hammerHead.position.set(0.25, 0.88, -0.15)
  hammerHead.rotation.y = 0.4
  group.add(hammerHead)

  const hammerHandle = new THREE.Mesh(
    new THREE.CylinderGeometry(0.02, 0.025, 0.3, 8),
    new THREE.MeshStandardMaterial({ color: 0x4a5a6a, metalness: 0.3 })  // Blue-gray
  )
  hammerHandle.position.set(0.35, 0.86, -0.08)
  hammerHandle.rotation.z = Math.PI / 2
  hammerHandle.rotation.y = 0.4
  group.add(hammerHandle)

  // Gears (being worked on)
  const gearMaterial = new THREE.MeshStandardMaterial({
    color: 0xf97316,
    metalness: 0.6,
    roughness: 0.3,
  })
  const gear1 = new THREE.Mesh(
    new THREE.TorusGeometry(0.1, 0.025, 8, 12),
    gearMaterial
  )
  gear1.position.set(0, 0.85, 0.1)
  gear1.rotation.x = Math.PI / 2
  group.add(gear1)

  const gear2 = new THREE.Mesh(
    new THREE.TorusGeometry(0.07, 0.02, 8, 10),
    gearMaterial
  )
  gear2.position.set(-0.15, 0.84, 0.15)
  gear2.rotation.x = Math.PI / 2
  group.add(gear2)

  // Screwdriver
  const screwdriverHandle = new THREE.Mesh(
    new THREE.CylinderGeometry(0.03, 0.035, 0.12, 8),
    new THREE.MeshStandardMaterial({ color: 0xcc3333 })
  )
  screwdriverHandle.position.set(0.4, 0.87, 0.2)
  screwdriverHandle.rotation.z = Math.PI / 2 + 0.2
  group.add(screwdriverHandle)

  const screwdriverShaft = new THREE.Mesh(
    new THREE.CylinderGeometry(0.012, 0.012, 0.15, 8),
    metalMaterial
  )
  screwdriverShaft.position.set(0.28, 0.85, 0.18)
  screwdriverShaft.rotation.z = Math.PI / 2 + 0.2
  group.add(screwdriverShaft)
}

/**
 * Scanner Station - Grep/Glob search station decorations
 */

import * as THREE from 'three'

export function addScannerDetails(group: THREE.Group): void {
  // Magnifying glass handle
  const handleMaterial = new THREE.MeshStandardMaterial({
    color: 0x4a5a6a,  // Blue-gray
    roughness: 0.5,
    metalness: 0.4,
  })
  const handle = new THREE.Mesh(
    new THREE.CylinderGeometry(0.04, 0.05, 0.5, 12),
    handleMaterial
  )
  handle.position.set(0.15, 1.0, 0)
  handle.rotation.z = -Math.PI / 4
  group.add(handle)

  // Magnifying glass rim
  const rimMaterial = new THREE.MeshStandardMaterial({
    color: 0xc9a227,
    metalness: 0.7,
    roughness: 0.3,
  })
  const rim = new THREE.Mesh(
    new THREE.TorusGeometry(0.28, 0.04, 12, 24),
    rimMaterial
  )
  rim.position.set(-0.05, 1.35, 0)
  rim.rotation.x = Math.PI / 2
  rim.rotation.y = 0.3
  group.add(rim)

  // Glass lens
  const lensMaterial = new THREE.MeshStandardMaterial({
    color: 0xaaddff,
    transparent: true,
    opacity: 0.4,
    metalness: 0.1,
    roughness: 0.1,
  })
  const lens = new THREE.Mesh(
    new THREE.CircleGeometry(0.26, 24),
    lensMaterial
  )
  lens.position.set(-0.05, 1.35, 0.01)
  lens.rotation.y = 0.3
  group.add(lens)

  // Glint/reflection on lens
  const glint = new THREE.Mesh(
    new THREE.CircleGeometry(0.06, 12),
    new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.6,
    })
  )
  glint.position.set(-0.12, 1.42, 0.02)
  glint.rotation.y = 0.3
  group.add(glint)
}

/**
 * Desk Station - Write tool station decorations
 */

import * as THREE from 'three'

export function addDeskDetails(group: THREE.Group): void {
  // Notepad/paper
  const paperGeometry = new THREE.BoxGeometry(0.6, 0.02, 0.8)
  const paperMaterial = new THREE.MeshStandardMaterial({
    color: 0xf5f5dc,
    roughness: 0.9,
  })
  const paper = new THREE.Mesh(paperGeometry, paperMaterial)
  paper.position.set(0, 0.82, 0)
  group.add(paper)

  // Pencil
  const pencilGeometry = new THREE.CylinderGeometry(0.02, 0.02, 0.4, 8)
  const pencilMaterial = new THREE.MeshStandardMaterial({
    color: 0xffd700,
  })
  const pencil = new THREE.Mesh(pencilGeometry, pencilMaterial)
  pencil.position.set(0.35, 0.85, 0.2)
  pencil.rotation.z = Math.PI / 2
  pencil.rotation.y = 0.3
  group.add(pencil)

  // Ink pot
  const inkGeometry = new THREE.CylinderGeometry(0.08, 0.1, 0.15, 16)
  const inkMaterial = new THREE.MeshStandardMaterial({
    color: 0x1a1a2e,
    metalness: 0.3,
  })
  const ink = new THREE.Mesh(inkGeometry, inkMaterial)
  ink.position.set(-0.4, 0.88, -0.2)
  group.add(ink)
}

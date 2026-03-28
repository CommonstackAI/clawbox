/**
 * Portal Station - Task/subagent spawning station decorations
 */

import * as THREE from 'three'

export function addPortalDetails(group: THREE.Group): void {
  // Portal ring
  const ringGeometry = new THREE.TorusGeometry(0.6, 0.1, 8, 32)
  const ringMaterial = new THREE.MeshStandardMaterial({
    color: 0x8844ff,
    emissive: 0x4422aa,
    emissiveIntensity: 0.5,
  })
  const ring = new THREE.Mesh(ringGeometry, ringMaterial)
  ring.position.set(0, 1.3, 0)
  ring.rotation.x = Math.PI / 2
  group.add(ring)

  // Portal center (glowing)
  const portalGeometry = new THREE.CircleGeometry(0.5, 32)
  const portalMaterial = new THREE.MeshBasicMaterial({
    color: 0xaa66ff,
    transparent: true,
    opacity: 0.5,
    side: THREE.DoubleSide,
  })
  const portal = new THREE.Mesh(portalGeometry, portalMaterial)
  portal.position.set(0, 1.3, 0)
  portal.rotation.x = Math.PI / 2
  group.add(portal)
}

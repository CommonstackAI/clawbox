/**
 * Bookshelf Station - Library/reading station decorations
 */

import * as THREE from 'three'

export function addBookshelfDetails(group: THREE.Group): void {
  const shelfMaterial = new THREE.MeshStandardMaterial({
    color: 0x3a5a6a,  // Blue-gray metallic
    roughness: 0.6,
    metalness: 0.3,
  })

  // Vertical sides
  for (const xOffset of [-0.7, 0.7]) {
    const side = new THREE.Mesh(
      new THREE.BoxGeometry(0.1, 1.5, 0.8),
      shelfMaterial
    )
    side.position.set(xOffset, 1.15, 0)
    side.castShadow = true
    group.add(side)
  }

  // Shelves
  for (const yOffset of [0.9, 1.4]) {
    const shelf = new THREE.Mesh(
      new THREE.BoxGeometry(1.4, 0.05, 0.8),
      shelfMaterial
    )
    shelf.position.set(0, yOffset, 0)
    group.add(shelf)
  }

  // Books (simple colored boxes)
  const bookColors = [0xcc3333, 0x33cc33, 0x3333cc, 0xcccc33, 0xcc33cc]
  for (let i = 0; i < 5; i++) {
    const book = new THREE.Mesh(
      new THREE.BoxGeometry(0.15, 0.35, 0.5),
      new THREE.MeshStandardMaterial({ color: bookColors[i] })
    )
    book.position.set(-0.4 + i * 0.2, 1.1, 0)
    group.add(book)
  }
}

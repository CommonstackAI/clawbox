/**
 * Taskboard Station - TodoWrite station decorations
 */

import * as THREE from 'three'

export function addTaskboardDetails(group: THREE.Group): void {
  // Board backing
  const boardGeometry = new THREE.BoxGeometry(1.2, 0.9, 0.05)
  const boardMaterial = new THREE.MeshStandardMaterial({
    color: 0x3a3a4e,
    roughness: 0.8,
  })
  const board = new THREE.Mesh(boardGeometry, boardMaterial)
  board.position.set(0, 1.25, -0.3)
  board.rotation.x = -0.1
  group.add(board)

  // Task cards (sticky notes)
  const cardColors = [0x4ade80, 0xfbbf24, 0x60a5fa, 0xf472b6]
  const cardPositions = [
    [-0.35, 1.4, -0.25],
    [0.05, 1.4, -0.25],
    [-0.35, 1.1, -0.25],
    [0.05, 1.1, -0.25],
  ]

  cardPositions.forEach((pos, i) => {
    const cardGeometry = new THREE.BoxGeometry(0.3, 0.2, 0.01)
    const cardMaterial = new THREE.MeshStandardMaterial({
      color: cardColors[i % cardColors.length],
      roughness: 0.9,
    })
    const card = new THREE.Mesh(cardGeometry, cardMaterial)
    card.position.set(pos[0], pos[1], pos[2])
    card.rotation.x = -0.1
    group.add(card)
  })
}

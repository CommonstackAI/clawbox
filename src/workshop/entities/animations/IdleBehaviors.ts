/**
 * IdleBehaviors - Modular idle animations for ClaudeMon
 *
 * Each behavior is a self-contained animation that plays during idle state.
 * Easy to add, remove, or swap behaviors by editing the IDLE_BEHAVIORS array.
 *
 * Architecture:
 * - Uses shared AnimationTypes for interfaces and utilities
 * - Each behavior has: name, duration, weight (probability), update function
 * - IdleBehaviorManager picks random behaviors based on weights
 */

// Re-export shared types for convenience
export type { CharacterParts, IdleBehavior } from './AnimationTypes'

import {
  type CharacterParts,
  type IdleBehavior,
  easeInOut,
  easeOut,
  easeIn,
  bounce,
} from './AnimationTypes'

// ============================================================================
// Idle Behaviors - Add new behaviors here!
// ============================================================================

const lookAround: IdleBehavior = {
  name: 'lookAround',
  duration: 3,
  weight: 10,
  update: (parts, progress) => {
    // Look left, pause, look right, pause, center
    const t = progress * 4
    let lookX = 0
    let lookY = 0

    if (t < 1) {
      // Look left
      lookX = -easeInOut(t) * 0.03
      lookY = easeInOut(t) * 0.01
    } else if (t < 2) {
      // Hold left, slight head tilt
      lookX = -0.03
      lookY = 0.01
      parts.head.rotation.z = Math.sin((t - 1) * Math.PI) * 0.05
    } else if (t < 3) {
      // Look right
      const rt = t - 2
      lookX = -0.03 + easeInOut(rt) * 0.06
      lookY = 0.01 - easeInOut(rt) * 0.02
    } else {
      // Return to center
      const rt = t - 3
      lookX = 0.03 - easeOut(rt) * 0.03
      lookY = -0.01 + easeOut(rt) * 0.01
      parts.head.rotation.z = 0
    }

    parts.leftEye.position.x = -0.07 + lookX
    parts.rightEye.position.x = 0.07 + lookX
    parts.leftEye.position.y = 0.03 + lookY
    parts.rightEye.position.y = 0.03 + lookY
  },
  reset: (parts) => {
    parts.leftEye.position.set(-0.07, 0.03, 0.242)
    parts.rightEye.position.set(0.07, 0.03, 0.242)
    parts.head.rotation.z = 0
  }
}

const curiousTilt: IdleBehavior = {
  name: 'curiousTilt',
  duration: 2,
  weight: 8,
  update: (parts, progress) => {
    // Tilt head curiously, antenna perks up
    const t = progress < 0.5 ? easeOut(progress * 2) : easeIn((1 - progress) * 2)

    parts.head.rotation.z = t * 0.15
    parts.antenna.rotation.z = -t * 0.2
    parts.antenna.rotation.x = -t * 0.1

    // Eyes widen slightly
    const eyeScale = 1 + t * 0.15
    parts.leftEye.scale.setScalar(eyeScale)
    parts.rightEye.scale.setScalar(eyeScale)
  },
  reset: (parts) => {
    parts.head.rotation.z = 0
    parts.antenna.rotation.z = 0
    parts.antenna.rotation.x = 0
    parts.leftEye.scale.setScalar(1)
    parts.rightEye.scale.setScalar(1)
  }
}

const happyBounce: IdleBehavior = {
  name: 'happyBounce',
  duration: 1.5,
  weight: 6,
  update: (parts, progress) => {
    // Quick happy bounces - whole body bounces!
    const bounceCount = 3
    const t = progress * bounceCount
    const bouncePhase = t % 1
    const bounceHeight = bounce(bouncePhase) * 0.12 * (1 - progress * 0.5)

    // Bounce the whole mesh, not just the head
    parts.mesh.position.y = (parts.mesh.userData.originalY ?? 0) + bounceHeight

    // Arms swing with bounces
    const armSwing = Math.sin(t * Math.PI * 2) * 0.3
    parts.leftArm.rotation.x = armSwing
    parts.rightArm.rotation.x = -armSwing
    parts.leftArm.rotation.z = -0.1 - Math.abs(armSwing) * 0.2
    parts.rightArm.rotation.z = 0.1 + Math.abs(armSwing) * 0.2

    // Antenna bounces with energy
    parts.antenna.rotation.x = Math.sin(t * Math.PI * 2) * 0.2
    parts.antenna.rotation.z = Math.sin(t * Math.PI * 4) * 0.1
  },
  reset: (parts) => {
    parts.mesh.position.y = parts.mesh.userData.originalY ?? 0
    parts.leftArm.rotation.set(0, 0, 0)
    parts.rightArm.rotation.set(0, 0, 0)
    parts.antenna.rotation.set(0, 0, 0)
  }
}

const stretch: IdleBehavior = {
  name: 'stretch',
  duration: 2.5,
  weight: 5,
  update: (parts, progress) => {
    // Big stretch - arms up, lean back
    let armRaise = 0
    let lean = 0

    if (progress < 0.3) {
      // Arms going up
      const t = easeOut(progress / 0.3)
      armRaise = t
      lean = t * 0.1
    } else if (progress < 0.7) {
      // Hold stretch
      armRaise = 1
      lean = 0.1
      // Slight wiggle at peak
      const wiggle = Math.sin((progress - 0.3) * 20) * 0.02
      parts.leftArm.rotation.z = -0.3 + wiggle
      parts.rightArm.rotation.z = 0.3 - wiggle
    } else {
      // Arms coming down
      const t = easeIn((progress - 0.7) / 0.3)
      armRaise = 1 - t
      lean = 0.1 * (1 - t)
    }

    parts.leftArm.rotation.x = -armRaise * 2.5
    parts.rightArm.rotation.x = -armRaise * 2.5
    parts.leftArm.rotation.z = -armRaise * 0.3
    parts.rightArm.rotation.z = armRaise * 0.3
    parts.head.rotation.x = lean

    // Eyes close slightly during stretch
    const eyeSquint = armRaise * 0.5
    parts.leftEye.scale.y = 1 - eyeSquint
    parts.rightEye.scale.y = 1 - eyeSquint
  },
  reset: (parts) => {
    parts.leftArm.rotation.set(0, 0, 0)
    parts.rightArm.rotation.set(0, 0, 0)
    parts.head.rotation.x = 0
    parts.leftEye.scale.setScalar(1)
    parts.rightEye.scale.setScalar(1)
  }
}

const wave: IdleBehavior = {
  name: 'wave',
  duration: 2,
  weight: 4,
  update: (parts, progress) => {
    // Friendly wave!
    let armUp = 0
    let waveAngle = 0

    if (progress < 0.2) {
      // Raise arm
      armUp = easeOut(progress / 0.2)
    } else if (progress < 0.8) {
      // Wave back and forth
      armUp = 1
      const waveProgress = (progress - 0.2) / 0.6
      waveAngle = Math.sin(waveProgress * Math.PI * 4) * 0.4
    } else {
      // Lower arm
      armUp = 1 - easeIn((progress - 0.8) / 0.2)
    }

    parts.rightArm.rotation.x = -armUp * 2.2
    parts.rightArm.rotation.z = armUp * 0.5 + waveAngle

    // Look at "camera" while waving
    if (progress > 0.1 && progress < 0.9) {
      parts.leftEye.position.z = 0.242 + 0.01
      parts.rightEye.position.z = 0.242 + 0.01
    }
  },
  reset: (parts) => {
    parts.rightArm.rotation.set(0, 0, 0)
    parts.leftEye.position.z = 0.242
    parts.rightEye.position.z = 0.242
  }
}

const doubleBlink: IdleBehavior = {
  name: 'doubleBlink',
  duration: 0.6,
  weight: 12,
  update: (parts, progress) => {
    // Quick double blink
    const t = progress * 2
    let eyeScale = 1

    if (t < 0.5) {
      // First blink
      eyeScale = t < 0.25 ? 1 - easeIn(t * 4) * 0.9 : 0.1 + easeOut((t - 0.25) * 4) * 0.9
    } else if (t < 1) {
      // Pause
      eyeScale = 1
    } else if (t < 1.5) {
      // Second blink
      const bt = t - 1
      eyeScale = bt < 0.25 ? 1 - easeIn(bt * 4) * 0.9 : 0.1 + easeOut((bt - 0.25) * 4) * 0.9
    }

    parts.leftEye.scale.setScalar(eyeScale)
    parts.rightEye.scale.setScalar(eyeScale)
  },
  reset: (parts) => {
    parts.leftEye.scale.setScalar(1)
    parts.rightEye.scale.setScalar(1)
  }
}

const antennaTwitch: IdleBehavior = {
  name: 'antennaTwitch',
  duration: 0.8,
  weight: 15,
  update: (parts, progress) => {
    // Quick antenna twitch like picking up a signal
    const t = progress
    let twitch = 0

    if (t < 0.2) {
      twitch = easeOut(t / 0.2) * 0.4
    } else if (t < 0.4) {
      twitch = 0.4 - easeIn((t - 0.2) / 0.2) * 0.5
    } else if (t < 0.6) {
      twitch = -0.1 + easeOut((t - 0.4) / 0.2) * 0.25
    } else {
      twitch = 0.15 * (1 - easeOut((t - 0.6) / 0.4))
    }

    parts.antenna.rotation.z = twitch
    parts.antenna.rotation.x = Math.abs(twitch) * 0.3
  },
  reset: (parts) => {
    parts.antenna.rotation.z = 0
    parts.antenna.rotation.x = 0
  }
}

const headShake: IdleBehavior = {
  name: 'headShake',
  duration: 1,
  weight: 5,
  update: (parts, progress) => {
    // Playful head shake (like "no no no" but cute)
    const shakes = 3
    const t = progress * shakes
    const shake = Math.sin(t * Math.PI * 2) * (1 - progress) * 0.1

    parts.head.rotation.y = shake

    // Eyes follow slightly
    parts.leftEye.position.x = -0.07 - shake * 0.5
    parts.rightEye.position.x = 0.07 - shake * 0.5
  },
  reset: (parts) => {
    parts.head.rotation.y = 0
    parts.leftEye.position.x = -0.07
    parts.rightEye.position.x = 0.07
  }
}

const peek: IdleBehavior = {
  name: 'peek',
  duration: 2.5,
  weight: 4,
  update: (parts, progress) => {
    // Peek to the side like looking around a corner
    let lean = 0
    let eyeShift = 0

    if (progress < 0.3) {
      // Lean to peek
      lean = easeOut(progress / 0.3)
      eyeShift = lean
    } else if (progress < 0.7) {
      // Hold and look around
      lean = 1
      const lookPhase = (progress - 0.3) / 0.4
      eyeShift = 1 + Math.sin(lookPhase * Math.PI * 2) * 0.3
    } else {
      // Return
      lean = 1 - easeIn((progress - 0.7) / 0.3)
      eyeShift = lean
    }

    parts.mesh.rotation.z = lean * 0.15
    parts.head.rotation.z = -lean * 0.1  // Counter-tilt head
    parts.leftEye.position.x = -0.07 + eyeShift * 0.02
    parts.rightEye.position.x = 0.07 + eyeShift * 0.02
  },
  reset: (parts) => {
    parts.mesh.rotation.z = 0
    parts.head.rotation.z = 0
    parts.leftEye.position.x = -0.07
    parts.rightEye.position.x = 0.07
  }
}

const sleepyNod: IdleBehavior = {
  name: 'sleepyNod',
  duration: 3,
  weight: 3,
  update: (parts, progress) => {
    // Getting sleepy... head nods forward then snaps back
    let nod = 0
    let eyeOpen = 1

    if (progress < 0.5) {
      // Slowly nodding off
      const t = easeIn(progress * 2)
      nod = t * 0.2
      eyeOpen = 1 - t * 0.7
    } else if (progress < 0.55) {
      // Snap awake!
      const t = (progress - 0.5) / 0.05
      nod = 0.2 - t * 0.25
      eyeOpen = 0.3 + t * 0.9
    } else {
      // Shake it off
      const t = (progress - 0.55) / 0.45
      nod = -0.05 * (1 - easeOut(t))
      eyeOpen = 1.2 - t * 0.2
      // Little head shake
      parts.head.rotation.y = Math.sin(t * Math.PI * 4) * 0.05 * (1 - t)
    }

    parts.head.rotation.x = nod
    parts.leftEye.scale.y = Math.max(0.1, eyeOpen)
    parts.rightEye.scale.y = Math.max(0.1, eyeOpen)
    parts.antenna.rotation.x = nod * 0.5
  },
  reset: (parts) => {
    parts.head.rotation.x = 0
    parts.head.rotation.y = 0
    parts.leftEye.scale.setScalar(1)
    parts.rightEye.scale.setScalar(1)
    parts.antenna.rotation.x = 0
  }
}

// ----------------------------------------------------------------------------
// Dance Styles - Various dance moves for extra entertainment!
// ----------------------------------------------------------------------------

const discoFever: IdleBehavior = {
  name: 'discoFever',
  duration: 4,
  weight: 3,
  update: (parts, progress) => {
    // Classic disco: point up alternating arms, hip sway
    const beatTime = progress * 8
    const beat = Math.floor(beatTime) % 4
    const beatProgress = beatTime % 1

    // Hip sway side to side
    const sway = Math.sin(beatTime * Math.PI * 0.5) * 0.1
    parts.mesh.position.x = (parts.mesh.userData.originalX ?? 0) + sway
    parts.body.rotation.z = -sway * 0.8

    // Bounce on each beat
    const bounce = Math.abs(Math.sin(beatProgress * Math.PI)) * 0.05
    parts.mesh.position.y = (parts.mesh.userData.originalY ?? 0) + bounce

    // Alternating arm points to the sky!
    if (beat < 2) {
      // Right arm up pointing
      parts.rightArm.rotation.x = -2.5
      parts.rightArm.rotation.z = 0.3 + Math.sin(beatProgress * Math.PI) * 0.2
      parts.leftArm.rotation.x = 0.3
      parts.leftArm.rotation.z = -0.2
    } else {
      // Left arm up pointing
      parts.leftArm.rotation.x = -2.5
      parts.leftArm.rotation.z = -0.3 - Math.sin(beatProgress * Math.PI) * 0.2
      parts.rightArm.rotation.x = 0.3
      parts.rightArm.rotation.z = 0.2
    }

    // Head follows the pointing arm
    parts.head.rotation.z = beat < 2 ? 0.1 : -0.1
    parts.head.rotation.y = beat < 2 ? 0.15 : -0.15
  },
  reset: (parts) => {
    parts.mesh.position.x = parts.mesh.userData.originalX ?? 0
    parts.mesh.position.y = parts.mesh.userData.originalY ?? 0
    parts.body.rotation.z = 0
    parts.leftArm.rotation.set(0, 0, 0)
    parts.rightArm.rotation.set(0, 0, 0)
    parts.head.rotation.set(0, 0, 0)
  }
}

const robotDance: IdleBehavior = {
  name: 'robotDance',
  duration: 3.5,
  weight: 3,
  update: (parts, progress) => {
    // Mechanical robot dance - stiff, isolated movements
    const phase = Math.floor(progress * 7) % 7
    const phaseProgress = (progress * 7) % 1
    const snap = phaseProgress < 0.2 ? easeOut(phaseProgress * 5) : 1

    // Reset all rotations first
    parts.leftArm.rotation.set(0, 0, 0)
    parts.rightArm.rotation.set(0, 0, 0)
    parts.head.rotation.set(0, 0, 0)

    switch (phase) {
      case 0: // Arms out horizontal
        parts.leftArm.rotation.z = -1.5 * snap
        parts.rightArm.rotation.z = 1.5 * snap
        break
      case 1: // Arms bent at elbow (not possible with current rig, so arms forward)
        parts.leftArm.rotation.x = -1.5 * snap
        parts.rightArm.rotation.x = -1.5 * snap
        break
      case 2: // Head turn left
        parts.head.rotation.y = -0.4 * snap
        parts.leftArm.rotation.x = -1.5
        parts.rightArm.rotation.x = -1.5
        break
      case 3: // Head turn right
        parts.head.rotation.y = 0.4 * snap
        parts.leftArm.rotation.x = -1.5
        parts.rightArm.rotation.x = -1.5
        break
      case 4: // Body tilt left
        parts.mesh.rotation.z = 0.15 * snap
        parts.head.rotation.z = -0.1 * snap
        break
      case 5: // Body tilt right
        parts.mesh.rotation.z = -0.15 * snap
        parts.head.rotation.z = 0.1 * snap
        break
      case 6: // Return to center with bounce
        const returnSnap = phaseProgress < 0.3 ? easeOut(phaseProgress * 3.3) : 1
        parts.mesh.position.y = (parts.mesh.userData.originalY ?? 0) + (1 - returnSnap) * 0.05
        break
    }
  },
  reset: (parts) => {
    parts.mesh.position.y = parts.mesh.userData.originalY ?? 0
    parts.mesh.rotation.z = 0
    parts.leftArm.rotation.set(0, 0, 0)
    parts.rightArm.rotation.set(0, 0, 0)
    parts.head.rotation.set(0, 0, 0)
  }
}

const headBanger: IdleBehavior = {
  name: 'headBanger',
  duration: 2.5,
  weight: 2,
  update: (parts, progress) => {
    // Head banging! Heavy metal style
    const bangSpeed = 6
    const t = progress * bangSpeed
    const bangPhase = t % 1

    // Intense head bang forward
    const bangAngle = Math.sin(bangPhase * Math.PI) * 0.4
    parts.head.rotation.x = bangAngle

    // Arms pump with the beat
    const armPump = Math.sin(bangPhase * Math.PI) * 0.5
    parts.leftArm.rotation.x = -0.5 - armPump
    parts.rightArm.rotation.x = -0.5 - armPump
    parts.leftArm.rotation.z = -0.3
    parts.rightArm.rotation.z = 0.3

    // Slight body movement
    parts.body.rotation.x = bangAngle * 0.3

    // Antenna goes wild
    parts.antenna.rotation.x = -bangAngle * 0.8
    parts.antenna.rotation.z = Math.sin(t * Math.PI * 2) * 0.2
  },
  reset: (parts) => {
    parts.head.rotation.x = 0
    parts.body.rotation.x = 0
    parts.leftArm.rotation.set(0, 0, 0)
    parts.rightArm.rotation.set(0, 0, 0)
    parts.antenna.rotation.set(0, 0, 0)
  }
}

const shuffleDance: IdleBehavior = {
  name: 'shuffleDance',
  duration: 3,
  weight: 3,
  update: (parts, progress) => {
    // Shuffle side to side with arm pumps
    const beatTime = progress * 6
    const beat = Math.floor(beatTime) % 2
    const beatProgress = beatTime % 1

    // Shuffle position - quick snap to side, then slide back
    const shuffleEase = beat === 0
      ? (beatProgress < 0.2 ? easeOut(beatProgress * 5) : 1 - easeIn((beatProgress - 0.2) / 0.8) * 0.5)
      : (beatProgress < 0.2 ? easeOut(beatProgress * 5) : 1 - easeIn((beatProgress - 0.2) / 0.8) * 0.5)

    const shuffleX = beat === 0 ? shuffleEase * 0.15 : -shuffleEase * 0.15
    parts.mesh.position.x = (parts.mesh.userData.originalX ?? 0) + shuffleX

    // Body leans into the shuffle
    parts.mesh.rotation.z = -shuffleX * 2

    // Bounce on beat
    const bounce = Math.sin(beatProgress * Math.PI) * 0.06
    parts.mesh.position.y = (parts.mesh.userData.originalY ?? 0) + bounce

    // Arms pump up and down
    const armPump = Math.sin(beatProgress * Math.PI) * 0.8
    parts.leftArm.rotation.x = -0.3 - armPump
    parts.rightArm.rotation.x = -0.3 - armPump

    // Head bops
    parts.head.rotation.z = shuffleX * 1.5
  },
  reset: (parts) => {
    parts.mesh.position.x = parts.mesh.userData.originalX ?? 0
    parts.mesh.position.y = parts.mesh.userData.originalY ?? 0
    parts.mesh.rotation.z = 0
    parts.leftArm.rotation.set(0, 0, 0)
    parts.rightArm.rotation.set(0, 0, 0)
    parts.head.rotation.z = 0
  }
}

const twistDance: IdleBehavior = {
  name: 'twistDance',
  duration: 3,
  weight: 3,
  update: (parts, progress) => {
    // Classic twist dance - rotate hips/body opposite to shoulders
    const twistTime = progress * 4
    const twist = Math.sin(twistTime * Math.PI * 2) * 0.2

    // Body twists one way
    parts.body.rotation.y = twist

    // Head/shoulders twist the other way
    parts.head.rotation.y = -twist * 0.8

    // Arms out and swinging
    parts.leftArm.rotation.z = -0.5
    parts.rightArm.rotation.z = 0.5
    parts.leftArm.rotation.y = twist * 2
    parts.rightArm.rotation.y = twist * 2

    // Bounce while twisting
    const bounce = Math.abs(Math.sin(twistTime * Math.PI * 2)) * 0.04
    parts.mesh.position.y = (parts.mesh.userData.originalY ?? 0) + bounce

    // Slight side to side
    parts.mesh.position.x = (parts.mesh.userData.originalX ?? 0) + twist * 0.3
  },
  reset: (parts) => {
    parts.body.rotation.y = 0
    parts.head.rotation.y = 0
    parts.leftArm.rotation.set(0, 0, 0)
    parts.rightArm.rotation.set(0, 0, 0)
    parts.mesh.position.x = parts.mesh.userData.originalX ?? 0
    parts.mesh.position.y = parts.mesh.userData.originalY ?? 0
  }
}

const victoryDance: IdleBehavior = {
  name: 'victoryDance',
  duration: 2.5,
  weight: 2,
  update: (parts, progress) => {
    // Celebratory fist pumps and jumping!
    const beatTime = progress * 5
    const beat = Math.floor(beatTime) % 2
    const beatProgress = beatTime % 1

    // Jump up!
    const jumpHeight = Math.sin(beatProgress * Math.PI) * 0.15
    parts.mesh.position.y = (parts.mesh.userData.originalY ?? 0) + jumpHeight

    // Alternating fist pumps
    if (beat === 0) {
      parts.rightArm.rotation.x = -2.8
      parts.rightArm.rotation.z = 0.2 + Math.sin(beatProgress * Math.PI) * 0.3
      parts.leftArm.rotation.x = -0.5
      parts.leftArm.rotation.z = -0.2
    } else {
      parts.leftArm.rotation.x = -2.8
      parts.leftArm.rotation.z = -0.2 - Math.sin(beatProgress * Math.PI) * 0.3
      parts.rightArm.rotation.x = -0.5
      parts.rightArm.rotation.z = 0.2
    }

    // Happy head movements
    parts.head.rotation.z = Math.sin(beatTime * Math.PI * 2) * 0.1
    parts.head.rotation.y = Math.sin(beatTime * Math.PI) * 0.1

    // Eyes excited (slightly bigger)
    const excitement = 1 + Math.sin(beatProgress * Math.PI) * 0.1
    parts.leftEye.scale.setScalar(excitement)
    parts.rightEye.scale.setScalar(excitement)
  },
  reset: (parts) => {
    parts.mesh.position.y = parts.mesh.userData.originalY ?? 0
    parts.leftArm.rotation.set(0, 0, 0)
    parts.rightArm.rotation.set(0, 0, 0)
    parts.head.rotation.set(0, 0, 0)
    parts.leftEye.scale.setScalar(1)
    parts.rightEye.scale.setScalar(1)
  }
}

const danceMoves: IdleBehavior = {
  name: 'grooveDance',
  duration: 3,
  weight: 3,
  update: (parts, progress) => {
    // Little dance! Side to side with arm moves
    const beatTime = progress * 8
    const beat = Math.floor(beatTime) % 4
    const beatProgress = beatTime % 1

    // Body sway
    const sway = Math.sin(beatTime * Math.PI) * 0.08
    parts.mesh.position.x = (parts.mesh.userData.originalX ?? 0) + sway
    parts.mesh.rotation.z = -sway * 0.3

    // Bounce on beat
    const bouncePhase = Math.abs(Math.sin(beatProgress * Math.PI))
    parts.head.position.y = 0.52 + bouncePhase * 0.04

    // Arms move based on beat
    if (beat === 0 || beat === 2) {
      parts.leftArm.rotation.z = -0.3 - bouncePhase * 0.2
      parts.rightArm.rotation.z = 0.3 + bouncePhase * 0.2
    } else {
      parts.leftArm.rotation.x = -bouncePhase * 0.5
      parts.rightArm.rotation.x = -bouncePhase * 0.5
    }

    // Head bop
    parts.head.rotation.z = Math.sin(beatTime * Math.PI * 2) * 0.05
  },
  reset: (parts) => {
    parts.mesh.position.x = parts.mesh.userData.originalX ?? 0
    parts.mesh.rotation.z = 0
    parts.head.position.y = 0.52
    parts.head.rotation.z = 0
    parts.leftArm.rotation.set(0, 0, 0)
    parts.rightArm.rotation.set(0, 0, 0)
  }
}

// ============================================================================
// Behavior Registry - Add/remove behaviors here!
// ============================================================================

export const IDLE_BEHAVIORS: IdleBehavior[] = [
  // Basic idle animations
  lookAround,
  curiousTilt,
  happyBounce,
  stretch,
  wave,
  doubleBlink,
  antennaTwitch,
  headShake,
  peek,
  sleepyNod,
  // Dance styles!
  danceMoves,       // grooveDance - basic side-to-side
  discoFever,       // 70s disco pointing
  robotDance,       // mechanical stiff moves
  headBanger,       // metal head bang
  shuffleDance,     // side shuffle with arm pumps
  twistDance,       // classic 60s twist
  victoryDance,     // celebratory fist pumps
]

// ============================================================================
// Behavior Manager
// ============================================================================

export class IdleBehaviorManager {
  private behaviors: IdleBehavior[]
  private currentBehavior: IdleBehavior | null = null
  private behaviorProgress = 0
  private cooldown = 0  // Time until next behavior can start

  // === TUNING ===
  private readonly MIN_COOLDOWN = 2    // Minimum seconds between behaviors
  private readonly MAX_COOLDOWN = 6    // Maximum seconds between behaviors
  private readonly BASE_IDLE_WEIGHT = 20  // Weight for "do nothing" (just base idle)

  constructor(behaviors: IdleBehavior[] = IDLE_BEHAVIORS) {
    this.behaviors = behaviors
    this.cooldown = this.randomCooldown()
  }

  private randomCooldown(): number {
    return this.MIN_COOLDOWN + Math.random() * (this.MAX_COOLDOWN - this.MIN_COOLDOWN)
  }

  private pickBehavior(): IdleBehavior | null {
    // Calculate total weight including "do nothing"
    const totalWeight = this.behaviors.reduce((sum, b) => sum + b.weight, 0) + this.BASE_IDLE_WEIGHT

    let roll = Math.random() * totalWeight

    // Check if we rolled "do nothing"
    if (roll < this.BASE_IDLE_WEIGHT) {
      return null
    }
    roll -= this.BASE_IDLE_WEIGHT

    // Find which behavior we rolled
    for (const behavior of this.behaviors) {
      roll -= behavior.weight
      if (roll <= 0) {
        return behavior
      }
    }

    return null
  }

  /**
   * Update the behavior manager
   * @returns true if a behavior is currently playing
   */
  update(parts: CharacterParts, deltaTime: number): boolean {
    // If a behavior is playing, continue it
    if (this.currentBehavior) {
      this.behaviorProgress += deltaTime / this.currentBehavior.duration

      if (this.behaviorProgress >= 1) {
        // Behavior finished
        this.currentBehavior.reset?.(parts)
        this.currentBehavior = null
        this.behaviorProgress = 0
        this.cooldown = this.randomCooldown()
        return false
      }

      // Run the behavior
      this.currentBehavior.update(parts, this.behaviorProgress, deltaTime)
      return true
    }

    // No behavior playing - count down cooldown
    this.cooldown -= deltaTime
    if (this.cooldown <= 0) {
      // Try to start a new behavior
      this.currentBehavior = this.pickBehavior()
      if (this.currentBehavior) {
        this.behaviorProgress = 0
        // Store original position for behaviors that move the mesh
        parts.mesh.userData.originalX = parts.mesh.position.x
        parts.mesh.userData.originalY = parts.mesh.position.y
        return true
      } else {
        // Rolled "do nothing", set new cooldown
        this.cooldown = this.randomCooldown()
      }
    }

    return false
  }

  /** Force stop current behavior */
  stop(parts: CharacterParts): void {
    if (this.currentBehavior) {
      this.currentBehavior.reset?.(parts)
      this.currentBehavior = null
      this.behaviorProgress = 0
    }
  }

  /** Check if a behavior is currently playing */
  isPlaying(): boolean {
    return this.currentBehavior !== null
  }

  /** Get current behavior name (for debugging) */
  getCurrentBehaviorName(): string | null {
    return this.currentBehavior?.name ?? null
  }

  /** Get list of all behavior names (for dev UI) */
  getBehaviorNames(): string[] {
    return this.behaviors.map(b => b.name)
  }

  /** Force play a specific behavior by name (for dev/testing) */
  forcePlay(name: string, parts: CharacterParts): boolean {
    const behavior = this.behaviors.find(b => b.name === name)
    if (!behavior) return false

    // Stop current behavior if any
    if (this.currentBehavior) {
      this.currentBehavior.reset?.(parts)
    }

    // Start the requested behavior
    this.currentBehavior = behavior
    this.behaviorProgress = 0
    parts.mesh.userData.originalX = parts.mesh.position.x
    parts.mesh.userData.originalY = parts.mesh.position.y
    return true
  }

  /** Force play a random behavior (guaranteed to play, ignores "do nothing" weight) */
  forcePlayRandom(parts: CharacterParts): string | null {
    if (this.behaviors.length === 0) return null

    // Pick a random behavior (weighted, but excluding "do nothing")
    const totalWeight = this.behaviors.reduce((sum, b) => sum + b.weight, 0)
    let roll = Math.random() * totalWeight

    let chosen: IdleBehavior | null = null
    for (const behavior of this.behaviors) {
      roll -= behavior.weight
      if (roll <= 0) {
        chosen = behavior
        break
      }
    }

    // Fallback to first behavior if somehow nothing was chosen
    if (!chosen) chosen = this.behaviors[0]

    // Stop current behavior if any
    if (this.currentBehavior) {
      this.currentBehavior.reset?.(parts)
    }

    // Start the chosen behavior
    this.currentBehavior = chosen
    this.behaviorProgress = 0
    parts.mesh.userData.originalX = parts.mesh.position.x
    parts.mesh.userData.originalY = parts.mesh.position.y

    return chosen.name
  }
}

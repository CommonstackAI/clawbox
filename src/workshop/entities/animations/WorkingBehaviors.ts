/**
 * WorkingBehaviors - Station-specific animations for ClaudeMon
 *
 * These animations play when Claude is "working" at a specific station.
 * Each station has its own contextual animation.
 *
 * To add a new station animation:
 * 1. Create a WorkingBehavior object
 * 2. Add it to STATION_ANIMATIONS with the station name as key
 */

import {
  type CharacterParts,
  type WorkingBehavior,
  easeInOut,
  easeOut,
  pingPong,
  elastic,
  bounce,
} from './AnimationTypes'

// Re-export for convenience
export type { WorkingBehavior } from './AnimationTypes'

export type StationAnimations = {
  [station: string]: WorkingBehavior[]
}

// ============================================================================
// Station Working Animations
// ============================================================================

/** Bookshelf (Read) - Reading a book, flipping pages */
const readingBook: WorkingBehavior = {
  name: 'readingBook',
  loop: true,
  duration: 4,
  update: (parts, progress) => {
    // Hold arms like reading a book
    parts.leftArm.rotation.x = -1.2
    parts.leftArm.rotation.z = -0.3
    parts.rightArm.rotation.x = -1.2
    parts.rightArm.rotation.z = 0.3

    // Eyes scan left to right (reading)
    const readCycle = progress * 3  // 3 lines per cycle
    const lineProgress = readCycle % 1
    const eyeX = (lineProgress < 0.8)
      ? -0.02 + easeInOut(lineProgress / 0.8) * 0.04  // Read left to right
      : 0.02 - easeOut((lineProgress - 0.8) / 0.2) * 0.04  // Quick return

    parts.leftEye.position.x = -0.07 + eyeX
    parts.rightEye.position.x = 0.07 + eyeX

    // Slight head tilt while reading
    parts.head.rotation.x = 0.15  // Looking down at book
    parts.head.rotation.z = Math.sin(progress * Math.PI * 2) * 0.03

    // Occasional page flip (at progress 0.5)
    if (progress > 0.48 && progress < 0.55) {
      const flipProgress = (progress - 0.48) / 0.07
      parts.rightArm.rotation.z = 0.3 + Math.sin(flipProgress * Math.PI) * 0.4
    }
  },
  reset: (parts) => {
    parts.leftArm.rotation.set(0, 0, 0)
    parts.rightArm.rotation.set(0, 0, 0)
    parts.leftEye.position.x = -0.07
    parts.rightEye.position.x = 0.07
    parts.head.rotation.set(0, 0, 0)
  }
}

/** Workbench (Edit) - Using tools, tinkering */
const tinkering: WorkingBehavior = {
  name: 'tinkering',
  loop: true,
  duration: 2.5,
  update: (parts, progress) => {
    // One arm holds work, other arm uses tool
    parts.leftArm.rotation.x = -0.8
    parts.leftArm.rotation.z = -0.2

    // Right arm hammering/working motion
    const workCycle = progress * 4
    const hammerPhase = workCycle % 1
    const hammerMotion = Math.sin(hammerPhase * Math.PI) * 0.6
    parts.rightArm.rotation.x = -1.0 - hammerMotion
    parts.rightArm.rotation.z = 0.1

    // Head follows the work
    parts.head.rotation.x = 0.1
    parts.head.rotation.y = Math.sin(progress * Math.PI * 2) * 0.1

    // Body slight lean into work
    parts.body.rotation.x = 0.05

    // Eyes focused
    const focus = Math.sin(workCycle * Math.PI) * 0.01
    parts.leftEye.position.y = 0.03 + focus
    parts.rightEye.position.y = 0.03 + focus
  },
  reset: (parts) => {
    parts.leftArm.rotation.set(0, 0, 0)
    parts.rightArm.rotation.set(0, 0, 0)
    parts.head.rotation.set(0, 0, 0)
    parts.body.rotation.x = 0
    parts.leftEye.position.y = 0.03
    parts.rightEye.position.y = 0.03
  }
}

/** Desk (Write) - Writing, thinking, scratching head */
const writing: WorkingBehavior = {
  name: 'writing',
  loop: true,
  duration: 3,
  update: (parts, progress) => {
    // Writing arm motion
    const writeCycle = progress * 6
    const writePhase = writeCycle % 1

    // Right arm writing small movements
    parts.rightArm.rotation.x = -1.0
    parts.rightArm.rotation.z = 0.2 + Math.sin(writePhase * Math.PI * 2) * 0.15
    parts.rightArm.rotation.y = Math.sin(writePhase * Math.PI * 4) * 0.1

    // Left arm resting on desk
    parts.leftArm.rotation.x = -0.6
    parts.leftArm.rotation.z = -0.4

    // Head looking down at paper
    parts.head.rotation.x = 0.2

    // Occasional pause to think (every cycle)
    const thinkPause = Math.floor(writeCycle) % 3 === 2
    if (thinkPause && writePhase < 0.5) {
      parts.head.rotation.x = 0.05  // Look up thinking
      parts.head.rotation.z = 0.1
      parts.rightArm.rotation.x = -0.8  // Pause writing
    }

    // Eyes follow writing
    parts.leftEye.position.x = -0.07 + Math.sin(writePhase * Math.PI * 2) * 0.01
    parts.rightEye.position.x = 0.07 + Math.sin(writePhase * Math.PI * 2) * 0.01
  },
  reset: (parts) => {
    parts.leftArm.rotation.set(0, 0, 0)
    parts.rightArm.rotation.set(0, 0, 0)
    parts.head.rotation.set(0, 0, 0)
    parts.leftEye.position.x = -0.07
    parts.rightEye.position.x = 0.07
  }
}

/** Terminal (Bash) - Typing rapidly, looking at screen */
const typing: WorkingBehavior = {
  name: 'typing',
  loop: true,
  duration: 2,
  update: (parts, progress) => {
    // Both arms in typing position
    const typeCycle = progress * 12  // Fast typing
    const typePhase = typeCycle % 1

    // Alternating arm typing motions
    const leftType = Math.sin(typePhase * Math.PI * 2) * 0.1
    const rightType = Math.sin((typePhase + 0.5) * Math.PI * 2) * 0.1

    parts.leftArm.rotation.x = -0.7 + leftType
    parts.leftArm.rotation.z = -0.3
    parts.rightArm.rotation.x = -0.7 + rightType
    parts.rightArm.rotation.z = 0.3

    // Eyes scanning screen
    const scanX = Math.sin(progress * Math.PI * 4) * 0.02
    parts.leftEye.position.x = -0.07 + scanX
    parts.rightEye.position.x = 0.07 + scanX

    // Occasional head nod (understanding output)
    const nodCycle = Math.floor(progress * 4) % 4
    if (nodCycle === 3) {
      parts.head.rotation.x = Math.sin((progress * 4 % 1) * Math.PI) * 0.1
    }

    // Slight forward lean (focused)
    parts.body.rotation.x = 0.05
  },
  reset: (parts) => {
    parts.leftArm.rotation.set(0, 0, 0)
    parts.rightArm.rotation.set(0, 0, 0)
    parts.leftEye.position.x = -0.07
    parts.rightEye.position.x = 0.07
    parts.head.rotation.x = 0
    parts.body.rotation.x = 0
  }
}

/** Scanner (Grep/Glob) - Scanning, searching, peering */
const scanning: WorkingBehavior = {
  name: 'scanning',
  loop: true,
  duration: 3,
  update: (parts, progress) => {
    // Hand shading eyes, searching pose
    parts.rightArm.rotation.x = -2.0
    parts.rightArm.rotation.z = 0.5
    parts.rightArm.rotation.y = -0.3

    // Other arm at side or pointing
    const pointPhase = progress * 2
    if (Math.floor(pointPhase) % 2 === 1) {
      // Pointing at something found
      parts.leftArm.rotation.x = -1.5
      parts.leftArm.rotation.z = -0.3
    } else {
      parts.leftArm.rotation.x = 0
      parts.leftArm.rotation.z = 0
    }

    // Head scanning left to right
    const scanAngle = Math.sin(progress * Math.PI * 2) * 0.3
    parts.head.rotation.y = scanAngle

    // Eyes wide, searching
    parts.leftEye.scale.setScalar(1.1)
    parts.rightEye.scale.setScalar(1.1)

    // Eyes follow head direction
    parts.leftEye.position.x = -0.07 + scanAngle * 0.05
    parts.rightEye.position.x = 0.07 + scanAngle * 0.05

    // Slight body turn with head
    parts.body.rotation.y = scanAngle * 0.3
  },
  reset: (parts) => {
    parts.leftArm.rotation.set(0, 0, 0)
    parts.rightArm.rotation.set(0, 0, 0)
    parts.head.rotation.y = 0
    parts.body.rotation.y = 0
    parts.leftEye.scale.setScalar(1)
    parts.rightEye.scale.setScalar(1)
    parts.leftEye.position.x = -0.07
    parts.rightEye.position.x = 0.07
  }
}

/** Antenna (WebFetch/WebSearch) - Receiving signals, tuning */
const receiving: WorkingBehavior = {
  name: 'receiving',
  loop: true,
  duration: 2.5,
  update: (parts, progress) => {
    // Antenna actively receiving - wobbles and perks
    const signalStrength = Math.sin(progress * Math.PI * 8) * 0.3
    parts.antenna.rotation.z = signalStrength
    parts.antenna.rotation.x = -0.1 + Math.abs(signalStrength) * 0.2

    // Hand to "ear" (antenna) like listening
    parts.rightArm.rotation.x = -2.2
    parts.rightArm.rotation.z = 0.8
    parts.rightArm.rotation.y = 0.3

    // Other hand adjusting/tuning gesture
    const tunePhase = progress * 4
    parts.leftArm.rotation.x = -1.0
    parts.leftArm.rotation.z = -0.2 + Math.sin(tunePhase * Math.PI) * 0.2

    // Head tilted, listening
    parts.head.rotation.z = 0.15
    parts.head.rotation.y = 0.1

    // Eyes looking up at antenna/signal direction
    parts.leftEye.position.y = 0.03 + 0.01
    parts.rightEye.position.y = 0.03 + 0.01
  },
  reset: (parts) => {
    parts.antenna.rotation.set(0, 0, 0)
    parts.leftArm.rotation.set(0, 0, 0)
    parts.rightArm.rotation.set(0, 0, 0)
    parts.head.rotation.set(0, 0, 0)
    parts.leftEye.position.y = 0.03
    parts.rightEye.position.y = 0.03
  }
}

/** Portal (Task) - Mystical gestures, channeling energy */
const channeling: WorkingBehavior = {
  name: 'channeling',
  loop: true,
  duration: 3,
  update: (parts, progress) => {
    // Arms raised, channeling pose
    const channelPulse = Math.sin(progress * Math.PI * 4)

    parts.leftArm.rotation.x = -1.8 + channelPulse * 0.2
    parts.leftArm.rotation.z = -0.6
    parts.rightArm.rotation.x = -1.8 - channelPulse * 0.2
    parts.rightArm.rotation.z = 0.6

    // Hands circle slightly (channeling motion)
    const circlePhase = progress * Math.PI * 2
    parts.leftArm.rotation.y = Math.sin(circlePhase) * 0.3
    parts.rightArm.rotation.y = -Math.sin(circlePhase) * 0.3

    // Body slight sway
    parts.mesh.rotation.z = Math.sin(progress * Math.PI * 2) * 0.05

    // Head looking at portal (forward/up)
    parts.head.rotation.x = -0.1

    // Eyes glowing effect (scale pulse)
    const glowPulse = 1 + Math.sin(progress * Math.PI * 6) * 0.15
    parts.leftEye.scale.setScalar(glowPulse)
    parts.rightEye.scale.setScalar(glowPulse)

    // Antenna resonating
    parts.antenna.rotation.x = Math.sin(progress * Math.PI * 8) * 0.15
    parts.antenna.rotation.z = Math.sin(progress * Math.PI * 6) * 0.1
  },
  reset: (parts) => {
    parts.leftArm.rotation.set(0, 0, 0)
    parts.rightArm.rotation.set(0, 0, 0)
    parts.mesh.rotation.z = 0
    parts.head.rotation.x = 0
    parts.leftEye.scale.setScalar(1)
    parts.rightEye.scale.setScalar(1)
    parts.antenna.rotation.set(0, 0, 0)
  }
}

/** Taskboard (TodoWrite) - Checking items, pointing at board */
const checkingTasks: WorkingBehavior = {
  name: 'checkingTasks',
  loop: true,
  duration: 3.5,
  update: (parts, progress) => {
    const taskCycle = progress * 3  // Check 3 items
    const taskPhase = taskCycle % 1
    const taskIndex = Math.floor(taskCycle) % 3

    // Point at different board positions (high, mid, low)
    const boardY = [0.3, 0, -0.3][taskIndex]

    // Right arm pointing at board
    parts.rightArm.rotation.x = -1.5 + boardY * 0.5
    parts.rightArm.rotation.z = 0.3

    // Check motion (arm moves in checkmark)
    if (taskPhase > 0.6 && taskPhase < 0.9) {
      const checkProgress = (taskPhase - 0.6) / 0.3
      parts.rightArm.rotation.z = 0.3 + Math.sin(checkProgress * Math.PI) * 0.3
      parts.rightArm.rotation.x += Math.sin(checkProgress * Math.PI) * 0.2
    }

    // Left arm holding clipboard/list
    parts.leftArm.rotation.x = -1.0
    parts.leftArm.rotation.z = -0.4

    // Head follows pointing
    parts.head.rotation.x = -boardY * 0.15
    parts.head.rotation.y = 0.2

    // Nod when checking off
    if (taskPhase > 0.8) {
      parts.head.rotation.x += Math.sin((taskPhase - 0.8) * 5 * Math.PI) * 0.1
    }

    // Eyes scanning board
    parts.leftEye.position.y = 0.03 - boardY * 0.01
    parts.rightEye.position.y = 0.03 - boardY * 0.01
  },
  reset: (parts) => {
    parts.leftArm.rotation.set(0, 0, 0)
    parts.rightArm.rotation.set(0, 0, 0)
    parts.head.rotation.set(0, 0, 0)
    parts.leftEye.position.y = 0.03
    parts.rightEye.position.y = 0.03
  }
}

/** Generic working animation for unmapped stations */
const genericWorking: WorkingBehavior = {
  name: 'genericWorking',
  loop: true,
  duration: 2,
  update: (parts, progress) => {
    // Simple focused working pose
    parts.leftArm.rotation.x = -0.5
    parts.rightArm.rotation.x = -0.5

    // Slight body movement showing activity
    const activity = Math.sin(progress * Math.PI * 4) * 0.03
    parts.body.rotation.x = 0.05 + activity

    // Head slight movements (thinking)
    parts.head.rotation.y = Math.sin(progress * Math.PI * 2) * 0.1
    parts.head.rotation.z = Math.sin(progress * Math.PI * 3) * 0.05
  },
  reset: (parts) => {
    parts.leftArm.rotation.set(0, 0, 0)
    parts.rightArm.rotation.set(0, 0, 0)
    parts.body.rotation.x = 0
    parts.head.rotation.set(0, 0, 0)
  }
}

// ============================================================================
// Alternative Station Animations
// ============================================================================

/** Bookshelf (Read) - Speed-reading through pages frantically */
const speedReading: WorkingBehavior = {
  name: 'speedReading',
  loop: true,
  duration: 2.5,
  update: (parts, progress) => {
    // Hold book close, hunched over
    parts.leftArm.rotation.x = -1.4
    parts.leftArm.rotation.z = -0.2
    parts.rightArm.rotation.x = -1.4
    parts.rightArm.rotation.z = 0.2

    // Rapid page flipping with right hand
    const flipCycle = progress * 8
    const flipPhase = flipCycle % 1
    parts.rightArm.rotation.z = 0.2 + Math.sin(flipPhase * Math.PI) * 0.5

    // Eyes darting across pages super fast
    const dartCycle = progress * 16
    const eyeX = Math.sin(dartCycle * Math.PI) * 0.03
    parts.leftEye.position.x = -0.07 + eyeX
    parts.rightEye.position.x = 0.07 + eyeX

    // Eyes get wider as excitement builds
    const excitement = 1 + progress * 0.2
    parts.leftEye.scale.setScalar(excitement)
    parts.rightEye.scale.setScalar(excitement)

    // Head jittering slightly from speed
    parts.head.rotation.x = 0.15 + Math.sin(progress * Math.PI * 12) * 0.02
    parts.head.rotation.y = Math.sin(progress * Math.PI * 6) * 0.04

    // Antenna vibrating with brain activity
    parts.antenna.rotation.z = Math.sin(progress * Math.PI * 16) * 0.12
    parts.antenna.rotation.x = -0.1
  },
  reset: (parts) => {
    parts.leftArm.rotation.set(0, 0, 0)
    parts.rightArm.rotation.set(0, 0, 0)
    parts.leftEye.position.x = -0.07
    parts.rightEye.position.x = 0.07
    parts.leftEye.scale.setScalar(1)
    parts.rightEye.scale.setScalar(1)
    parts.head.rotation.set(0, 0, 0)
    parts.antenna.rotation.set(0, 0, 0)
  }
}

/** Workbench (Edit) - Precision surgery: careful, delicate adjustments */
const precisionWork: WorkingBehavior = {
  name: 'precisionWork',
  loop: true,
  duration: 4,
  update: (parts, progress) => {
    // Lean in close, body forward
    parts.body.rotation.x = 0.12

    // Left hand holds steady
    parts.leftArm.rotation.x = -0.9
    parts.leftArm.rotation.z = -0.3

    // Right arm making tiny precise movements
    const precisionCycle = progress * 6
    const microPhase = precisionCycle % 1
    parts.rightArm.rotation.x = -1.1 + Math.sin(microPhase * Math.PI * 2) * 0.05
    parts.rightArm.rotation.y = Math.sin(microPhase * Math.PI * 4) * 0.04
    parts.rightArm.rotation.z = 0.15

    // Squinting eyes (focused)
    parts.leftEye.scale.setScalar(0.7)
    parts.rightEye.scale.setScalar(0.7)

    // Head very still, slight tilt for better view
    parts.head.rotation.x = 0.2
    parts.head.rotation.z = 0.08

    // Periodic "step back and examine" (every 75%)
    if (progress > 0.7 && progress < 0.9) {
      const examineP = (progress - 0.7) / 0.2
      parts.body.rotation.x = 0.12 - easeOut(examineP) * 0.15
      parts.head.rotation.x = 0.2 - easeOut(examineP) * 0.25
      parts.leftEye.scale.setScalar(0.7 + easeOut(examineP) * 0.4)
      parts.rightEye.scale.setScalar(0.7 + easeOut(examineP) * 0.4)
      // Nod of approval
      if (examineP > 0.6) {
        parts.head.rotation.x += Math.sin((examineP - 0.6) * 2.5 * Math.PI) * 0.1
      }
    }

    // Antenna barely moves - deep concentration
    parts.antenna.rotation.x = Math.sin(progress * Math.PI * 2) * 0.03
  },
  reset: (parts) => {
    parts.body.rotation.x = 0
    parts.leftArm.rotation.set(0, 0, 0)
    parts.rightArm.rotation.set(0, 0, 0)
    parts.leftEye.scale.setScalar(1)
    parts.rightEye.scale.setScalar(1)
    parts.head.rotation.set(0, 0, 0)
    parts.antenna.rotation.set(0, 0, 0)
  }
}

/** Desk (Write) - Calligraphy: slow, artistic, admiring work */
const calligraphy: WorkingBehavior = {
  name: 'calligraphy',
  loop: true,
  duration: 5,
  update: (parts, progress) => {
    // Left arm holds paper steady at angle
    parts.leftArm.rotation.x = -0.7
    parts.leftArm.rotation.z = -0.5
    parts.leftArm.rotation.y = 0.2

    // Right arm - slow, sweeping brush strokes
    const strokeCycle = progress * 3
    const strokePhase = strokeCycle % 1
    const strokeIndex = Math.floor(strokeCycle) % 3

    // Different stroke directions per phase
    const strokes = [
      { x: -1.0, yStart: -0.3, yEnd: 0.3, zStart: 0.1, zEnd: 0.4 },   // horizontal
      { x: -0.8, yStart: 0.2, yEnd: -0.2, zStart: 0.3, zEnd: 0.1 },    // diagonal
      { x: -1.2, yStart: 0.0, yEnd: 0.0, zStart: 0.15, zEnd: 0.35 },   // vertical
    ]
    const stroke = strokes[strokeIndex]
    const smooth = easeInOut(strokePhase)
    parts.rightArm.rotation.x = stroke.x
    parts.rightArm.rotation.y = stroke.yStart + (stroke.yEnd - stroke.yStart) * smooth
    parts.rightArm.rotation.z = stroke.zStart + (stroke.zEnd - stroke.zStart) * smooth

    // Head follows the brush
    parts.head.rotation.x = 0.15
    parts.head.rotation.y = parts.rightArm.rotation.y * 0.3

    // Dip brush between strokes
    if (strokePhase > 0.9) {
      const dipP = (strokePhase - 0.9) / 0.1
      parts.rightArm.rotation.x += Math.sin(dipP * Math.PI) * 0.3
    }

    // Eyes track the work with satisfaction
    parts.leftEye.position.x = -0.07 + parts.rightArm.rotation.y * 0.02
    parts.rightEye.position.x = 0.07 + parts.rightArm.rotation.y * 0.02

    // Occasional admiring pause - lean back
    if (progress > 0.85) {
      const admireP = (progress - 0.85) / 0.15
      parts.head.rotation.x = 0.15 - easeOut(admireP) * 0.2
      parts.head.rotation.z = easeOut(admireP) * 0.1
    }
  },
  reset: (parts) => {
    parts.leftArm.rotation.set(0, 0, 0)
    parts.rightArm.rotation.set(0, 0, 0)
    parts.head.rotation.set(0, 0, 0)
    parts.leftEye.position.x = -0.07
    parts.rightEye.position.x = 0.07
  }
}

/** Terminal (Bash) - Hacker mode: intense rapid typing, screen glow */
const hackerMode: WorkingBehavior = {
  name: 'hackerMode',
  loop: true,
  duration: 3,
  update: (parts, progress) => {
    // Hunched forward intensely
    parts.body.rotation.x = 0.1

    // Super fast alternating typing
    const typeCycle = progress * 20
    const typePhase = typeCycle % 1
    const leftType = Math.sin(typePhase * Math.PI * 2) * 0.15
    const rightType = Math.sin((typePhase + 0.5) * Math.PI * 2) * 0.15

    parts.leftArm.rotation.x = -0.8 + leftType
    parts.leftArm.rotation.z = -0.25
    parts.rightArm.rotation.x = -0.8 + rightType
    parts.rightArm.rotation.z = 0.25

    // Eyes locked on screen, slightly wide
    parts.leftEye.scale.setScalar(1.15)
    parts.rightEye.scale.setScalar(1.15)

    // Eyes scan rapidly - reading output
    const scanX = Math.sin(progress * Math.PI * 8) * 0.025
    parts.leftEye.position.x = -0.07 + scanX
    parts.rightEye.position.x = 0.07 + scanX
    parts.leftEye.position.y = 0.03 + Math.sin(progress * Math.PI * 3) * 0.008
    parts.rightEye.position.y = 0.03 + Math.sin(progress * Math.PI * 3) * 0.008

    // Head micro-movements - processing
    parts.head.rotation.y = Math.sin(progress * Math.PI * 6) * 0.04
    parts.head.rotation.x = 0.05

    // Antenna flickers like picking up data streams
    parts.antenna.rotation.z = Math.sin(progress * Math.PI * 14) * 0.08
    parts.antenna.rotation.x = Math.sin(progress * Math.PI * 10) * 0.06

    // Dramatic pause to read output (at 60%)
    if (progress > 0.55 && progress < 0.7) {
      const pauseP = (progress - 0.55) / 0.15
      // Hands lift off keyboard
      parts.leftArm.rotation.x = -0.8 + easeOut(pauseP) * 0.3
      parts.rightArm.rotation.x = -0.8 + easeOut(pauseP) * 0.3
      // Eyes widen more
      const widen = 1.15 + easeOut(pauseP) * 0.15
      parts.leftEye.scale.setScalar(widen)
      parts.rightEye.scale.setScalar(widen)
      // Quick head nod (got it!)
      if (pauseP > 0.7) {
        parts.head.rotation.x = 0.05 + Math.sin((pauseP - 0.7) * 3.3 * Math.PI) * 0.1
      }
    }
  },
  reset: (parts) => {
    parts.body.rotation.x = 0
    parts.leftArm.rotation.set(0, 0, 0)
    parts.rightArm.rotation.set(0, 0, 0)
    parts.leftEye.scale.setScalar(1)
    parts.rightEye.scale.setScalar(1)
    parts.leftEye.position.set(-0.07, 0.03, 0.242)
    parts.rightEye.position.set(0.07, 0.03, 0.242)
    parts.head.rotation.set(0, 0, 0)
    parts.antenna.rotation.set(0, 0, 0)
  }
}

/** Terminal (Bash) - Frustrated: type, error, facepalm, retry */
const frustratedTyping: WorkingBehavior = {
  name: 'frustratedTyping',
  loop: true,
  duration: 4,
  update: (parts, progress) => {
    if (progress < 0.4) {
      // Phase 1: Typing confidently
      const p = progress / 0.4
      const typeCycle = p * 12
      const typePhase = typeCycle % 1

      parts.leftArm.rotation.x = -0.7 + Math.sin(typePhase * Math.PI * 2) * 0.1
      parts.leftArm.rotation.z = -0.3
      parts.rightArm.rotation.x = -0.7 + Math.sin((typePhase + 0.5) * Math.PI * 2) * 0.1
      parts.rightArm.rotation.z = 0.3
      parts.head.rotation.x = 0.05
      parts.body.rotation.x = 0.05
    } else if (progress < 0.55) {
      // Phase 2: Error! Recoil
      const p = (progress - 0.4) / 0.15
      const recoil = easeOut(p)
      parts.body.rotation.x = 0.05 - recoil * 0.15
      parts.head.rotation.x = 0.05 - recoil * 0.2
      // Eyes go wide
      parts.leftEye.scale.setScalar(1 + recoil * 0.3)
      parts.rightEye.scale.setScalar(1 + recoil * 0.3)
      // Arms up in surprise
      parts.leftArm.rotation.x = -0.7 - recoil * 0.5
      parts.rightArm.rotation.x = -0.7 - recoil * 0.5
      parts.leftArm.rotation.z = -0.3 - recoil * 0.3
      parts.rightArm.rotation.z = 0.3 + recoil * 0.3
    } else if (progress < 0.75) {
      // Phase 3: Facepalm / head shake
      const p = (progress - 0.55) / 0.2
      // Right arm to face
      parts.rightArm.rotation.x = -2.0
      parts.rightArm.rotation.z = 0.3
      parts.leftArm.rotation.x = -0.3
      parts.leftArm.rotation.z = -0.1
      // Slow head shake
      parts.head.rotation.y = Math.sin(p * Math.PI * 3) * 0.2
      parts.head.rotation.x = 0.1
      // Eyes squint
      parts.leftEye.scale.setScalar(0.6)
      parts.rightEye.scale.setScalar(0.6)
      parts.body.rotation.x = -0.05
    } else {
      // Phase 4: Deep breath, back to typing with determination
      const p = (progress - 0.75) / 0.25
      const recovery = easeInOut(p)
      parts.rightArm.rotation.x = -2.0 + recovery * 1.3
      parts.rightArm.rotation.z = 0.3
      parts.leftArm.rotation.x = -0.3 - recovery * 0.4
      parts.leftArm.rotation.z = -0.1 - recovery * 0.2
      parts.head.rotation.y = 0
      parts.head.rotation.x = 0.1 - recovery * 0.05
      parts.body.rotation.x = -0.05 + recovery * 0.1
      // Eyes normalize
      parts.leftEye.scale.setScalar(0.6 + recovery * 0.4)
      parts.rightEye.scale.setScalar(0.6 + recovery * 0.4)
      // Antenna perks up - renewed determination
      parts.antenna.rotation.x = -recovery * 0.15
    }
  },
  reset: (parts) => {
    parts.leftArm.rotation.set(0, 0, 0)
    parts.rightArm.rotation.set(0, 0, 0)
    parts.head.rotation.set(0, 0, 0)
    parts.body.rotation.x = 0
    parts.leftEye.scale.setScalar(1)
    parts.rightEye.scale.setScalar(1)
    parts.antenna.rotation.set(0, 0, 0)
  }
}

/** Scanner (Grep/Glob) - Detective: magnifying glass, crouching, examining */
const detective: WorkingBehavior = {
  name: 'detective',
  loop: true,
  duration: 4,
  update: (parts, progress) => {
    // Crouching posture
    parts.body.rotation.x = 0.1

    // Right arm holding "magnifying glass" up to eye
    parts.rightArm.rotation.x = -1.8
    parts.rightArm.rotation.z = 0.4
    parts.rightArm.rotation.y = -0.2

    // Left arm behind back (classic detective)
    parts.leftArm.rotation.x = 0.3
    parts.leftArm.rotation.z = -0.4
    parts.leftArm.rotation.y = 0.5

    // Move magnifying glass around examining things
    const examCycle = progress * 2
    const examPhase = examCycle % 1

    if (Math.floor(examCycle) % 2 === 0) {
      // Examining left side
      const sweep = easeInOut(examPhase)
      parts.head.rotation.y = 0.15 + sweep * 0.2
      parts.rightArm.rotation.y = -0.2 + sweep * 0.3
      parts.body.rotation.y = sweep * 0.1
    } else {
      // Examining right side
      const sweep = easeInOut(examPhase)
      parts.head.rotation.y = 0.35 - sweep * 0.5
      parts.rightArm.rotation.y = 0.1 - sweep * 0.4
      parts.body.rotation.y = 0.1 - sweep * 0.2
    }

    // One eye big (looking through glass), one normal
    parts.rightEye.scale.setScalar(1.3)
    parts.leftEye.scale.setScalar(0.85)

    // Antenna twitching - picking up clues
    parts.antenna.rotation.z = Math.sin(progress * Math.PI * 6) * 0.1
    parts.antenna.rotation.x = -0.1

    // Periodic "aha!" moment
    if (progress > 0.85 && progress < 0.95) {
      const ahaP = (progress - 0.85) / 0.1
      parts.antenna.rotation.x = -0.1 - easeOut(ahaP) * 0.2
      parts.leftEye.scale.setScalar(0.85 + easeOut(ahaP) * 0.35)
      parts.head.rotation.x = -easeOut(ahaP) * 0.15
    }
  },
  reset: (parts) => {
    parts.body.rotation.set(0, 0, 0)
    parts.leftArm.rotation.set(0, 0, 0)
    parts.rightArm.rotation.set(0, 0, 0)
    parts.head.rotation.set(0, 0, 0)
    parts.leftEye.scale.setScalar(1)
    parts.rightEye.scale.setScalar(1)
    parts.antenna.rotation.set(0, 0, 0)
  }
}

/** Antenna (WebFetch) - Broadcasting: arms up like an antenna, sending signals */
const broadcasting: WorkingBehavior = {
  name: 'broadcasting',
  loop: true,
  duration: 3,
  update: (parts, progress) => {
    // Both arms up like antenna receivers
    const pulse = Math.sin(progress * Math.PI * 4)
    parts.leftArm.rotation.x = -2.5
    parts.leftArm.rotation.z = -0.5 + pulse * 0.15
    parts.rightArm.rotation.x = -2.5
    parts.rightArm.rotation.z = 0.5 - pulse * 0.15

    // Body sways with signal
    parts.body.rotation.z = Math.sin(progress * Math.PI * 2) * 0.06
    parts.mesh.rotation.z = Math.sin(progress * Math.PI * 2) * 0.03

    // Antenna goes wild - transmitting
    parts.antenna.rotation.z = Math.sin(progress * Math.PI * 12) * 0.2
    parts.antenna.rotation.x = Math.sin(progress * Math.PI * 8) * 0.15

    // Head tilts with signal direction
    parts.head.rotation.z = Math.sin(progress * Math.PI * 3) * 0.1
    parts.head.rotation.y = Math.sin(progress * Math.PI * 2) * 0.1

    // Eyes pulse like they're emitting/receiving light
    const eyePulse = 0.9 + Math.sin(progress * Math.PI * 6) * 0.2
    parts.leftEye.scale.setScalar(eyePulse)
    parts.rightEye.scale.setScalar(eyePulse)

    // Signal burst moments
    if (progress > 0.45 && progress < 0.55) {
      const burstP = (progress - 0.45) / 0.1
      const burst = Math.sin(burstP * Math.PI)
      parts.leftArm.rotation.z = -0.5 - burst * 0.3
      parts.rightArm.rotation.z = 0.5 + burst * 0.3
      parts.leftEye.scale.setScalar(eyePulse + burst * 0.3)
      parts.rightEye.scale.setScalar(eyePulse + burst * 0.3)
    }
  },
  reset: (parts) => {
    parts.leftArm.rotation.set(0, 0, 0)
    parts.rightArm.rotation.set(0, 0, 0)
    parts.body.rotation.z = 0
    parts.mesh.rotation.z = 0
    parts.antenna.rotation.set(0, 0, 0)
    parts.head.rotation.set(0, 0, 0)
    parts.leftEye.scale.setScalar(1)
    parts.rightEye.scale.setScalar(1)
  }
}

/** Portal (Task) - Summoning: drawing circles, building energy, dramatic release */
const summoning: WorkingBehavior = {
  name: 'summoning',
  loop: true,
  duration: 4,
  update: (parts, progress) => {
    if (progress < 0.6) {
      // Phase 1: Drawing summoning circles with arms
      const p = progress / 0.6
      const circlePhase = p * Math.PI * 4

      // Arms trace circles in opposite directions
      parts.leftArm.rotation.x = -1.5 + Math.sin(circlePhase) * 0.4
      parts.leftArm.rotation.z = -0.4 + Math.cos(circlePhase) * 0.3
      parts.leftArm.rotation.y = Math.sin(circlePhase) * 0.3
      parts.rightArm.rotation.x = -1.5 - Math.sin(circlePhase) * 0.4
      parts.rightArm.rotation.z = 0.4 - Math.cos(circlePhase) * 0.3
      parts.rightArm.rotation.y = -Math.sin(circlePhase) * 0.3

      // Head focused on the portal
      parts.head.rotation.x = -0.05
      parts.head.rotation.y = Math.sin(p * Math.PI * 2) * 0.05

      // Eyes focused and intense
      parts.leftEye.scale.setScalar(1.1)
      parts.rightEye.scale.setScalar(1.1)

      // Body slowly rising
      parts.body.rotation.x = -p * 0.05

      // Antenna building charge
      parts.antenna.rotation.z = Math.sin(circlePhase * 2) * (0.05 + p * 0.1)
    } else if (progress < 0.8) {
      // Phase 2: Energy gathered - arms pull in, building power
      const p = (progress - 0.6) / 0.2
      const gather = easeInOut(p)

      parts.leftArm.rotation.x = -1.5 + gather * 0.3
      parts.leftArm.rotation.z = -0.4 + gather * 0.2
      parts.rightArm.rotation.x = -1.5 + gather * 0.3
      parts.rightArm.rotation.z = 0.4 - gather * 0.2

      // Crouch down to build energy
      parts.body.rotation.x = -0.05 + gather * 0.12

      // Eyes squinting - concentration
      parts.leftEye.scale.setScalar(1.1 - gather * 0.3)
      parts.rightEye.scale.setScalar(1.1 - gather * 0.3)

      // Antenna vibrates rapidly
      parts.antenna.rotation.z = Math.sin(p * Math.PI * 20) * 0.15
    } else {
      // Phase 3: Release! Arms thrown wide, dramatic
      const p = (progress - 0.8) / 0.2
      const release = elastic(Math.min(p * 1.5, 1))

      parts.leftArm.rotation.x = -1.2 - release * 1.0
      parts.leftArm.rotation.z = -0.2 - release * 0.8
      parts.rightArm.rotation.x = -1.2 - release * 1.0
      parts.rightArm.rotation.z = 0.2 + release * 0.8

      // Head thrown back
      parts.head.rotation.x = release * -0.2
      parts.body.rotation.x = 0.07 - release * 0.1

      // Eyes wide with power
      const widen = 1 + release * 0.4
      parts.leftEye.scale.setScalar(Math.min(widen, 1.4))
      parts.rightEye.scale.setScalar(Math.min(widen, 1.4))

      // Antenna springs up
      parts.antenna.rotation.x = -release * 0.3
    }
  },
  reset: (parts) => {
    parts.leftArm.rotation.set(0, 0, 0)
    parts.rightArm.rotation.set(0, 0, 0)
    parts.head.rotation.set(0, 0, 0)
    parts.body.rotation.x = 0
    parts.leftEye.scale.setScalar(1)
    parts.rightEye.scale.setScalar(1)
    parts.antenna.rotation.set(0, 0, 0)
  }
}

/** Taskboard (TodoWrite) - Panicking: frantically checking items, overwhelmed */
const panicking: WorkingBehavior = {
  name: 'panicking',
  loop: true,
  duration: 3,
  update: (parts, progress) => {
    const panicCycle = progress * 5
    const panicPhase = panicCycle % 1

    // Head darting between items
    const item = Math.floor(panicCycle) % 5
    const headTargets = [-0.3, 0.2, -0.1, 0.3, -0.2]
    const headYTargets = [0.3, 0.15, 0.25, 0.1, 0.35]
    parts.head.rotation.y = headTargets[item] + Math.sin(panicPhase * Math.PI) * 0.05
    parts.head.rotation.x = headYTargets[item] * -0.3

    // Frantic arm movements - checking things off
    parts.rightArm.rotation.x = -1.5 + Math.sin(panicPhase * Math.PI * 2) * 0.4
    parts.rightArm.rotation.z = 0.3 + Math.sin(panicPhase * Math.PI * 3) * 0.2

    // Left arm holding head in distress periodically
    if (item % 3 === 2) {
      parts.leftArm.rotation.x = -2.0
      parts.leftArm.rotation.z = -0.5
    } else {
      parts.leftArm.rotation.x = -0.8
      parts.leftArm.rotation.z = -0.3
    }

    // Eyes wide with stress
    parts.leftEye.scale.setScalar(1.2)
    parts.rightEye.scale.setScalar(1.2)

    // Body jittery
    parts.body.rotation.y = Math.sin(progress * Math.PI * 10) * 0.04
    parts.body.rotation.x = 0.05

    // Antenna drooping from stress
    parts.antenna.rotation.x = 0.15
    parts.antenna.rotation.z = Math.sin(progress * Math.PI * 8) * 0.08
  },
  reset: (parts) => {
    parts.head.rotation.set(0, 0, 0)
    parts.leftArm.rotation.set(0, 0, 0)
    parts.rightArm.rotation.set(0, 0, 0)
    parts.leftEye.scale.setScalar(1)
    parts.rightEye.scale.setScalar(1)
    parts.body.rotation.set(0, 0, 0)
    parts.antenna.rotation.set(0, 0, 0)
  }
}

/** Center - Deep focus: hunched, minimal movement, laser concentration */
const deepFocus: WorkingBehavior = {
  name: 'deepFocus',
  loop: true,
  duration: 5,
  update: (parts, progress) => {
    // Very still, hunched forward
    parts.body.rotation.x = 0.08

    // Arms in "thinking" position - one on chin, one crossed
    parts.rightArm.rotation.x = -1.8
    parts.rightArm.rotation.z = 0.3
    parts.rightArm.rotation.y = -0.2
    parts.leftArm.rotation.x = -0.6
    parts.leftArm.rotation.z = -0.4

    // Head barely moves - deep thought
    parts.head.rotation.x = 0.08
    parts.head.rotation.y = Math.sin(progress * Math.PI * 0.5) * 0.03

    // Eyes narrow - intense focus
    parts.leftEye.scale.setScalar(0.75)
    parts.rightEye.scale.setScalar(0.75)

    // Occasional eye shift (considering different angles)
    const thinkCycle = progress * 3
    if (Math.floor(thinkCycle) % 3 === 1) {
      const lookP = thinkCycle % 1
      parts.leftEye.position.x = -0.07 + Math.sin(lookP * Math.PI) * 0.015
      parts.rightEye.position.x = 0.07 + Math.sin(lookP * Math.PI) * 0.015
      parts.leftEye.position.y = 0.03 + Math.sin(lookP * Math.PI) * 0.008
      parts.rightEye.position.y = 0.03 + Math.sin(lookP * Math.PI) * 0.008
    }

    // Antenna very slow sway - subconscious processing
    parts.antenna.rotation.z = Math.sin(progress * Math.PI) * 0.04
    parts.antenna.rotation.x = -0.05

    // Very subtle breathing motion
    const breathe = Math.sin(progress * Math.PI * 2) * 0.01
    parts.body.rotation.x = 0.08 + breathe
  },
  reset: (parts) => {
    parts.body.rotation.x = 0
    parts.leftArm.rotation.set(0, 0, 0)
    parts.rightArm.rotation.set(0, 0, 0)
    parts.head.rotation.set(0, 0, 0)
    parts.leftEye.scale.setScalar(1)
    parts.rightEye.scale.setScalar(1)
    parts.leftEye.position.set(-0.07, 0.03, 0.242)
    parts.rightEye.position.set(0.07, 0.03, 0.242)
    parts.antenna.rotation.set(0, 0, 0)
  }
}

// ============================================================================
// Station to Animation Mapping
// ============================================================================

export const STATION_ANIMATIONS: StationAnimations = {
  bookshelf: [readingBook, speedReading],
  workbench: [tinkering, precisionWork],
  desk: [writing, calligraphy],
  terminal: [typing, hackerMode, frustratedTyping],
  scanner: [scanning, detective],
  antenna: [receiving, broadcasting],
  portal: [channeling, summoning],
  taskboard: [checkingTasks, panicking],
  center: [genericWorking, deepFocus],
}

// ============================================================================
// Working Behavior Manager
// ============================================================================

export class WorkingBehaviorManager {
  private currentBehavior: WorkingBehavior | null = null
  private behaviorProgress = 0
  private currentStation: string | null = null

  /**
   * Start a working animation for a specific station.
   * Randomly selects from available animations for that station.
   */
  start(station: string, parts: CharacterParts): void {
    // Stop current behavior if any
    if (this.currentBehavior) {
      this.currentBehavior.reset?.(parts)
    }

    // Get animation pool for this station
    const pool = STATION_ANIMATIONS[station] ?? STATION_ANIMATIONS.center
    // Randomly pick one
    this.currentBehavior = pool[Math.floor(Math.random() * pool.length)]
    this.currentStation = station
    this.behaviorProgress = 0

    // Store original positions
    parts.mesh.userData.originalX = parts.mesh.position.x
    parts.mesh.userData.originalY = parts.mesh.position.y
  }

  /**
   * Stop the current working animation
   */
  stop(parts: CharacterParts): void {
    if (this.currentBehavior) {
      this.currentBehavior.reset?.(parts)
      this.currentBehavior = null
      this.currentStation = null
      this.behaviorProgress = 0
    }
  }

  /**
   * Update the working animation
   * @returns true if animation is playing
   */
  update(parts: CharacterParts, deltaTime: number): boolean {
    if (!this.currentBehavior) return false

    this.behaviorProgress += deltaTime / this.currentBehavior.duration

    // Loop the animation
    if (this.behaviorProgress >= 1) {
      if (this.currentBehavior.loop) {
        this.behaviorProgress = this.behaviorProgress % 1
      } else {
        this.stop(parts)
        return false
      }
    }

    this.currentBehavior.update(parts, this.behaviorProgress, deltaTime)
    return true
  }

  /**
   * Check if currently playing
   */
  isPlaying(): boolean {
    return this.currentBehavior !== null
  }

  /**
   * Get current station being animated
   */
  getCurrentStation(): string | null {
    return this.currentStation
  }

  /**
   * Get current behavior name
   */
  getCurrentBehaviorName(): string | null {
    return this.currentBehavior?.name ?? null
  }
}

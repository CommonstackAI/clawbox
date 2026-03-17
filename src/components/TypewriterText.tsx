import { useState, useEffect } from 'react'

interface TypewriterTextProps {
  texts: string[]
  typingSpeed?: number
  deletingSpeed?: number
  pauseDuration?: number
  className?: string
}

export function TypewriterText({
  texts,
  typingSpeed = 100,
  deletingSpeed = 50,
  pauseDuration = 2000,
  className = '',
}: TypewriterTextProps) {
  const [currentTextIndex, setCurrentTextIndex] = useState(0)
  const [currentText, setCurrentText] = useState('')
  const [isDeleting, setIsDeleting] = useState(false)

  useEffect(() => {
    if (texts.length === 0) return

    const targetText = texts[currentTextIndex]

    // Pause after completing typing
    if (!isDeleting && currentText === targetText) {
      const pauseTimer = setTimeout(() => {
        setIsDeleting(true)
      }, pauseDuration)
      return () => clearTimeout(pauseTimer)
    }

    // Pause after completing deletion, then move to next text
    if (isDeleting && currentText === '') {
      const pauseTimer = setTimeout(() => {
        setIsDeleting(false)
        setCurrentTextIndex((prev) => (prev + 1) % texts.length)
      }, 500)
      return () => clearTimeout(pauseTimer)
    }

    // Type or delete one character
    const timer = setTimeout(
      () => {
        if (isDeleting) {
          setCurrentText((prev) => prev.slice(0, -1))
        } else {
          setCurrentText((prev) => targetText.slice(0, prev.length + 1))
        }
      },
      isDeleting ? deletingSpeed : typingSpeed
    )

    return () => clearTimeout(timer)
  }, [
    currentText,
    currentTextIndex,
    isDeleting,
    texts,
    typingSpeed,
    deletingSpeed,
    pauseDuration,
  ])

  return (
    <h1 className={className}>
      {currentText}
      <span className="animate-pulse">|</span>
    </h1>
  )
}

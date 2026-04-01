import React, { useState, useEffect, useRef } from 'react'
import { Text } from '@claude-code-kit/ink-renderer'

export type StreamingTextProps = {
  text: string
  speed?: number
  interval?: number
  onComplete?: () => void
  color?: string
}

export function StreamingText({
  text,
  speed = 3,
  interval = 20,
  onComplete,
  color,
}: StreamingTextProps): React.ReactNode {
  const [revealed, setRevealed] = useState(0)
  const onCompleteRef = useRef(onComplete)
  onCompleteRef.current = onComplete

  useEffect(() => {
    if (revealed >= text.length) return
    const id = setInterval(() => {
      setRevealed((prev) => {
        const next = Math.min(prev + speed, text.length)
        if (next >= text.length) {
          onCompleteRef.current?.()
        }
        return next
      })
    }, interval)
    return () => clearInterval(id)
  }, [text.length, speed, interval, revealed >= text.length])

  return <Text color={color}>{text.slice(0, revealed)}</Text>
}

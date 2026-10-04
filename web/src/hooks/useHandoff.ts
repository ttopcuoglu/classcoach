import { useEffect, useState } from 'react'
import { clearHandoff, peekHandoff, type Handoff } from '../lib/handoff'

// Reading the handoff a surface was arrived at with.
//
// This is a hook rather than a `useState(() => takeHandoff())` because that
// pattern is quietly broken: `takeHandoff` has a side effect (it clears
// storage), React double-invokes state initializers under StrictMode, and
// this app renders inside StrictMode. The first invocation consumed the
// handoff and the second got null, so every handoff silently did nothing in
// development.
//
// So the read is pure and the clear is an effect. Clearing twice is harmless;
// reading twice and getting different answers is not.

/// The handoff this surface was arrived at with, or null.
///
/// `kind` filters to one variant, so a handoff meant for Practice is left in
/// place when the teacher happens to pass through Look It Over on the way —
/// each surface picks up only what was addressed to it.
export function useHandoff<K extends Handoff['kind']>(kind: K): Extract<Handoff, { kind: K }> | null {
  // Peeked, not taken: pure, so a double invocation is harmless.
  const [arrived] = useState(() => {
    const waiting = peekHandoff()
    return waiting?.kind === kind ? (waiting as Extract<Handoff, { kind: K }>) : null
  })

  useEffect(() => {
    // Cleared only if this surface actually claimed it. A handoff addressed
    // elsewhere has to survive being rendered past.
    if (arrived) clearHandoff()
  }, [arrived])

  return arrived
}

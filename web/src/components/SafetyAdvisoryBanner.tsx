import { useMemo } from 'react'
import { WarningIcon } from './icons'
import { detectSafetyFlag } from '../lib/safetyAdvisory'

// Renders nothing for routine text — only appears when the heuristic
// actually matches something, so it never makes ordinary communication
// feel alarming.
export default function SafetyAdvisoryBanner({ text }: { text: string }) {
  const flag = useMemo(() => detectSafetyFlag(text), [text])
  if (!flag) return null

  const isUrgent = flag.tier === 'do_not_handle_alone'
  return (
    <div
      className={`flex items-start gap-2.5 rounded-xl border p-3.5 text-sm ${
        isUrgent ? 'border-warm-300 bg-warm-100/60 text-warm-500' : 'border-brand-200 bg-brand-50 text-brand-600'
      }`}
    >
      <WarningIcon className="mt-0.5 h-4 w-4 shrink-0" />
      <p>{flag.message}</p>
    </div>
  )
}

export function PrivacyReminder() {
  return (
    <p className="text-xs text-ink-soft">
      Don't enter unnecessary personally identifiable or confidential student information.
    </p>
  )
}

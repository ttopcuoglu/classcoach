import { RUBRIC_LEVEL_NAMES } from '../lib/api'

const RUBRIC_LEVEL_FILL: Record<1 | 2 | 3 | 4, string> = {
  1: 'bg-terracotta',
  2: 'bg-gold',
  3: 'bg-brand-400',
  4: 'bg-forest',
}

// Four steps, filled up to the level, with the framework's name beside it —
// or a dashed "not enough evidence" when the recording couldn't place it.
export function RubricLevelBadge({ level }: { level: 1 | 2 | 3 | 4 | null }) {
  if (level == null) {
    return (
      <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-dashed border-hairline px-3 py-1 text-xs font-semibold text-ink-soft">
        Not enough evidence in this recording
      </div>
    )
  }
  return (
    <div className="mt-3 flex items-center gap-3" aria-label={`Level ${level} of 4: ${RUBRIC_LEVEL_NAMES[level]}`}>
      <div className="flex gap-1" aria-hidden="true">
        {[1, 2, 3, 4].map((step) => (
          <span
            key={step}
            className={`h-2.5 w-7 rounded-full ${step <= level ? RUBRIC_LEVEL_FILL[level] : 'bg-hairline'}`}
          />
        ))}
      </div>
      <span className="text-sm font-bold text-forest">
        {level} · {RUBRIC_LEVEL_NAMES[level]}
      </span>
    </div>
  )
}


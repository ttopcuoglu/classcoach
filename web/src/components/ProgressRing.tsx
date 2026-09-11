type Props = {
  /** 0-100. Values outside that range are clamped. */
  progress: number
  /** Diameter in px. */
  size?: number
  /** What Wivoza is doing right now, e.g. "Reading your lesson". */
  label?: string
  /** Sub-line, e.g. "This usually takes about 20 seconds." */
  hint?: string
  className?: string
}

// A circular progress indicator with the percentage in the middle, for the
// moments where Wivoza is thinking, processing or generating and the teacher
// is otherwise staring at a disabled button. The arc inherits `currentColor`
// so it drops into either palette (brand-* or terracotta) without a colour
// prop; the track is a low-opacity version of the same.
export function ProgressRing({ progress, size = 72, label, hint, className = '' }: Props) {
  const pct = Math.max(0, Math.min(100, progress))
  const stroke = Math.max(4, Math.round(size / 12))
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  // Offset shrinks as progress grows, so the arc sweeps clockwise from 12 o'clock.
  const offset = circumference * (1 - pct / 100)

  return (
    <div className={`flex flex-col items-center gap-2 ${className}`}>
      <div
        className="relative"
        style={{ width: size, height: size }}
        role="progressbar"
        aria-valuenow={Math.round(pct)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label ?? 'Working'}
      >
        <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
          <circle
            cx={size / 2} cy={size / 2} r={radius}
            fill="none" stroke="currentColor" strokeWidth={stroke} className="opacity-15"
          />
          <circle
            cx={size / 2} cy={size / 2} r={radius}
            fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            style={{ transition: 'stroke-dashoffset 150ms ease-out' }}
          />
        </svg>
        <span
          className="absolute inset-0 flex items-center justify-center font-semibold tabular-nums"
          style={{ fontSize: Math.round(size / 4) }}
        >
          {Math.round(pct)}%
        </span>
      </div>
      {label && <p className="text-sm font-medium">{label}</p>}
      {hint && <p className="text-xs opacity-70">{hint}</p>}
    </div>
  )
}

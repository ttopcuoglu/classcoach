// Shared "unavailable" visual treatment for report charts — built once so
// every chart (talk-time balance, pacing timeline, questioning mix, growth
// trend lines) marks missing data the same way instead of five one-off
// implementations. Never render missing data as zero/empty: a bar/segment
// gets a diagonal hatch fill, a line-chart point gets a dashed hollow marker.
import { HATCH_STYLE } from '../lib/chartPatterns'

export function HatchedBar({ label, className }: { label: string; className?: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className={`h-full w-full overflow-hidden rounded-full ${className ?? 'h-2.5'}`} style={HATCH_STYLE} />
      <p className="text-xs italic text-ink-soft">{label}</p>
    </div>
  )
}

export function HatchedSwatch({ className }: { className?: string }) {
  return <span className={`inline-block rounded ${className ?? 'h-2 w-2'}`} style={HATCH_STYLE} />
}

// A dashed, hollow marker for a line-chart point whose value is unavailable
// — distinct from a filled solid dot (a real measured value).
export function DashedLinePoint({ cx, cy, colorVar }: { cx: number; cy: number; colorVar: string }) {
  return (
    <circle
      cx={cx}
      cy={cy}
      r={3.5}
      fill="var(--color-canvas)"
      stroke={`var(${colorVar})`}
      strokeWidth={1.5}
      strokeDasharray="2,2"
    />
  )
}

export function NoDataLabel({ x, y }: { x: number; y: number }) {
  return (
    <text x={x} y={y} textAnchor="middle" fontSize={8} fontStyle="italic" fill="var(--color-ink-soft)">
      no data
    </text>
  )
}

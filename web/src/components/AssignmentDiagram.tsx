import { parseAssignmentContent, parseFractionOrNumber } from '../lib/assignmentDiagrams'

// A row of `segments` equal rectangles, the first `shaded` filled in —
// deterministic, always-correct, never an AI-generated image guessing at
// the right number of parts.
export function FractionBarDiagram({ segments, shaded }: { segments: number; shaded: number }) {
  const n = Math.max(1, Math.min(20, Math.round(segments)))
  const filled = Math.max(0, Math.min(n, Math.round(shaded)))
  const width = 240
  const height = 40
  const cellWidth = width / n
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-10 w-60" role="img" aria-label={`Fraction bar showing ${filled} of ${n} parts shaded`}>
      {Array.from({ length: n }).map((_, i) => (
        <rect
          key={i}
          x={i * cellWidth}
          y={0}
          width={cellWidth}
          height={height}
          fill={i < filled ? 'var(--color-terracotta)' : 'var(--color-cream-card)'}
          stroke="var(--color-forest)"
          strokeWidth={1.5}
        />
      ))}
    </svg>
  )
}

// A horizontal number line from start to end, with tick marks at each
// point (linearly scaled) and a label under each tick.
export function NumberLineDiagram({
  start,
  end,
  points,
  labels,
}: {
  start: number
  end: number
  points: number[]
  labels: string[]
}) {
  const width = 280
  const height = 60
  const padding = 16
  const usable = width - padding * 2
  const span = end - start || 1
  const toX = (v: number) => padding + ((v - start) / span) * usable

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-14 w-72" role="img" aria-label={`Number line from ${start} to ${end}`}>
      <line x1={padding} y1={30} x2={width - padding} y2={30} stroke="var(--color-forest)" strokeWidth={2} />
      {points.map((p, i) => {
        const x = toX(p)
        return (
          <g key={i}>
            <line x1={x} y1={22} x2={x} y2={38} stroke="var(--color-terracotta)" strokeWidth={2} />
            <circle cx={x} cy={30} r={3} fill="var(--color-terracotta)" />
            <text x={x} y={54} textAnchor="middle" fontSize={11} fill="var(--color-ink)">
              {labels[i] ?? p}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

function renderDiagram(diagramType: string, params: Record<string, string>, key: number): React.ReactNode {
  if (diagramType === 'fraction_bar') {
    const segments = Number(params.segments)
    const shaded = Number(params.shaded)
    if (Number.isFinite(segments) && Number.isFinite(shaded)) {
      return <FractionBarDiagram key={key} segments={segments} shaded={shaded} />
    }
  }
  if (diagramType === 'number_line') {
    const start = parseFractionOrNumber(params.start ?? '0')
    const end = parseFractionOrNumber(params.end ?? '1')
    const points = (params.points ?? '')
      .split(',')
      .map(parseFractionOrNumber)
      .filter((v): v is number => v != null)
    const labels = (params.labels ?? '').split(',').map((l) => l.trim())
    if (start != null && end != null && points.length > 0) {
      return <NumberLineDiagram key={key} start={start} end={end} points={points} labels={labels} />
    }
  }
  // Unrecognized or malformed directive — fall back to showing it as
  // plain text rather than silently dropping content.
  return (
    <span key={key} className="text-sm text-ink-soft">
      [[diagram:{diagramType}]]
    </span>
  )
}

// Renders assignment text, substituting each [[diagram:...]] directive
// with a real rendered diagram — used everywhere the final assignment is
// shown to a teacher or printed (never in the raw editable textarea).
export function AssignmentContent({ text }: { text: string }) {
  const segments = parseAssignmentContent(text)
  return (
    <div className="flex flex-col gap-2">
      {segments.map((s, i) =>
        s.type === 'text' ? (
          <span key={i} className="whitespace-pre-wrap text-sm text-ink">
            {s.content}
          </span>
        ) : (
          <div key={i} className="py-1">
            {renderDiagram(s.diagramType, s.params, i)}
          </div>
        ),
      )}
    </div>
  )
}

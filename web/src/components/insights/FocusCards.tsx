// The two ends of the focus loop on the Insights page: the check-in on last
// lesson's focus at the top, and the one focus for next lesson at the end.

import type { FocusCheckIn, NextFocus } from '../../lib/api'
import type { FocusCandidate } from '../../lib/focusLoop'
import { mmss } from '../../lib/insightsModel'

/// "Your focus from last lesson": what it was, this lesson against last, and
/// the line where it showed up — or, where it did not, a line where it could
/// fit. Never "you failed to".
export function FocusCheckInCard({
  focus,
  checkIn,
  teacherName,
}: {
  focus: NextFocus
  checkIn: Omit<FocusCheckIn, 'checkedAt'>
  teacherName: string | null
}) {
  return (
    <div className="mb-4 rounded-3xl border-2 border-gold bg-cream-card p-5 shadow-[6px_6px_0_var(--color-gold)]">
      <div className="font-heading text-[12px] font-extrabold uppercase tracking-wider text-[#8A6A12]">
        Your focus from {teacherName ? `${teacherName}'s` : 'the'} last lesson
      </div>
      <h3 className="my-1 font-heading text-[19px] font-extrabold text-forest">“{focus.text}”</h3>
      <p className="m-0 text-sm text-ink">
        {focus.findingLabel}:{' '}
        <b>{checkIn.thisValue ?? 'not measured'}</b> this lesson
        {checkIn.lastValue ? <span className="text-ink-soft"> · last lesson: {checkIn.lastValue}</span> : null}
      </p>
      {checkIn.outcome === 'unavailable' ? (
        <p className="mb-0 mt-2 text-[13px] text-ink-soft">This lesson couldn’t be read for it, so there’s nothing to compare yet.</p>
      ) : checkIn.outcome === 'heard' ? (
        checkIn.line ? (
          <FocusQuote label="It showed up here" line={checkIn.line} tone="border-l-forest-soft" />
        ) : (
          <p className="mb-0 mt-2 text-[13px] text-forest">None this lesson — the focus held.</p>
        )
      ) : (
        <>
          <p className="mb-0 mt-2 text-[13px] text-ink">Not yet this lesson. Here’s a place it could fit:</p>
          {checkIn.line && <FocusQuote label="A place it could fit" line={checkIn.line} tone="border-l-[#8A7BC0]" />}
        </>
      )}
    </div>
  )
}

function FocusQuote({ label, line, tone }: { label: string; line: NonNullable<FocusCheckIn['line']>; tone: string }) {
  return (
    <div className={`mt-2 rounded-r-xl border-l-4 bg-[#FBF5EA] px-3.5 py-2.5 ${tone}`}>
      <div className="mb-1 flex justify-between gap-2 text-[11.5px] font-semibold text-ink-soft">
        <span>{label}</span>
        <span className="font-mono text-forest">{mmss(line.timestampSec)}</span>
      </div>
      <p className="m-0 text-[14.5px] text-ink">“{line.quote}”</p>
    </div>
  )
}

/// "One focus for next lesson": the suggested Try, or the one picked, with its
/// line rewritten, and the promise the next report keeps.
export function OneFocusCard({
  focus,
  picked,
  teacherName,
  saving,
  error,
  onPick,
}: {
  focus: FocusCandidate
  picked: boolean
  teacherName: string | null
  saving: boolean
  error: string | null
  onPick: () => void
}) {
  return (
    <div className="my-1.5 mb-5 rounded-3xl bg-forest p-5 text-cream shadow-[6px_6px_0_var(--color-gold)] sm:p-6">
      <div className="font-heading text-[12px] font-extrabold uppercase tracking-wider text-gold">One focus for next lesson</div>
      <p className="my-1 font-heading text-[19px] font-extrabold leading-snug">{focus.text}</p>
      {focus.line && focus.rewrite && (
        <div className="mt-2 text-[13px]">
          <p className="m-0 text-[#9FB0A0]">
            <span className="font-mono">{mmss(focus.line.timestampSec)}</span> <s>“{focus.line.quote}”</s>
          </p>
          <p className="m-0 mt-0.5 font-semibold text-white">
            <span className="font-normal text-[#C9D3C6]">Next time: </span>“{focus.rewrite}”
          </p>
        </div>
      )}
      <p className="mb-0 mt-2.5 text-[12.5px] text-[#C9D3C6]">Your next report will check this first, using your own words.</p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        {picked ? (
          <span className="rounded-full bg-forest-soft px-3 py-1.5 text-[13px] font-semibold text-gold">
            ✓ Your focus for {teacherName ? `${teacherName}'s` : 'the'} next lesson
          </span>
        ) : (
          <button
            type="button"
            onClick={onPick}
            disabled={saving}
            className="rounded-full bg-gold px-4 py-1.5 text-[13px] font-bold text-forest disabled:opacity-60"
          >
            {saving ? 'Saving…' : 'Make this my focus'}
          </button>
        )}
        {!picked && <span className="text-[12px] text-[#C9D3C6]">Or pick a different Try next time above.</span>}
      </div>
      {!teacherName && (
        <p className="mb-0 mt-2 text-[12px] text-[#C9D3C6]">
          This lesson has no teacher name, so the next one can’t be matched to it. Add the teacher’s name to this
          lesson and its next lesson will be checked against this focus.
        </p>
      )}
      {error && <p className="mb-0 mt-2 text-[12.5px] text-gold">{error}</p>}
    </div>
  )
}

const OUTCOME: Record<FocusCheckIn['outcome'], string> = {
  heard: 'Showed up',
  not_yet: 'Not yet',
  unavailable: 'Couldn’t be read',
}

/// The focus check-ins across lessons, newest first — the data point My
/// Growth carries for the focus loop. A list, not a chart: each focus is a
/// different thing, so there is no single line to draw through them.
export function FocusCheckInHistory({
  sessions,
}: {
  sessions: { id: string; sessionDate: string; teacherName: string | null; lessonFocus?: { checkIn?: FocusCheckIn | null } | null }[]
}) {
  const rows = sessions
    .filter((s) => s.lessonFocus?.checkIn)
    .sort((a, b) => b.sessionDate.localeCompare(a.sessionDate))
  if (rows.length === 0) return null
  return (
    <div className="rounded-2xl border border-hairline bg-cream-card p-5">
      <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-terracotta-600">Next lesson’s focus</p>
      <div className="flex flex-col">
        {rows.map((s) => {
          const c = s.lessonFocus!.checkIn!
          return (
            <div key={s.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 border-b border-dashed border-hairline py-2 text-sm last:border-b-0">
              <span className="w-24 flex-none text-xs text-ink-soft">
                {new Date(s.sessionDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                {s.teacherName ? ` · ${s.teacherName}` : ''}
              </span>
              <span className="min-w-0 flex-1 text-ink">{c.text}</span>
              <span className="text-xs text-ink-soft">
                {c.lastValue ?? '—'} → <b className="text-forest">{c.thisValue ?? '—'}</b>
              </span>
              <span
                className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                  c.outcome === 'heard' ? 'bg-mint-tint text-forest' : 'bg-cream text-ink-soft'
                }`}
              >
                {OUTCOME[c.outcome]}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

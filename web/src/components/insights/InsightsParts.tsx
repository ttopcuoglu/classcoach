// The pieces every Insights section is built from. One of each, shared by all
// five sections — a section that needs something different changes the
// model, not a copy of the component.

import { useContext, useState } from 'react'
import type { TranscriptSegment } from '../../lib/api'
import { contextLines, mmss, type CoachText, type ElementTag, type Evidence, type Finding, type KeepTry as KeepTryModel } from '../../lib/insightsModel'
import { HATCH_STYLE } from '../../lib/chartPatterns'
import { HatchedSwatch } from '../unavailableChart'
import { QuoteFlagContext } from './quoteFlagContext'

export type SectionMeta = { n: number; title: string; sub: string; chip: string }

/// Number chip, title, subtitle, then the section.
export function SectionCard({
  id,
  meta,
  children,
  footer,
}: {
  id: string
  meta: SectionMeta
  children: React.ReactNode
  footer?: React.ReactNode
}) {
  return (
    <section id={id} className="mb-5 scroll-mt-4 rounded-3xl border border-hairline bg-cream-card p-5 sm:p-6">
      <div className="flex items-center gap-3">
        <span className={`flex h-9 w-9 flex-none items-center justify-center rounded-xl font-heading text-base font-extrabold text-white ${meta.chip}`}>
          {meta.n}
        </span>
        <div className="min-w-0">
          <h2 className="m-0 font-heading text-xl font-extrabold text-forest">{meta.title}</h2>
          <p className="m-0 text-[13px] text-ink-soft">{meta.sub}</p>
        </div>
      </div>
      {children}
      {footer && <div className="mt-4 flex flex-col gap-1">{footer}</div>}
    </section>
  )
}

/// The coach's lead, always shown, with the rest behind "Read more".
export function CoachNote({ coach, pending }: { coach: CoachText; pending?: boolean }) {
  const [open, setOpen] = useState(false)
  if (pending) {
    return (
      <div className="mt-3.5 flex items-center gap-3 rounded-2xl bg-mint-tint px-4 py-3.5 text-sm text-ink-soft">
        <span className="flex h-[30px] w-[30px] flex-none animate-pulse items-center justify-center rounded-full bg-forest font-heading text-sm font-extrabold text-gold">
          W
        </span>
        Writing your coach note…
      </div>
    )
  }
  if (!coach) return null
  return (
    <div className="mt-3.5 flex items-start gap-3 rounded-2xl bg-mint-tint px-4 py-3.5">
      <span className="flex h-[30px] w-[30px] flex-none items-center justify-center rounded-full bg-forest font-heading text-sm font-extrabold text-gold">
        W
      </span>
      <div className="min-w-0">
        <p className="m-0 text-[15.5px] leading-relaxed text-ink">{coach.lead}</p>
        {coach.more &&
          open &&
          coach.more.split(/\n\s*\n/).map((para, i) => (
            <p key={i} className="mt-2 text-sm leading-relaxed text-[#33413A]">
              {para}
            </p>
          ))}
        {coach.more && (
          <button type="button" onClick={() => setOpen(!open)} className="mt-1.5 text-[13px] font-semibold text-terracotta-600">
            {open ? 'Show less' : 'Read more'}
          </button>
        )}
      </div>
    </div>
  )
}

/// ✓/✗ chips: Task / Steps / Time / Product, or What to do.
export function ElementTags({ tags }: { tags: ElementTag[] }) {
  return (
    <span className="inline-flex flex-wrap gap-1">
      {tags.map((t) => (
        <span
          key={t.label}
          className={`rounded px-1.5 py-px text-[10.5px] font-bold ${t.on ? 'bg-mint-tint text-forest' : 'bg-[#EFE8DA] text-[#8F8572] line-through'}`}
        >
          {t.label}
        </span>
      ))}
    </span>
  )
}

const BORDER: Record<Evidence['polarity'], string> = {
  strength: 'border-l-forest-soft',
  growth: 'border-l-terracotta',
  neutral: 'border-l-gold',
}

/// One of the teacher's lines: what it is, when, the words, and the lines
/// either side of it on demand.
export function QuoteCard({
  evidence,
  segments,
  findingKey,
}: {
  evidence: Evidence
  segments: TranscriptSegment[]
  /// The finding this line stands for, which is what a flag is about.
  findingKey?: string
}) {
  const [showContext, setShowContext] = useState(false)
  const flags = useContext(QuoteFlagContext)
  const [saving, setSaving] = useState<'idle' | 'saving' | 'failed'>('idle')
  // Only a line found in the transcript can be flagged: a flag has to say
  // which line it was about.
  const canFlag = !!(flags && findingKey && evidence.segmentId && !evidence.withheld)
  const flagged = canFlag && flags!.isFlagged(findingKey!, evidence.segmentId!)
  const ctx = showContext ? contextLines(segments, evidence) : null
  const trimmed = evidence.quote !== evidence.full
  return (
    <div className={`mt-2 rounded-r-xl border-l-4 bg-[#FBF5EA] px-3.5 py-2.5 ${BORDER[evidence.polarity]}`}>
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2 text-[11.5px] font-semibold text-ink-soft">
        <span className="flex flex-wrap items-center gap-1.5">
          {evidence.elements ? <ElementTags tags={evidence.elements} /> : evidence.tag}
        </span>
        <span className="font-mono text-forest">{mmss(evidence.timestampSec)}</span>
      </div>
      {evidence.withheld ? (
        <p className="m-0 text-[13.5px] italic text-ink-soft">
          {evidence.withheld === 'unsafe'
            ? 'The wording is withheld: it contains words this report will not attribute to you on the strength of a room microphone.'
            : 'The wording is withheld: it could not be matched word for word to your own speech.'}
        </p>
      ) : (
        <p className="m-0 text-[14.5px] text-ink">
          “{evidence.quote}”{trimmed && <span className="text-ink-soft"> …</span>}
        </p>
      )}
      {evidence.why && (
        <p className="mb-0 mt-1.5 text-[13.5px] text-ink">
          {evidence.whyLabel && <b className="text-forest">{evidence.whyLabel} </b>}
          {evidence.why}
        </p>
      )}
      {evidence.linked && (
        <p className="mb-0 mt-1.5 text-[12.5px] text-[#5B4C93]">↳ Linked general guidance: {evidence.linked}</p>
      )}
      {!evidence.withheld && (
        <div className="mt-1.5 flex flex-wrap gap-3 text-[11.5px]">
          <button type="button" onClick={() => setShowContext(!showContext)} className="text-ink-soft underline decoration-dotted">
            {showContext ? 'Hide context' : 'Show context'}
          </button>
          {canFlag &&
            (flagged ? (
              <span className="text-terracotta-600">Flagged · thanks, we’ll review it</span>
            ) : (
              <button
                type="button"
                disabled={saving === 'saving'}
                onClick={() => {
                  setSaving('saving')
                  flags!
                    .flag(findingKey!, evidence)
                    .then(() => setSaving('idle'))
                    .catch(() => setSaving('failed'))
                }}
                className="text-ink-soft underline decoration-dotted disabled:opacity-50"
              >
                {saving === 'failed' ? 'Couldn’t save that — try again' : 'Not right?'}
              </button>
            ))}
        </div>
      )}
      {ctx && (
        <div className="mt-1.5 flex flex-col gap-1 rounded-lg bg-[#F3ECDD] px-2.5 py-1.5 text-[12.5px] text-ink-soft">
          {ctx.before && (
            <p className="m-0">
              <span className="font-mono">{mmss(ctx.before.startSec)}</span> Before: “{ctx.before.text}”
            </p>
          )}
          {trimmed && ctx.lines.length > 0 && (
            <p className="m-0 text-ink">
              <span className="font-mono">{mmss(ctx.lines[0].startSec)}</span> The whole line: “
              {ctx.lines.map((l) => l.text.trim()).join(' ')}”
            </p>
          )}
          {ctx.after && (
            <p className="m-0">
              <span className="font-mono">{mmss(ctx.after.startSec)}</span> After: “{ctx.after.text}”
            </p>
          )}
          {!ctx.before && !ctx.after && !trimmed && <p className="m-0">No other lines of yours sit next to this one.</p>}
        </div>
      )}
    </div>
  )
}

/// "Show all N": every line behind the number, strengths first, in lesson
/// order within each group.
export function ShowAllList({ finding }: { finding: Finding }) {
  const [open, setOpen] = useState(false)
  if (!finding.showAllLabel) return null
  const groups = finding.groups?.filter((g) => g.items.length > 0) ?? [{ label: '', items: finding.evidence }]
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="mt-2 rounded-full border border-[#EBC9B6] bg-white px-3.5 py-1.5 text-[13px] font-bold text-terracotta-600"
      >
        {open ? 'Hide' : finding.showAllLabel}
      </button>
      {open && (
        <div className="mt-2">
          {groups.map((g) => (
            <div key={g.label || 'all'}>
              {g.label && (
                <p className="mb-0.5 mt-2.5 text-[11.5px] font-extrabold uppercase tracking-wider text-ink-soft">{g.label}</p>
              )}
              {g.items.map((e) => (
                <div key={e.id} className="flex gap-2.5 border-b border-dashed border-hairline py-1.5 text-[13.5px]">
                  <span className="w-11 flex-none pt-0.5 font-mono text-[11.5px] text-forest">{mmss(e.timestampSec)}</span>
                  <span className="min-w-0">
                    {e.withheld ? <i className="text-ink-soft">wording withheld</i> : `“${e.quote}”`}{' '}
                    {e.elements && <ElementTags tags={e.elements} />}
                  </span>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </>
  )
}

/// The hatched box for a finding with nothing to quote: unavailable, or a
/// confirmed none. Never a zero standing in for either.
export function EmptyEvidence({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-2 rounded-xl border-2 border-dashed border-[#B9AF9A] px-3.5 py-2.5 text-[13px] text-ink-soft" style={HATCH_STYLE}>
      <span className="rounded bg-cream-card/90 px-1">{children}</span>
    </div>
  )
}

/// A finding: label, value, caveat, then its one featured line and the rest.
export function FindingRow({ finding, segments }: { finding: Finding; segments: TranscriptSegment[] }) {
  return (
    <div className="mt-4 border-t border-dashed border-hairline pt-3.5">
      <div className="flex flex-wrap items-baseline justify-between gap-2.5">
        <h3 className="m-0 font-heading text-[15.5px] font-bold text-forest">{finding.label}</h3>
        <span className="flex flex-wrap items-baseline gap-2">
          {finding.value != null && <span className="font-heading text-[15px] font-extrabold text-forest">{finding.value}</span>}
          {finding.caveat && (
            <span className="rounded-full bg-gold-tint px-2.5 py-0.5 text-[12px] font-semibold text-[#6B5310]">{finding.caveat}</span>
          )}
        </span>
      </div>
      {finding.state === 'unavailable' && finding.note && <EmptyEvidence>{finding.note}</EmptyEvidence>}
      {finding.state === 'confirmed_none' && finding.note && <EmptyEvidence>{finding.note}</EmptyEvidence>}
      {finding.state === 'measured' && finding.featured && (
        <QuoteCard evidence={finding.featured} segments={segments} findingKey={finding.key} />
      )}
      {finding.state === 'measured' && <ShowAllList finding={finding} />}
    </div>
  )
}

/// Keep (mint) and Try next time (peach), each with the line it is about.
///
/// The before → after rewrite the plan asks for needs a written suggestion
/// for the line itself, which the coach notes do not produce yet; until they
/// do, the Try shows the suggestion and the line it grew from, not an
/// invented rewrite.
export function KeepTry({
  model,
  focusAction,
}: {
  model: KeepTryModel
  /// "Make this my focus" on the Try, when it can be one.
  focusAction?: { picked: boolean; saving: boolean; onPick: () => void }
}) {
  if (!model.keep && !model.tryNext) return null
  return (
    <div className="mt-[18px] grid gap-2.5 sm:grid-cols-2">
      <div className="rounded-2xl bg-mint-tint px-3.5 py-3 text-sm">
        <b className="mb-1 block font-heading text-[11.5px] font-extrabold uppercase tracking-wider text-forest">Keep</b>
        {model.keep ? (
          <>
            {model.keep.text}
            {/* The line is already quoted in the finding above; here it is
                pointed to, not said again. */}
            {model.keep.line && <span className="text-forest"> ({mmss(model.keep.line.timestampSec)})</span>}
          </>
        ) : (
          <span className="text-ink-soft">Nothing in this section to point to yet.</span>
        )}
      </div>
      <div className="rounded-2xl bg-peach-tint px-3.5 py-3 text-sm">
        <b className="mb-1 block font-heading text-[11.5px] font-extrabold uppercase tracking-wider text-[#8A3A1C]">Try next time</b>
        {model.tryNext ? (
          <>
            {model.tryNext.text}
            {model.tryNext.line && !model.tryNext.line.withheld && model.tryNext.rewrite ? (
              <BeforeAfter before={model.tryNext.line} after={model.tryNext.rewrite} />
            ) : (
              model.tryNext.line &&
              !model.tryNext.line.withheld && (
                <p className="mt-1 text-[13px] text-[#8F8572]">
                  From your lesson, {mmss(model.tryNext.line.timestampSec)}: “{model.tryNext.line.quote}”
                </p>
              )
            )}
          </>
        ) : (
          <span className="text-ink-soft">No suggestion was written for this section.</span>
        )}
        {model.tryNext && focusAction && (
          <div className="mt-2">
            {focusAction.picked ? (
              <span className="text-[12.5px] font-semibold text-forest">✓ Your focus for next lesson</span>
            ) : (
              <button
                type="button"
                onClick={focusAction.onPick}
                disabled={focusAction.saving}
                className="text-[12.5px] font-semibold text-terracotta-600 underline decoration-dotted disabled:opacity-50"
              >
                Make this my focus
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

/// Your line as you said it, struck through, and the same line as you could
/// say it next time. The first is a quote; the second is a suggestion and is
/// labelled as one.
export function BeforeAfter({ before, after }: { before: Evidence; after: string }) {
  return (
    <div className="mt-1.5 text-[13px]">
      <p className="m-0 text-[#8F8572]">
        <span className="font-mono">{mmss(before.timestampSec)}</span> <s>“{before.quote}”</s>
      </p>
      <p className="m-0 mt-0.5 font-semibold text-forest">
        <span className="font-normal text-ink-soft">Next time: </span>“{after}”
      </p>
    </div>
  )
}

/// What the report leaves out on purpose, at the foot of the page.
export function UnavailablePanel({ items }: { items: readonly string[] }) {
  const list = items.join(', ')
  return (
    <div className="mt-2 flex items-start gap-3 rounded-2xl border-2 border-dashed border-[#B9AF9A] bg-cream p-4 text-[13.5px] text-ink-soft">
      <HatchedSwatch className="mt-1 h-3 w-3 shrink-0 rounded-sm" />
      <p className="m-0">
        <b className="text-ink">Not in this report:</b> {list[0].toUpperCase() + list.slice(1)}. These need each voice
        told apart from yours, which a room recording can’t yet do reliably, so this report is built from your voice
        only.
      </p>
    </div>
  )
}

// The focus loop, as data (Insights Phase 6).
//
// A focus is one Try next time, chosen on a report and tied to the finding it
// came from, so the next report for the same teacher can measure the same
// thing and point at the line where it showed up — or, where it did not, at a
// line where it could have. Never "you failed to": a focus that did not show
// up is "not yet".

import type { FocusCheckIn, FocusLine, NextFocus } from './api'
import type { Evidence, Finding, InsightsModel, KeepTry, SectionModel } from './insightsModel'

/// Findings where less is the goal: a focus on them is met by fewer. A focus
/// on a finding the report no longer has (fast stretches, removed) comes back
/// as "couldn't be read" rather than a guess.
const FEWER_IS_THE_GOAL = new Set(['self_answered'])

/// The order a focus is suggested in: the moves a teacher can change in the
/// next lesson's first five minutes come first.
const SUGGEST_ORDER: SectionModel['key'][] = ['clarity', 'questioning', 'climate', 'talk_pace', 'content_lens']

export type FocusCandidate = Omit<NextFocus, 'pickedAt'>

function lineOf(e: Evidence | null | undefined): FocusLine | null {
  if (!e || e.withheld) return null
  return { quote: e.quote, timestampSec: e.timestampSec, segmentId: e.segmentId ?? null }
}

function findingHolding(section: SectionModel, line: Evidence | null): Finding | null {
  if (!line) return null
  return section.findings.find((f) => f.evidence.some((e) => e.id === line.id)) ?? null
}

/// A section's Try next time as a focus, when it is tied to a line and so to
/// a finding the next report can measure.
export function focusFromTry(section: SectionModel, keepTry: KeepTry): FocusCandidate | null {
  const t = keepTry.tryNext
  if (!t) return null
  const finding = findingHolding(section, t.line)
  if (!finding) return null
  return {
    findingKey: finding.key,
    findingLabel: finding.label,
    text: t.text,
    value: finding.value,
    line: lineOf(t.line),
    rewrite: t.rewrite ?? null,
  }
}

/// The focus the card offers before the teacher picks one: the first section,
/// in SUGGEST_ORDER, whose Try comes with a rewrite; failing that, any Try
/// tied to a finding.
export function suggestFocus(
  model: InsightsModel,
  keepTryFor: (section: SectionModel) => KeepTry,
): FocusCandidate | null {
  const sections: Record<SectionModel['key'], SectionModel> = {
    talk_pace: model.talk,
    questioning: model.questioning,
    clarity: model.clarity,
    climate: model.climate,
    content_lens: model.content,
  }
  const candidates = SUGGEST_ORDER.map((k) => focusFromTry(sections[k], keepTryFor(sections[k]))).filter(
    (c): c is FocusCandidate => c != null,
  )
  return candidates.find((c) => c.rewrite) ?? candidates[0] ?? null
}

/// The number a value leads with: 2 in "2", 1 in "1 of 5 complete".
function countOf(value: string | null): number | null {
  const m = value?.match(/^(\d+)/)
  return m ? Number(m[1]) : null
}

export function findingByKey(model: InsightsModel, key: string): { finding: Finding; section: SectionModel } | null {
  for (const section of [model.talk, model.questioning, model.clarity, model.climate, model.content] as SectionModel[]) {
    const finding = section.findings.find((f) => f.key === key)
    if (finding) return { finding, section }
  }
  return null
}

/// What this lesson shows for last lesson's focus.
export function checkFocus(model: InsightsModel, focus: NextFocus, fromSessionId: string): Omit<FocusCheckIn, 'checkedAt'> {
  const base = { fromSessionId, findingKey: focus.findingKey, text: focus.text, lastValue: focus.value }
  const found = findingByKey(model, focus.findingKey)
  if (!found || found.finding.state === 'unavailable') {
    return { ...base, thisValue: null, outcome: 'unavailable', line: null }
  }
  const { finding, section } = found
  const thisValue = finding.state === 'confirmed_none' ? (finding.value ?? '0') : finding.value
  const count = countOf(thisValue) ?? 0
  const visible = finding.evidence.filter((e) => !e.withheld)
  const strength = visible.find((e) => e.polarity !== 'growth')
  const growth = visible.find((e) => e.polarity === 'growth')

  if (FEWER_IS_THE_GOAL.has(focus.findingKey)) {
    // Met when there were none; otherwise the place it could fit is one of
    // the lines still there.
    return count === 0
      ? { ...base, thisValue, outcome: 'heard', line: null }
      : { ...base, thisValue, outcome: 'not_yet', line: lineOf(growth ?? visible[0]) }
  }
  if (count > 0 && strength) {
    return { ...base, thisValue, outcome: 'heard', line: lineOf(finding.featured?.polarity !== 'growth' ? finding.featured : strength) }
  }
  // Not heard: offer a line of the same kind where it could fit — a growth
  // line of this finding, else any line of the section.
  const anyInSection = section.findings.flatMap((f) => f.evidence).find((e) => !e.withheld)
  return { ...base, thisValue, outcome: 'not_yet', line: lineOf(growth ?? anyInSection) }
}

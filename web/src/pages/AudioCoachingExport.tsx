import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import {
  ACCENTS,
  Callout,
  ReportCover,
  ReportFooter,
  ReportSection,
  ReportShell,
  ReportState,
  StatTile,
  type Accent,
} from '../components/report'
import { getAudioSession, type AudioEscalationRung, type AudioQuote, type AudioSessionWithSegments } from '../lib/api'
import { buildCorrectionBalance, coverageCaveatLine, DETECTION_CAVEAT } from '../lib/correctionBalance'
import {
  formatRatio,
  getCoverage,
  getCountMetric,
  getFollowUpMetric,
  getPresenceMetric,
  waitTimeMetric,
  waitTime2Metric,
  speechRateMetric,
  leadingSilenceNote,
  CONVERSATIONAL_WPM_RANGE,
  isConfidentState,
  MIN_DURATION_FOR_CFU_DETECTION_SEC,
  TINY_RECORDING_THRESHOLD_SEC,
  type ConfidentMetric,
} from '../lib/reportConfidence'
import {
  buildNextTimeItems,
  buildStrengthCandidates,
  formatCandidateHeadline,
  pickTop,
} from '../lib/reportHighlights'

// A printable, section-per-page version of the Lesson Debrief report.
//
// Two constraints shape every decision below. First, it has to survive the
// printer: backgrounds only render because index.css sets
// print-color-adjust: exact globally, and each section carries an explicit
// page break so a teacher can hand one section to a coach without the rest.
// Second, it has to stay as honest as the in-app report — a metric that
// couldn't be measured reliably prints as a dash with its reason, never as a
// zero. That distinction is the whole credibility of the report.

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

function formatSessionDateTime(iso: string): string {
  const d = new Date(iso)
  return `${d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })} · ${d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`
}

function QuoteList({ label, quotes, accent }: { label: string; quotes: AudioQuote[]; accent: Accent }) {
  if (!quotes?.length) return null
  return (
    <div className="mt-4 break-inside-avoid">
      <p className={`text-[11px] font-bold uppercase tracking-wide ${accent.ink}`}>{label}</p>
      <div className="mt-2 flex flex-col gap-2">
        {quotes.slice(0, 6).map((q, i) => (
          <div key={i} className="rounded-xl border border-hairline bg-white p-3">
            <p className="text-sm italic text-ink">“{q.quote}”</p>
            <p className="mt-1 text-xs text-ink-soft">{formatTime(q.timestampSec)}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

// Bridges the audio report's confidence-gated metrics onto the shared
// StatTile: an unmeasurable value prints as a dash WITH its reason, never as
// a zero. That distinction is the credibility of the whole report.
function Stat({ label, metric, unit, accent }: { label: string; metric: ConfidentMetric; unit?: string; accent: Accent }) {
  const confident = isConfidentState(metric.state)
  return (
    <StatTile
      label={label}
      value={metric.display}
      unit={confident ? unit : undefined}
      hint={confident ? undefined : metric.reason}
      accent={accent}
    />
  )
}

// Matches the in-app wording in AudioCoaching.tsx's EscalationCard, so the
// printed page and the screen describe the same moment the same way.
const EXPORT_RUNG_PHRASE: Record<AudioEscalationRung, string> = {
  attention: 'asking for the room’s attention',
  behaviour: 'telling the room what to stop or start',
  named: 'naming a student',
  consequence: 'naming a consequence',
  removal: 'separating a student from the group',
}

export default function AudioCoachingExport() {
  const { id } = useParams<{ id: string }>()
  const [session, setSession] = useState<AudioSessionWithSegments | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!id) return
    getAudioSession(id)
      .then(setSession)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [id])

  if (loading) return <ReportState text="Loading…" />
  if (!session) return <ReportState text="Session not found." />

  const metrics = session.metricsDetail ?? {}
  // metricsDetail is nullable in the schema, so a session analyzed before a
  // given count existed has no key at all. Coercing that to 0 prints a
  // confident zero directly under a coverage line promising the opposite, so
  // absence stays null here and only becomes 0 where it is genuine arithmetic.
  const rawNum = (k: string): number | null => (typeof metrics[k] === 'number' ? (metrics[k] as number) : null)
  const num = (k: string): number => rawNum(k) ?? 0
  const recordedSec = session.durationSec ?? 0
  const coverage = getCoverage(session.durationSec, session.phases, session.metricsDetail)
  const isShort = recordedSec > 0 && recordedSec < TINY_RECORDING_THRESHOLD_SEC

  const teacherPct = session.teacherTalkPct
  const studentPct = session.studentTalkPct
  // One decimal, so the three shares add up to 100 rather than to 100.4.
  const silencePct =
    teacherPct != null && studentPct != null
      ? Math.max(0, Math.round((100 - teacherPct - studentPct) * 10) / 10)
      : null

  const questions = getCountMetric({ count: session.questionCount, recordedSec })
  const higherOrder =
    session.questionCount != null && rawNum('higherOrderQuestionCount') != null
      ? formatRatio(num('higherOrderQuestionCount'), session.questionCount)
      : null
  const waitTime = waitTimeMetric(session.avgWaitTimeSec, session.questionCount)
  const pace = speechRateMetric(rawNum('teacherWordsPerMinute'))
  const waitTime2 = waitTime2Metric(rawNum('waitTime2Sec'), rawNum('waitTime2SampleCount'))
  const followUps = getFollowUpMetric({
    count: rawNum('followUpQuestionCount'),
    studentVoiceSegments: rawNum('studentVoiceSegments'),
    recordedSec,
  })
  const cfu = getCountMetric({
    count: session.cfuCount,
    recordedSec,
    minDurationSec: MIN_DURATION_FOR_CFU_DETECTION_SEC,
  })
  const feedbackCounted = rawNum('specificFeedbackCount') != null || rawNum('genericFeedbackCount') != null
  const feedbackTotal = num('specificFeedbackCount') + num('genericFeedbackCount')
  const feedbackMoments = getCountMetric({ count: feedbackCounted ? feedbackTotal : null, recordedSec })
  const specificShare = feedbackTotal > 0 ? formatRatio(num('specificFeedbackCount'), feedbackTotal) : null

  // The strength the report picked out, and everything it suggests. Both are
  // built by the same functions the screen uses — a printed report that
  // disagreed with the screen about what a teacher should try next would be
  // worse than one that stayed silent.
  const strength = pickTop(buildStrengthCandidates(session, cfu, specificShare ?? cfu, higherOrder))
  const nextTimeItems = buildNextTimeItems(session)
  const contentNotes = session.contentNotes?.notes ?? []
  const teacherTalk = getPresenceMetric(teacherPct)
  const studentTalk = getPresenceMetric(studentPct)

  const A = ACCENTS
  const content = session.lessonContent
  // Two sections below are conditional, so the numbers have to be counted
  // as they render — hardcoding them printed 1,2,3,5,7 on a sparse session,
  // which reads as missing pages rather than as sections that don't apply.
  let n = 0

  return (
    <ReportShell backTo="/audio-coaching">
        <ReportCover
          eyebrow="Wivoza · Lesson Debrief"
          title={session.classSubject || 'Lesson report'}
          accentTitle={session.period ?? undefined}
          meta={[
            session.teacherName,
            formatSessionDateTime(session.sessionDate),
            session.gradeLevel,
            session.durationSec ? `${formatTime(session.durationSec)} recorded` : null,
          ]
            .filter(Boolean)
            .join(' · ')}
          badge={isShort ? 'Short excerpt — read as a snapshot, not a full lesson' : undefined}
        />

        {session.classSummary && (
          <div className="mt-5 break-inside-avoid rounded-2xl border-l-8 border-gold bg-gold-tint/50 p-6">
            <p className="text-[11px] font-bold uppercase tracking-wide text-terracotta-600">Lesson at a glance</p>
            <div className="mt-2 flex flex-col gap-2">
              {/* Any newline starts a paragraph, not only a blank line — see
                  splitParagraphs in AudioCoaching.tsx. */}
              {session.classSummary.split(/\n+/).map((p) => p.trim()).filter(Boolean).map((para, i) => (
                <p key={i} className="text-base leading-relaxed text-ink">
                  {para}
                </p>
              ))}
            </div>
          </div>
        )}

        {/* Silence belongs beside the two talk shares: they are shares of the
            recording, not of the talking, and without it 22.6% and 7.9% read as
            a missing 70%. */}
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-5">
          <Stat label="You spoke" metric={teacherTalk} unit="%" accent={A.terracotta} />
          <Stat label="Students spoke" metric={studentTalk} unit="%" accent={A.gold} />
          <Stat label="Silence / other" metric={getPresenceMetric(silencePct)} unit="%" accent={A.mint} />
          <Stat label="Questions" metric={questions} accent={A.mint} />
          <Stat label="Avg. wait" metric={waitTime} unit="s" accent={A.forest} />
        </div>

        <p className="mt-4 text-xs text-ink-soft">
          Coverage: {formatTime(coverage.recordedSec)} recorded of {formatTime(coverage.totalSec)}. A dash means
          Wivoza could not measure that reliably — never that the answer was zero.
        </p>

        {/* Talk & participation */}
        <ReportSection n={++n} title="Talk & Participation" blurb="Who was heard, and for how long." accent={A.terracotta}>
          {teacherPct != null && studentPct != null ? (
            <>
              <div className="flex h-8 w-full overflow-hidden rounded-full">
                <div className="bg-terracotta" style={{ width: `${teacherPct}%` }} />
                <div className="bg-gold" style={{ width: `${studentPct}%` }} />
                <div className="bg-hairline" style={{ width: `${silencePct ?? 0}%` }} />
              </div>
              <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm font-semibold text-ink">
                <span><span className="mr-1.5 inline-block h-3 w-3 rounded-full bg-terracotta align-[-1px]" />You {Math.round(teacherPct)}%</span>
                <span><span className="mr-1.5 inline-block h-3 w-3 rounded-full bg-gold align-[-1px]" />Students {Math.round(studentPct)}%</span>
                <span><span className="mr-1.5 inline-block h-3 w-3 rounded-full bg-hairline align-[-1px]" />Silence {silencePct ?? 0}%</span>
              </div>
            </>
          ) : (
            <p className="text-sm text-ink-soft">
              Talk balance could not be measured for this recording — the speakers were not separable.
            </p>
          )}
          {/* How fast, beside how long. The shares above say how much of the
              lesson each voice held and nothing about the pace of it. */}
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Stat label="Your pace" metric={pace} unit=" wpm" accent={A.terracotta} />
          </div>
          <p className="text-xs text-ink-soft">
            Words a minute of your own speaking time, short pauses included. Everyday conversation usually runs about
            {CONVERSATIONAL_WPM_RANGE} — a range to place yourself against, not a target.
          </p>
          {(silencePct ?? 0) > 0 && leadingSilenceNote(rawNum('firstWordSec')) && (
            <p className="text-xs text-ink-soft">{leadingSilenceNote(rawNum('firstWordSec'))}</p>
          )}

          {/* What the student talk was ABOUT — the only thing here that can
              tell a discussion from a room talking over itself, since the
              shares above read the same either way.

              The counts print; the off-topic QUOTES deliberately do not, where
              on screen they do. On screen a teacher reads their own students'
              words in private and can judge whether the label was fair. This
              page is the one they hand to an evaluator, and a student's
              "I'm not here, I don't have anything on this" set down in a
              shared document says something about that student, in a class
              small enough to identify them, in a document about someone
              else's teaching. The proportion is the teacher's to share; the
              quote is not ours to put in their hands. */}
        </ReportSection>

        {/* Questioning & checking — one section, two halves, as on screen.
            Asking and responding are one teaching move, and the half that
            depends on students answering out loud fails as a unit whenever the
            microphone didn't reach the room. */}
        <ReportSection
          n={++n}
          title="Questioning & Checking"
          blurb="What you asked, how you checked, and how you responded."
          accent={A.gold}
        >
          <p className="text-[11px] font-bold uppercase tracking-wide text-forest">What you asked</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Stat label="Questions asked" metric={questions} accent={A.gold} />
            {higherOrder && <Stat label="Higher-order" metric={higherOrder} accent={A.gold} />}
            <Stat label="Checks for understanding" metric={cfu} accent={A.gold} />
          </div>

          <p className="mt-1 text-[11px] font-bold uppercase tracking-wide text-forest">How you responded</p>
          <p className="text-xs text-ink-soft">
            Limited by how much of the room the microphone reached — a quiet answer leaves nothing to measure.
          </p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Avg. wait time" metric={waitTime} unit="s" accent={A.mint} />
            {/* The pause after an ANSWER, which is where a follow-up has to
                fit — and the reason the follow-up count beside it is low. */}
            <Stat label="Pause after an answer" metric={waitTime2} accent={A.mint} />
            <Stat label="Follow-ups" metric={followUps} accent={A.mint} />
            {specificShare && <Stat label="Feedback that was specific" metric={specificShare} accent={A.mint} />}
            <Stat label="Feedback moments" metric={feedbackMoments} accent={A.mint} />
          </div>

          <Callout
            label="Why wait time matters"
            body="Three to five seconds of silence after a question is the single cheapest change most teachers can make. It feels much longer than it is."
            accent={A.gold}
          />
        </ReportSection>

        {/* Clarity & content */}
        {content && (
          <ReportSection n={++n} title="Clarity & Content" blurb="What the lesson said it was about, in its own words." accent={A.forest}>
            {content.summary && (
              <div className="break-inside-avoid rounded-2xl bg-mint-tint/50 p-5">
                <p className="text-[11px] font-bold uppercase tracking-wide text-forest">What this lesson covered</p>
                <p className="mt-1.5 text-sm text-ink">{content.summary}</p>
              </div>
            )}
            {/* No "Stated objective" block, deliberately, and it should not
                come back. The screen dropped it for a documented reason — a
                detection that reads "none" while the lesson plainly contained
                the thing — and this page had kept it, so the printable report
                made a claim the screen had stopped making.

                The detector cannot support it either way. On real lessons it
                counted "Today, we're starting it" as a stated objective, and
                three of its other four passes were agenda announcements — what
                students would DO, not what they would understand. A detector
                that loose saying "yes" is equally untrustworthy saying "no",
                and here that "no" printed as "not said aloud anywhere in this
                recording" into the one document a teacher hands to a coach or
                an administrator and cannot annotate.

                The field is still stored and still used, as one input among
                several in Rubric Lens 3a and the Hard Look's content scope,
                rather than as a verdict of its own. */}
            <QuoteList label="Key vocabulary moments" quotes={content.vocabulary ?? []} accent={A.forest} />
            <QuoteList label="Connections to the wider world" quotes={content.connections ?? []} accent={A.forest} />
          </ReportSection>
        )}

        {/* Climate & routines */}
        <ReportSection n={++n} title="Climate & Routines" blurb="Counts, not scores. There is no such thing as a correct number here." accent={A.terracotta}>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {([
              ['Transitions', 'transitionCount'],
              ['Clear directions', 'directiveCount'],
              ['Student names used', 'nameMentionCount'],
              ['Redirections', 'redirectionCount'],
            ] as const).map(([label, key]) => (
              <Stat
                key={key}
                label={label}
                metric={getCountMetric({ count: rawNum(key), recordedSec })}
                accent={A.terracotta}
              />
            ))}
          </div>
          {/* Whether the asking HELD. The counts above cannot answer that, and
              it is the question a teacher in a hard room is actually asking.
              Never a bid count — that number moves between readings while the
              run and the rung it reached do not. */}
          {/* Repeated redirections, when the report has it — the same findings
              and server-written copy as the in-app section. */}
          {session.escalation?.repeatedRedirections && session.escalation.repeatedRedirections.state !== 'unread' && (
            <div className="mt-4 break-inside-avoid rounded-2xl bg-gold-tint/50 p-5">
              <p className="text-[11px] font-bold uppercase tracking-wide text-terracotta-600">Repeated redirections</p>
              {session.escalation.repeatedRedirections.headline && (
                <p className="mt-2 text-sm font-semibold text-forest">{session.escalation.repeatedRedirections.headline}</p>
              )}
              {session.escalation.repeatedRedirections.findings.map((f) => (
                <div key={`${f.expectation}-${f.startSec}`} className="mt-3">
                  <p className="text-sm font-semibold text-forest">{f.title}</p>
                  {f.lead.quote && (
                    <p className="mt-1 text-sm italic text-forest">
                      “{f.lead.quote}” · {formatTime(f.lead.timestampSec)}
                    </p>
                  )}
                  <p className="mt-1 text-sm text-forest">{f.pattern}</p>
                  {f.more.length > 0 && (
                    <p className="mt-1 text-xs text-forest/80">
                      More evidence: {f.more.map((m) => `“${m.quote}” (${formatTime(m.timestampSec)})`).join(' · ')}
                    </p>
                  )}
                </div>
              ))}
              {session.escalation.repeatedRedirections.coverageNote && (
                <p className="mt-2 text-[11px] text-forest/70">{session.escalation.repeatedRedirections.coverageNote}</p>
              )}
            </div>
          )}
          {session.escalation && !session.escalation.repeatedRedirections && session.escalation.state !== 'confirmed_none' && (
            <div className="mt-4 break-inside-avoid rounded-2xl bg-gold-tint/50 p-5">
              <p className="text-[11px] font-bold uppercase tracking-wide text-terracotta-600">
                {session.escalation.episodes ? 'Keeping learning on track' : 'Did your asks hold?'}
              </p>
              {session.escalation.state === 'not_measurable' ? (
                <p className="mt-2 text-sm text-forest">{session.escalation.reason}</p>
              ) : session.escalation.episodes ? (
                <>
                  {/* Same findings, same server-written copy, as the in-app panel. */}
                  {session.escalation.episodes.map((e) => (
                    <div key={`${e.startSec}-${e.title}`} className="mt-3">
                      <p className="text-sm font-semibold text-forest">{e.title}</p>
                      {e.lead.quote && (
                        <p className="mt-1 text-sm italic text-forest">
                          “{e.lead.quote}” · {formatTime(e.lead.timestampSec)}
                        </p>
                      )}
                      <p className="mt-1 text-sm text-forest">{e.pattern}</p>
                      {e.more.length > 0 && (
                        <p className="mt-1 text-xs text-forest/80">
                          More evidence: {e.more.map((m) => `“${m.quote}” (${formatTime(m.timestampSec)})`).join(' · ')}
                        </p>
                      )}
                      {e.nextStep && <p className="mt-1 text-sm text-forest"><b>Next step:</b> {e.nextStep}</p>}
                    </div>
                  ))}
                  {session.escalation.episodes.length === 0 && (
                    <p className="mt-2 text-sm text-forest">Your reminders were routine: none came back as a repeated pattern.</p>
                  )}
                </>
              ) : (
                <>
                  {session.escalation.clusters[0] && (
                    <>
                      <p className="mt-2 text-sm font-semibold text-forest">
                        Around {formatTime(session.escalation.clusters[0].startSec)} you asked for the room several times
                        in quick succession
                        {session.escalation.clusters[0].climbed
                          ? `, rising from ${EXPORT_RUNG_PHRASE[session.escalation.clusters[0].fromRung]} to ${EXPORT_RUNG_PHRASE[session.escalation.clusters[0].topRung]}.`
                          : '.'}
                      </p>
                      {session.escalation.clusters[0].quote && (
                        <p className="mt-1 text-sm italic text-forest">“{session.escalation.clusters[0].quote}”</p>
                      )}
                      <p className="mt-1 text-sm text-forest">
                        Asking again that soon means the first ask didn’t land.
                      </p>
                    </>
                  )}
                  {session.escalation.repeatedAsks[0] && (
                    <p className="mt-2 text-sm text-forest">
                      At {formatTime(session.escalation.repeatedAsks[0].timestampSec)} your own words noted you’d already
                      asked once
                      {session.escalation.repeatedAsks[0].quote ? ` — “${session.escalation.repeatedAsks[0].quote}”` : '.'}
                    </p>
                  )}
                  <p className="mt-2 text-[11px] text-forest/70">
                    Read from your speech alone. Whether the room settled is not something a room microphone can hear.
                  </p>
                </>
              )}
            </div>
          )}
          {/* Redirections set against encouragement. The old block here was a
              positive/corrective bar with no reading attached, which left the
              most telling pairing in the section — redirections against
              encouragement — unsaid on the page and absent from the screen
              entirely. Zero encouragement is always labelled "detected". */}
          {(() => {
            const balance = buildCorrectionBalance(session.metricsDetail, coverage.capturedSharePct)
            if (balance.empty || !balance.line) return null
            return (
              <div className="mt-4 break-inside-avoid rounded-2xl bg-peach-tint/50 p-5">
                <p className="text-[11px] font-bold uppercase tracking-wide text-terracotta-600">
                  Correction and encouragement
                </p>
                <p className="mt-2 text-sm text-forest">
                  {balance.redirections} redirection{balance.redirections === 1 ? '' : 's'} ·{' '}
                  {balance.positives} encouragement detected · {balance.correctives} corrective
                </p>
                <p className="mt-2 text-sm text-forest">{balance.line}</p>
                {balance.detectionCaveat && (
                  <p className="mt-2 text-[11px] text-forest/70">{DETECTION_CAVEAT}</p>
                )}
                {balance.coverageCaveat && (
                  <p className="mt-1 text-[11px] text-forest/70">{coverageCaveatLine(coverage.capturedSharePct)}</p>
                )}
              </div>
            )
          })()}
        </ReportSection>

        {/* Rubric Lens — only once the teacher has asked for it in the app.
            The page they'd bring to an evaluation conversation, so it prints
            the same evidence-and-next-step view, never a level. */}
        {session.rubricLens && (
          <ReportSection
            n={++n}
            title="Rubric Lens"
            blurb={`${session.rubricLens.frameworkName}: evidence from this lesson for each component. Not a rating.`}
            accent={A.forest}
          >
            <div className="flex flex-col gap-3">
              {session.rubricLens.components.map((c) => (
                <div key={c.code} className="break-inside-avoid rounded-2xl border border-hairline bg-white p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-md bg-gold px-2 py-0.5 text-xs font-bold text-forest">{c.code}</span>
                    <span className="font-heading text-base font-bold text-forest">{c.name}</span>
                    <span className="text-[11px] text-ink-soft">
                      {c.audibility === 'strong' ? 'Audio shows this well' : 'Audio shows part of this'}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-ink">{c.summary}</p>
                  {c.evidence.map((e, i) => (
                    <p key={i} className="mt-1.5 border-l-2 border-gold/60 pl-3 text-sm text-ink">
                      “{e.text}” <span className="text-xs text-ink-soft">({formatTime(e.timestampSec)} · {e.kind})</span>
                    </p>
                  ))}
                  {c.nextStep && (
                    <p className="mt-2 rounded-xl bg-gold-tint/50 px-3 py-2 text-sm text-ink">
                      <span className="font-semibold">Next step to try: </span>
                      {c.nextStep}
                    </p>
                  )}
                </div>
              ))}
              {session.rubricLens.notObservable.map((c) => (
                <p key={c.code} className="break-inside-avoid rounded-2xl border border-dashed border-hairline p-4 text-sm text-ink-soft">
                  <span className="font-semibold">
                    {c.code} {c.name}:
                  </span>{' '}
                  not in a recording. {c.reason}
                </p>
              ))}
            </div>
          </ReportSection>
        )}

        {/* The Hard Look is deliberately NOT printed here, and should not be
            added. This page is the one a teacher brings to an evaluation
            conversation, and the Hard Look's own invitation promises them it
            reaches no evaluator and changes nothing in their report. A teacher
            will only ask for an unsparing critique of their own lesson while
            that stays true; printing it into the shareable report is how the
            feature stops being used. It lives on screen, for them, only. */}

        {/* The one thing the report picked out as having worked. Screen-only
            until now, which meant an exported report named every number and
            nothing that went right. */}
        {strength && (
          <ReportSection
            n={++n}
            title="A strength to keep"
            blurb="Something that worked in this lesson — keep doing it."
            accent={A.mint}
          >
            <p className="text-sm font-semibold text-ink">{formatCandidateHeadline(strength)}</p>
            {strength.excerpt && <p className="mt-1 text-sm italic text-ink-soft">“{strength.excerpt}”</p>}
            <p className="mt-1 text-sm text-ink-soft">{strength.whyItMatters}</p>
          </ReportSection>
        )}

        {/* Moments */}
        {session.highlights && session.highlights.length > 0 && (
          <ReportSection n={++n} title="Moments Worth Revisiting" blurb="Specific points in the recording, with timestamps." accent={A.gold}>
            <div className="flex flex-col gap-2">
              {session.highlights.slice(0, 12).map((h, i) => (
                <div key={i} className="flex items-start gap-3 break-inside-avoid rounded-xl border border-hairline bg-white p-3">
                  <span className="shrink-0 rounded-md bg-gold-tint px-2 py-0.5 font-mono text-xs font-bold text-terracotta-600">
                    {formatTime(h.timestampSec)}
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-forest">{h.label}</p>
                    {h.excerpt && <p className="mt-0.5 text-sm italic text-ink-soft">“{h.excerpt}”</p>}
                  </div>
                </div>
              ))}
            </div>
          </ReportSection>
        )}

        {/* The subject-specialist reading. The printable Clarity & Content
            section carried vocabulary and connections only, so an exported
            report reached a coach with the measurements and none of the
            reading of the content itself. */}
        {contentNotes.length > 0 && (
          <ReportSection
            n={++n}
            title="Notes from a subject specialist"
            blurb={`How this topic was taught${session.contentNotes?.subject ? `, read as a specialist in ${session.contentNotes.subject} would` : ''}.`}
            accent={A.forest}
          >
            <div className="flex flex-col gap-3">
              {contentNotes.map((note) => (
                <div key={note.id} className="break-inside-avoid rounded-2xl border border-hairline bg-white p-4">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-terracotta-600">{note.label}</p>
                  <p className="mt-1 text-sm text-ink">{note.text}</p>
                  {note.excerpt && (
                    <p className="mt-1.5 border-l-2 border-gold/60 pl-3 text-sm italic text-ink-soft">
                      “{note.excerpt}”
                      {note.timestampSec != null && (
                        <span className="ml-1 not-italic text-xs">({formatTime(note.timestampSec)})</span>
                      )}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </ReportSection>
        )}

        {/* Everything the report suggests, in one list — the most actionable
            part of it, and the part the printed version did not carry. */}
        {nextTimeItems.length > 0 && (
          <ReportSection
            n={++n}
            title="Try next time"
            blurb="What this report suggests, from every section, in one list."
            accent={A.gold}
          >
            <div className="flex flex-col gap-2">
              {nextTimeItems.map((item) => (
                <div key={item.id} className="break-inside-avoid rounded-xl border border-hairline bg-white p-3">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-ink-soft">{item.from}</p>
                  <p className="mt-0.5 text-sm text-ink">
                    {item.lead ? <span className="font-semibold">{item.lead}: </span> : null}
                    {item.text}
                  </p>
                </div>
              ))}
            </div>
          </ReportSection>
        )}

        {/* Reflection */}
        <ReportSection n={++n} title="My Reflection" blurb="Your own words — the part that turns a report into a change." accent={A.forest}>
          {session.strengths && <Callout label="Strengths" body={session.strengths} accent={A.mint} />}
          {session.growthAreas && <Callout label="Growth areas" body={session.growthAreas} accent={A.gold} />}
          {session.nextStep && <Callout label="My next step" body={session.nextStep} accent={A.terracotta} />}
          {session.followUpDate && (
            <p className="mt-4 text-sm font-semibold text-forest">
              Follow-up date: {new Date(session.followUpDate).toLocaleDateString()}
            </p>
          )}
          {!session.strengths && !session.growthAreas && !session.nextStep && (
            <div className="rounded-2xl border-2 border-dashed border-hairline p-8 text-center">
              <p className="text-sm text-ink-soft">
                No notes written yet. Open the Reflect tab to add your strengths, growth areas and next step —
                they will appear here next time you print.
              </p>
            </div>
          )}
        </ReportSection>

        <ReportFooter />
    </ReportShell>
  )
}

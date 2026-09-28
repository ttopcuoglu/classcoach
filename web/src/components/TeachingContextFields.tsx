import { TEACHING_AND_LEARNING } from '../lib/focusAreas'
import {
  COURSE_LEVELS,
  COURSE_LEVEL_BLURB,
  GRADE_BANDS,
  OTHER_COURSE,
  OTHER_SUBJECT,
  SUBJECTS,
  coursesFor,
} from '../lib/teachingContext'

export type TeachingContext = {
  gradeBand: string
  subject?: string
  /// 9-12 only — the course a subject splits into (Algebra 2, Chemistry).
  course?: string
  /// What they are teaching right now. Free text, and the only room field that
  /// changes weekly — so it is never defaulted or remembered.
  topic?: string
  courseLevel?: string
  /// The teacher picked "Other"; the free-text box then owns `subject`.
  otherSubject: boolean
  /// Same, for the course — middle school naming varies by district.
  otherCourse: boolean
}

export const DEFAULT_TEACHING_CONTEXT: TeachingContext = {
  gradeBand: '6-8',
  subject: undefined,
  course: undefined,
  topic: undefined,
  courseLevel: undefined,
  otherSubject: false,
  otherCourse: false,
}

// Shared by Ask and Practice, because both need the same answers and they have
// to agree. Rendered on the dark stage card in both places, always visible —
// this used to sit behind a "Change" fold, which made the room look optional.
//
// Grade band is asked for every section: a K-2 room and a 9-12 room differ
// whether the question is about behavior, a parent, or a colleague. Subject,
// course and level open only under Teaching and Learning, where they're what
// the coaching is actually about — a parent email doesn't get better for
// knowing it came from an honors section.
export default function TeachingContextFields({
  focusArea,
  value,
  onChange,
  disabled,
}: {
  focusArea?: string
  value: TeachingContext
  onChange: (next: TeachingContext) => void
  disabled?: boolean
}) {
  const showSubjectAndLevel = focusArea === TEACHING_AND_LEARNING
  const courses = coursesFor(value.gradeBand, value.otherSubject ? undefined : value.subject)

  function set(patch: Partial<TeachingContext>) {
    onChange({ ...value, ...patch })
  }

  const chip = (selected: boolean) =>
    `rounded-full px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-60 ${
      selected ? 'bg-gold text-forest' : 'bg-cream/10 text-cream/80 hover:bg-cream/20 hover:text-cream'
    }`

  return (
    <div className="flex flex-col gap-3.5 rounded-2xl bg-cream/10 p-4">
      <div>
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-gold">Grade band</p>
        <div className="mt-1.5 flex flex-wrap gap-2">
          {GRADE_BANDS.map((band) => (
            <button
              key={band}
              type="button"
              disabled={disabled}
              // A course list is band-specific, so changing band drops the
              // course. The topic survives on purpose: photosynthesis is taught
              // in 6-8 Science as well as 9-12 Biology, so moving band is not a
              // contradiction the way changing subject is.
              onClick={() => set({ gradeBand: band, course: undefined, otherCourse: false })}
              aria-pressed={value.gradeBand === band}
              className={chip(value.gradeBand === band)}
            >
              Grades {band}
            </button>
          ))}
        </div>
      </div>

      {showSubjectAndLevel && (
      <div>
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-gold">Subject</p>
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          {SUBJECTS.map((s) => (
            <button
              key={s}
              type="button"
              disabled={disabled}
              onClick={() =>
                set(
                  value.subject === s && !value.otherSubject
                    ? { subject: undefined, course: undefined, topic: undefined, otherSubject: false, otherCourse: false }
                    : { subject: s, course: undefined, topic: undefined, otherSubject: false, otherCourse: false },
                )
              }
              aria-pressed={!value.otherSubject && value.subject === s}
              className={chip(!value.otherSubject && value.subject === s)}
            >
              {s}
            </button>
          ))}
          <button
            type="button"
            disabled={disabled}
            onClick={() =>
              set({ otherSubject: true, subject: undefined, course: undefined, topic: undefined, otherCourse: false })
            }
            aria-pressed={value.otherSubject}
            className={chip(value.otherSubject)}
          >
            {OTHER_SUBJECT}
          </button>
          {value.otherSubject && (
            <input
              type="text"
              value={value.subject ?? ''}
              onChange={(e) => set({ subject: e.target.value.trim() ? e.target.value : undefined })}
              placeholder="Which subject?"
              aria-label="Subject"
              disabled={disabled}
              className="w-40 rounded-full border-0 bg-cream px-3 py-1.5 text-xs text-ink placeholder:text-ink-soft focus:outline-none focus:ring-2 focus:ring-gold"
            />
          )}
        </div>
      </div>
      )}

      {/* Wherever the band departmentalises — 6-8 and 9-12 — and once a subject
          is chosen. "Math" describes a 4th grade classroom, but says almost
          nothing about a middle or high school schedule: Math 7 and Algebra 1
          are different rooms, and that distinction is what a grade number was
          never going to capture. */}
      {showSubjectAndLevel && courses.length > 0 && (
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-gold">Course</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            {courses.map((c) => (
              <button
                key={c}
                type="button"
                disabled={disabled}
                onClick={() => set({ course: value.course === c ? undefined : c, otherCourse: false })}
                aria-pressed={!value.otherCourse && value.course === c}
                className={chip(!value.otherCourse && value.course === c)}
              >
                {c}
              </button>
            ))}
            <button
              type="button"
              disabled={disabled}
              onClick={() => set({ otherCourse: true, course: undefined })}
              aria-pressed={value.otherCourse}
              className={chip(value.otherCourse)}
            >
              {OTHER_COURSE}
            </button>
            {value.otherCourse && (
              <input
                type="text"
                value={value.course ?? ''}
                onChange={(e) => set({ course: e.target.value.trim() ? e.target.value : undefined })}
                placeholder="What's it called?"
                aria-label="Course"
                disabled={disabled}
                className="w-44 rounded-full border-0 bg-cream px-3 py-1.5 text-xs text-ink placeholder:text-ink-soft focus:outline-none focus:ring-2 focus:ring-gold"
              />
            )}
          </div>
        </div>
      )}

      {/* Subject and course say what room this is; topic says what is happening
          in it this week. Practice has no other channel for it — a teacher
          types nothing before a scenario is generated — so without this the
          model picks the topic, and a protein-synthesis scenario is no use to
          someone teaching photosynthesis on Thursday. Free text, because you
          cannot enumerate topics; never defaulted, because it changes weekly. */}
      {showSubjectAndLevel && (
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-gold">
            Topic or unit <span className="font-medium normal-case tracking-normal text-cream/50">(optional)</span>
          </p>
          <input
            type="text"
            value={value.topic ?? ''}
            onChange={(e) => set({ topic: e.target.value.trim() ? e.target.value : undefined })}
            placeholder="What are you teaching right now? e.g. photosynthesis"
            aria-label="Topic or unit"
            disabled={disabled}
            className="mt-1.5 w-full max-w-sm rounded-full border-0 bg-cream px-4 py-2 text-xs text-ink placeholder:text-ink-soft focus:outline-none focus:ring-2 focus:ring-gold"
          />
          {value.topic && (
            <p className="mt-1.5 text-xs text-cream/50">Scenarios and coaching will be about {value.topic}.</p>
          )}
        </div>
      )}

      {showSubjectAndLevel && (
      <div>
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-gold">Level</p>
        <div className="mt-1.5 flex flex-wrap gap-2">
          {COURSE_LEVELS.map((level) => (
            <button
              key={level}
              type="button"
              disabled={disabled}
              onClick={() => set({ courseLevel: value.courseLevel === level ? undefined : level })}
              aria-pressed={value.courseLevel === level}
              className={chip(value.courseLevel === level)}
            >
              {level}
            </button>
          ))}
        </div>
        <p className="mt-1.5 text-xs text-cream/50">
          {value.courseLevel
            ? COURSE_LEVEL_BLURB[value.courseLevel]
            : 'Changes the coaching more than anything else here — an inclusion section and an AP section are different jobs.'}
        </p>
      </div>
      )}
    </div>
  )
}

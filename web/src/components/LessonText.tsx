import { Blocks } from './LessonWorkspace'
import { layoutLessonText, splitQuotes, type LeadBlock, type LessonActivity, type LessonRow } from '../lib/lessonTextLayout'

// A school-format section's text, laid out for reading (lib/lessonTextLayout):
// each activity gets its title and minutes, Teacher and Students each get a
// labelled line, the words to say aloud are set apart, and short lead-ins are
// bold. Screen only — Copy, Word and Canvas still take the text as written.

const ROLE_STYLE: Record<LessonRow['role'], { label: string; bar: string }> = {
  teacher: { label: 'text-terracotta-strong', bar: 'bg-terracotta/70' },
  students: { label: 'text-[#2E5E46]', bar: 'bg-[#4F9A72]/70' },
}

function Spoken({ text }: { text: string }) {
  return (
    <>
      {splitQuotes(text).map((part, i) =>
        part.quote ? (
          <span key={i} className="font-medium text-forest-soft [font-style:italic]">
            {part.text}
          </span>
        ) : (
          <span key={i}>{part.text}</span>
        ),
      )}
    </>
  )
}

function RowText({ row }: { row: LessonRow }) {
  return (
    <div className="flex flex-col gap-1.5">
      {row.blocks.map((block, i) =>
        block.t === 'ul' || block.t === 'ol' ? (
          <Blocks key={i} blocks={[block]} />
        ) : (
          <p key={i} className="whitespace-pre-line">
            <Spoken text={'text' in block ? block.text : ''} />
          </p>
        ),
      )}
    </div>
  )
}

function Activity({ activity }: { activity: LessonActivity }) {
  return (
    <div className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0">
      {(activity.title || activity.minutes) && (
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          {activity.title && <h4 className="font-heading text-[16px] font-bold leading-snug text-forest">{activity.title}</h4>}
          {activity.minutes && (
            <span className="shrink-0 rounded-full bg-sage px-2.5 py-0.5 text-xs font-semibold text-forest">{activity.minutes} min</span>
          )}
        </div>
      )}
      {activity.rows.map((row, i) => {
        const style = ROLE_STYLE[row.role]
        return (
          <div key={i} className="flex gap-3">
            <span aria-hidden="true" className={`w-[3px] shrink-0 rounded-full ${style.bar}`} />
            <div className="min-w-0 flex-1">
              <p className={`text-[11px] font-bold uppercase tracking-[0.12em] ${style.label}`}>{row.label}</p>
              <div className="mt-0.5 text-[15px] leading-relaxed text-forest">
                <RowText row={row} />
              </div>
            </div>
          </div>
        )
      })}
      {activity.notes.length > 0 && <Prose blocks={activity.notes} />}
    </div>
  )
}

function Prose({ blocks }: { blocks: LeadBlock[] }) {
  return (
    <div className="flex flex-col gap-3 text-[15px] leading-relaxed text-forest">
      {blocks.map((block, i) =>
        block.t === 'lead' ? (
          <p key={i}>
            <span className="font-semibold">{block.lead}</span> <Spoken text={block.text} />
          </p>
        ) : block.t === 'p' ? (
          <p key={i} className="whitespace-pre-wrap">
            <Spoken text={block.text} />
          </p>
        ) : (
          <Blocks key={i} blocks={[block]} />
        ),
      )}
    </div>
  )
}

export function LessonText({ text }: { text: string | null | undefined }) {
  const parts = layoutLessonText(text)
  return (
    <div className="flex flex-col divide-y divide-divider">
      {parts.map((part, i) =>
        part.t === 'activity' ? (
          <Activity key={i} activity={part} />
        ) : (
          <div key={i} className="py-4 first:pt-0 last:pb-0">
            <Prose blocks={part.blocks} />
          </div>
        ),
      )}
    </div>
  )
}

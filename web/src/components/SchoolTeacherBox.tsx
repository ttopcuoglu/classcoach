import { useCallback, useRef, useState } from 'react'
import { findObservableTeachers, type ObservableTeacher } from '../lib/api'

// The Teacher box a supervisor fills in for an Observation or a Lesson Plan
// review: type a name or email, and teachers at their school appear (their own
// teachers first); a name not in Wivoza can be typed too.

const input = 'w-full rounded-xl border border-hairline bg-white px-4 py-2.5 text-sm text-ink focus:border-forest focus:outline-none'

// ---- the Teacher box: type, with suggestions from the school ----

export type TeacherPick = { id: string | null; name: string; subject?: string | null; gradeLevel?: string | null }

export function TeacherBox({ value, onChange }: { value: TeacherPick; onChange: (t: TeacherPick) => void }) {
  const [open, setOpen] = useState(false)
  const [options, setOptions] = useState<ObservableTeacher[]>([])
  const [active, setActive] = useState(-1)
  const timer = useRef<number | null>(null)
  const search = useCallback((q: string) => {
    if (timer.current) window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => {
      findObservableTeachers(q)
        .then((r) => {
          setOptions(r)
          setActive(-1)
        })
        .catch(() => setOptions([]))
    }, 180)
  }, [])
  const pick = (t: ObservableTeacher) => {
    onChange({ id: t.id, name: t.name, subject: t.subject, gradeLevel: t.gradeLevel })
    setOpen(false)
  }
  return (
    <div className="relative">
      <input
        role="combobox"
        aria-expanded={open}
        aria-controls="teacher-options"
        aria-autocomplete="list"
        value={value.name}
        placeholder="Type a name or email"
        onFocus={() => {
          setOpen(true)
          search(value.id ? '' : value.name)
        }}
        onBlur={() => window.setTimeout(() => setOpen(false), 150)}
        onChange={(e) => {
          onChange({ id: null, name: e.target.value })
          setOpen(true)
          search(e.target.value.trim())
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault()
            setActive((a) => Math.min(options.length - 1, a + 1))
          } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            setActive((a) => Math.max(0, a - 1))
          } else if (e.key === 'Enter' && open && active >= 0 && options[active]) {
            e.preventDefault()
            pick(options[active])
          } else if (e.key === 'Escape') setOpen(false)
        }}
        className={input}
      />
      {open && options.length > 0 && (
        <ul id="teacher-options" role="listbox" className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-xl border border-hairline bg-white py-1 shadow-lg">
          {options.map((t, i) => (
            <li
              key={t.id}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => {
                e.preventDefault()
                pick(t)
              }}
              className={`cursor-pointer px-4 py-2 ${i === active ? 'bg-mint-tint/50' : 'hover:bg-cream'}`}
            >
              <p className="text-sm font-semibold text-ink">
                {t.name}
                {t.mine && <span className="ml-2 text-xs font-normal text-forest">Your teacher</span>}
              </p>
              <p className="text-xs text-ink-soft">{[t.email, t.subject, t.gradeLevel ? `Grade ${t.gradeLevel.replace(/(st|nd|rd|th)$/i, '')}` : null].filter(Boolean).join(' · ')}</p>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-1.5 text-xs text-ink-soft">
        {value.id
          ? 'From your school. They can receive the report in Wivoza.'
          : value.name.trim()
            ? 'Not linked to a Wivoza account. You can still observe; choose them from the list before sending.'
            : 'Teachers at your school appear as you type.'}
      </p>
    </div>
  )
}

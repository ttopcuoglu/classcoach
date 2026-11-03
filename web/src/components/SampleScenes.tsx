import type { ComponentType } from 'react'

// Banner drawings for the home page's sample cards, one per tool, in the same
// flat style as RecordYourWay: people with no faces, so any teacher can see
// themselves in them, on the card's own tint.

const SKIN = { a: '#8d5a3b', b: '#f1c9a5', c: '#c58b62', d: '#e0a97e' }
const INK = '#1b2e28'
const LINE = '#c9d6cf'

/// Talk It Through: a teacher on the walk home, talking it out with Coach.
function TalkScene() {
  return (
    <svg viewBox="0 0 320 120" className="h-full w-full" role="img" aria-label="A teacher walking home talks through a hard class with Coach on her phone">
      <rect x="0" y="104" width="320" height="16" fill="#e7d3c3" />
      <path d="M20 104 v-34 h26 v34M60 104 v-50 h30 v50" fill="#efe0d2" />
      <path d="M118 104 q4 -38 26 -42 q22 4 26 42z" fill="#2f6f66" />
      <circle cx="144" cy="44" r="14" fill={SKIN.c} />
      <path d="M129 44 q0 -20 15 -20 q15 0 15 20 q-3 -10 -15 -10 q-12 0 -15 10z" fill="#3a2418" />
      <path d="M129 46 q-3 14 1 24" stroke="#3a2418" strokeWidth="5" fill="none" strokeLinecap="round" />
      <path d="M164 72 q12 -2 14 -18" stroke={SKIN.c} strokeWidth="9" fill="none" strokeLinecap="round" />
      <rect x="172" y="40" width="12" height="20" rx="3" fill={INK} />
      {/* What she said, and Coach's answer. */}
      <rect x="196" y="16" width="96" height="26" rx="13" fill="#ffffff" />
      <path d="M208 29 h4M216 24 v10M222 21 v16M228 25 v8M234 22 v14M240 27 v4M246 23 v12M252 26 v6M258 29 h4" stroke="#c96a45" strokeWidth="3" strokeLinecap="round" />
      <path d="M200 40 l-10 8 l14 -4z" fill="#ffffff" />
      <rect x="214" y="54" width="92" height="30" rx="12" fill={INK} />
      <path d="M226 65 h56M226 74 h38" stroke="#e4b84a" strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}

/// Communication Coach: a draft to a parent, read again before it goes.
function EmailScene() {
  return (
    <svg viewBox="0 0 320 120" className="h-full w-full" role="img" aria-label="A teacher at a laptop rereads an email to a parent before sending it">
      <rect x="0" y="96" width="320" height="10" fill="#b35a38" />
      <path d="M40 96 q6 -40 30 -44 q24 4 30 44z" fill="#e4b84a" />
      <circle cx="70" cy="34" r="14" fill={SKIN.a} />
      <path d="M55 30 q2 -16 15 -16 q13 0 15 14 q-6 -6 -15 -6 q-9 0 -15 8z" fill="#20140d" />
      <path d="M92 74 l20 12" stroke={SKIN.a} strokeWidth="9" strokeLinecap="round" />
      <rect x="104" y="48" width="74" height="46" rx="4" fill={INK} />
      <rect x="108" y="52" width="66" height="38" rx="2" fill="#f7f3ea" />
      <path d="M114 62 h40M114 70 h52M114 78 h30" stroke={LINE} strokeWidth="3" strokeLinecap="round" />
      <path d="M100 94 h86 l-6 4 h-74z" fill="#2a4239" />
      {/* The envelope, with a gentler second read. */}
      <rect x="208" y="26" width="84" height="56" rx="6" fill="#ffffff" />
      <path d="M208 30 l42 30 l42 -30" stroke="#e7d3c3" strokeWidth="3" fill="none" />
      <circle cx="288" cy="28" r="13" fill="#2f6f66" />
      <path d="M282 28 l4 4 l8 -8" stroke="#ffffff" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M190 54 h12 l-4 -4M202 54 l-4 4" stroke="#6b6259" strokeWidth="2" fill="none" strokeLinecap="round" />
    </svg>
  )
}

/// Redesign for AI: the essay a chatbot could write, turned into thinking out
/// loud in a small group.
function RedesignScene() {
  return (
    <svg viewBox="0 0 320 120" className="h-full w-full" role="img" aria-label="An essay assignment marked with an AI sparkle becomes a small group of students explaining their food chain">
      <rect x="22" y="14" width="74" height="92" rx="5" fill="#ffffff" transform="rotate(-6 59 60)" />
      <path d="M36 34 h44M36 44 h48M36 54 h40M36 64 h46M36 74 h34M36 84 h42" stroke={LINE} strokeWidth="3" strokeLinecap="round" transform="rotate(-6 59 60)" />
      <path d="M92 18 l4 9 l9 4 l-9 4 l-4 9 l-4 -9 l-9 -4 l9 -4z" fill="#e4b84a" />
      <path d="M120 60 h34 l-6 -6M154 60 l-6 6" stroke="#6b6259" strokeWidth="3" fill="none" strokeLinecap="round" />
      <rect x="168" y="96" width="140" height="10" fill="#b8c9bd" />
      {[
        { x: 192, skin: SKIN.b, hair: '#c98b3c', shirt: '#c96a45' },
        { x: 238, skin: SKIN.a, hair: '#20140d', shirt: '#2f6f66' },
        { x: 284, skin: SKIN.d, hair: '#5a3a26', shirt: '#8b7bc2' },
      ].map((s) => (
        <g key={s.x}>
          <path d={`M${s.x - 18} 96 q4 -30 18 -32 q14 2 18 32z`} fill={s.shirt} />
          <circle cx={s.x} cy="52" r="11" fill={s.skin} />
          <path d={`M${s.x - 11} 50 q1 -13 11 -13 q10 0 11 13 q-4 -6 -11 -6 q-7 0 -11 6z`} fill={s.hair} />
        </g>
      ))}
      {/* A food chain on the shared card between them. */}
      <rect x="206" y="14" width="64" height="22" rx="11" fill="#ffffff" />
      <circle cx="220" cy="25" r="4" fill="#2f855a" />
      <circle cx="238" cy="25" r="4" fill="#d08a2a" />
      <circle cx="256" cy="25" r="4" fill="#c96a45" />
      <path d="M225 25 h8M243 25 h8" stroke="#6b6259" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

/// Improve a lesson: Coach's suggestion stuck on the teacher's own plan.
function PlanScene() {
  return (
    <svg viewBox="0 0 320 120" className="h-full w-full" role="img" aria-label="A teacher reads a lesson plan with Coach's suggestion stuck beside one step">
      <rect x="128" y="10" width="92" height="100" rx="6" fill="#ffffff" />
      <rect x="160" y="4" width="28" height="12" rx="4" fill={INK} />
      <path d="M142 32 h52M142 44 h62M142 56 h44M142 68 h58M142 80 h40M142 92 h54" stroke={LINE} strokeWidth="3" strokeLinecap="round" />
      <rect x="138" y="62" width="70" height="12" rx="3" fill="#e4b84a" opacity=".35" />
      {/* The suggestion, on a note. */}
      <rect x="232" y="40" width="72" height="56" rx="4" fill="#f5e7c4" transform="rotate(4 268 68)" />
      <path d="M244 58 h46M244 68 h40M244 78 h30" stroke="#b35a38" strokeWidth="3" strokeLinecap="round" transform="rotate(4 268 68)" />
      <path d="M212 68 q10 -2 18 -4" stroke="#6b6259" strokeWidth="2" strokeDasharray="3 3" fill="none" />
      <path d="M28 110 q4 -40 30 -44 q26 4 30 44z" fill="#2f6f66" />
      <circle cx="58" cy="46" r="14" fill={SKIN.d} />
      <path d="M43 44 q0 -18 15 -18 q15 0 15 18 q-4 -8 -15 -8 q-11 0 -15 8z" fill="#5a3a26" />
      <circle cx="58" cy="25" r="6" fill="#5a3a26" />
      <path d="M84 84 q20 -4 40 -18" stroke={SKIN.d} strokeWidth="9" fill="none" strokeLinecap="round" />
    </svg>
  )
}

/// Lesson Debrief: the biology sample's teacher at the board, with the moments
/// the Content Specialist noted pinned along the lesson's timeline. Drawn for
/// the dark sample band, so the board and timeline are light on forest.
export function LessonScene() {
  return (
    <svg viewBox="0 0 320 120" className="h-full w-full" role="img" aria-label="A teacher at the board explains cellular respiration, with three noted moments marked along the lesson timeline">
      <rect x="96" y="8" width="150" height="78" rx="6" fill="#f7f3ea" />
      {/* A cell with its mitochondria, and the equation that "went up as one line". */}
      <ellipse cx="140" cy="44" rx="30" ry="22" fill="none" stroke="#2f6f66" strokeWidth="3" />
      <ellipse cx="132" cy="40" rx="10" ry="6" fill="#d08a2a" />
      <path d="M126 40 q3 -4 6 0 q3 4 6 0" stroke="#f7f3ea" strokeWidth="1.5" fill="none" />
      <circle cx="152" cy="52" r="5" fill="#8b7bc2" />
      <path d="M182 32 h50M182 44 h40M182 56 h46" stroke="#c9d6cf" strokeWidth="3" strokeLinecap="round" />
      <path d="M48 112 q4 -40 28 -44 q24 4 28 44z" fill="#c96a45" />
      <circle cx="76" cy="50" r="14" fill="#c58b62" />
      <path d="M61 48 q0 -18 15 -18 q15 0 15 18 q-4 -8 -15 -8 q-11 0 -15 8z" fill="#20140d" />
      <path d="M98 82 q12 -12 22 -28" stroke="#c58b62" strokeWidth="9" fill="none" strokeLinecap="round" />
      {/* The lesson's 22 minutes, with the three noted moments. */}
      <path d="M130 104 h176" stroke="#f7f3ea" strokeOpacity=".35" strokeWidth="4" strokeLinecap="round" />
      {[
        { x: 158, c: '#2f855a' },
        { x: 214, c: '#c96a45' },
        { x: 268, c: '#e4b84a' },
      ].map(({ x, c }) => (
        <g key={x}>
          <path d={`M${x} 104 v-10`} stroke={c} strokeWidth="2" />
          <circle cx={x} cy="92" r="6" fill={c} />
        </g>
      ))}
    </svg>
  )
}

export type SampleScene = 'talk' | 'email' | 'redesign' | 'improve'

export const SAMPLE_SCENES: Record<SampleScene, { Scene: ComponentType; tint: string }> = {
  talk: { Scene: TalkScene, tint: 'bg-peach-tint/60' },
  email: { Scene: EmailScene, tint: 'bg-gold-tint/50' },
  redesign: { Scene: RedesignScene, tint: 'bg-mint-tint/60' },
  improve: { Scene: PlanScene, tint: 'bg-gold-tint/40' },
}

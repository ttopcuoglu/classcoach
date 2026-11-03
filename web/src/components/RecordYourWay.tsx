import type { ComponentType } from 'react'
import { CheckIcon, LaptopIcon, PhoneIcon, WatchIcon } from './icons'

// Landing-page band: the three ways a teacher can record a lesson (Apple
// Watch, iPhone, the browser), all ending in the same Lesson Debrief. The
// people are flat drawings with no faces on purpose, so any teacher can see
// themselves in them. Pill text matches what each device actually shows.

const SKIN = { a: '#8d5a3b', b: '#f1c9a5', c: '#c58b62' }
const REC = '#e24b4a'

function WatchScene() {
  return (
    <svg viewBox="0 0 200 170" className="w-full" role="img" aria-label="A teacher at the whiteboard taps record on an Apple Watch">
      <rect x="10" y="14" width="120" height="74" rx="6" fill="#ffffff" stroke="#e7e1d6" />
      <path d="M24 34h60M24 48h80M24 62h44" stroke="#c9d6cf" strokeWidth="4" strokeLinecap="round" />
      <path d="M88 120 q8 -40 32 -44 q24 4 32 44 v50 h-64z" fill="#c96a45" />
      <circle cx="120" cy="56" r="17" fill={SKIN.a} />
      <path d="M103 52 q2 -20 18 -20 q16 0 17 18 q-6 -8 -18 -8 q-10 0 -17 10z" fill="#2a1d15" />
      <path d="M146 92 q22 -6 30 -30" stroke={SKIN.a} strokeWidth="11" fill="none" strokeLinecap="round" />
      <rect x="163" y="50" width="22" height="26" rx="6" fill="#1b2e28" transform="rotate(-25 174 63)" />
      <circle cx="174" cy="63" r="5" fill={REC} className="animate-pulse" />
      <path d="M96 96 q-14 10 -20 26" stroke={SKIN.a} strokeWidth="11" fill="none" strokeLinecap="round" />
    </svg>
  )
}

function PhoneScene() {
  return (
    <svg viewBox="0 0 200 170" className="w-full" role="img" aria-label="A teacher walks between student desks holding an iPhone that is recording">
      <rect x="0" y="128" width="200" height="8" fill="#b8c9bd" />
      <rect x="14" y="104" width="50" height="24" rx="3" fill="#ffffff" stroke="#c9d6cf" />
      <rect x="140" y="104" width="50" height="24" rx="3" fill="#ffffff" stroke="#c9d6cf" />
      <path d="M70 124 q8 -44 30 -48 q22 4 30 48 v46 h-60z" fill="#2f6f66" />
      <circle cx="100" cy="56" r="17" fill={SKIN.b} />
      <path d="M82 58 q-2 -26 18 -26 q20 0 18 26 q-4 -14 -18 -14 q-14 0 -18 14z" fill="#c98b3c" />
      <path d="M82 60 q-4 18 2 30M118 60 q4 18 -2 30" stroke="#c98b3c" strokeWidth="6" fill="none" strokeLinecap="round" />
      <path d="M76 96 q-6 20 14 26" stroke={SKIN.b} strokeWidth="11" fill="none" strokeLinecap="round" />
      <rect x="88" y="104" width="20" height="34" rx="4" fill="#1b2e28" />
      <rect x="91" y="108" width="14" height="24" rx="2" fill="#f7f3ea" />
      <circle cx="98" cy="122" r="4" fill={REC} className="animate-pulse" />
      <path d="M124 96 q8 18 -10 28" stroke={SKIN.b} strokeWidth="11" fill="none" strokeLinecap="round" />
    </svg>
  )
}

function LaptopScene() {
  return (
    <svg viewBox="0 0 200 170" className="w-full" role="img" aria-label="A teacher at a desk records a lesson on a laptop">
      <path d="M58 132 q6 -46 36 -50 q30 4 36 50 v38 h-72z" fill="#e4b84a" />
      <circle cx="94" cy="62" r="17" fill={SKIN.c} />
      <path d="M76 60 q0 -24 18 -24 q18 0 18 24 q-2 -10 -18 -12 q-16 2 -18 12z" fill="#5a3a26" />
      <circle cx="94" cy="36" r="8" fill="#5a3a26" />
      <rect x="0" y="132" width="200" height="10" fill="#b35a38" />
      <path d="M100 104 l26 18" stroke={SKIN.c} strokeWidth="11" strokeLinecap="round" />
      <rect x="110" y="84" width="66" height="44" rx="4" fill="#1b2e28" />
      <rect x="114" y="88" width="58" height="36" rx="2" fill="#f7f3ea" />
      <circle cx="130" cy="106" r="6" fill={REC} className="animate-pulse" />
      <path d="M142 102h22M142 110h16" stroke="#c9d6cf" strokeWidth="3" strokeLinecap="round" />
      <path d="M104 128 h80 l-6 4 h-68z" fill="#2a4239" />
    </svg>
  )
}

const WAYS: {
  Scene: ComponentType
  icon: ComponentType<{ className?: string }>
  card: string
  title: string
  description: string
  pill: string
}[] = [
  {
    Scene: WatchScene,
    icon: WatchIcon,
    card: 'bg-gold-tint/50',
    title: 'On your wrist',
    description: 'Tap once on Apple Watch and keep teaching. It sends the lesson to your iPhone.',
    pill: 'Recording your lesson',
  },
  {
    Scene: PhoneScene,
    icon: PhoneIcon,
    card: 'bg-mint-tint/50',
    title: 'On your phone',
    description: 'Pocket it or set it on a desk. Walk the room while iPhone records.',
    pill: '24:08',
  },
  {
    Scene: LaptopScene,
    icon: LaptopIcon,
    card: 'bg-peach-tint/50',
    title: 'On your laptop',
    description: 'Record in the browser at wivoza.com. No app to install.',
    pill: 'Record a lesson',
  },
]

export default function RecordYourWay() {
  return (
    <section id="record-your-way" className="mx-auto w-full max-w-6xl px-6 pb-16">
      <div className="mx-auto mb-10 max-w-2xl text-center">
        <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-terracotta-600">Record your way</span>
        <h2 className="mt-3 font-heading text-3xl font-extrabold text-forest sm:text-4xl">
          On your wrist, on your phone, or on your laptop.
        </h2>
        <p className="mt-4 text-ink-soft">
          Press record with whatever you have on you. Every lesson lands in the same Lesson Debrief.
        </p>
      </div>
      <div className="grid gap-6 sm:grid-cols-3">
        {WAYS.map(({ Scene, icon: Icon, card, title, description, pill }) => (
          <div key={title} className={`flex flex-col rounded-3xl p-6 ${card}`}>
            <Scene />
            <div className="mt-4 flex items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-forest text-gold">
                <Icon className="h-5 w-5" />
              </span>
              <h3 className="font-heading text-xl font-bold text-forest">{title}</h3>
            </div>
            <p className="mt-2 flex-1 text-sm text-ink-soft">{description}</p>
            <span className="mt-4 inline-flex items-center gap-2 self-start rounded-full bg-forest px-3 py-1 text-xs font-medium text-cream">
              <span className="h-2 w-2 rounded-full bg-[#e24b4a]" />
              {pill}
            </span>
          </div>
        ))}
      </div>
      {/* Three dotted lines meeting in one Debrief; desktop only, where the
          cards sit side by side. */}
      <svg viewBox="0 0 640 46" preserveAspectRatio="none" className="hidden h-12 w-full sm:block" aria-hidden="true">
        <path
          d="M107 0 C107 30 320 18 320 44 M320 0 V44 M533 0 C533 30 320 18 320 44"
          stroke="#6b6259"
          strokeOpacity=".45"
          strokeWidth="1.5"
          fill="none"
          strokeDasharray="4 4"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <div className="mt-6 flex justify-center sm:mt-0">
        <div className="flex items-center gap-3 rounded-2xl border border-hairline bg-cream-card px-5 py-3 shadow-sm">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gold">
            <CheckIcon className="h-5 w-5 text-forest" />
          </span>
          <div className="text-left">
            <p className="text-sm font-bold text-ink">One Lesson Debrief</p>
            <p className="text-xs text-ink-soft">Content Specialist notes, ready after class</p>
          </div>
        </div>
      </div>
    </section>
  )
}

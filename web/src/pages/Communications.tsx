import { useEffect } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import RecentWork from '../components/RecentWork'
import { ACCENTS, ACCENT_CYCLE } from '../components/report'
import { ChatBubbleIcon, ChecklistIcon, MailIcon, ScenarioIcon } from '../components/icons'
import PracticeConversation from './PracticeConversation'
import PrepareConversation from './PrepareConversation'
import ReviewCommunication from './ReviewCommunication'
import WriteMessage from './WriteMessage'

const TOOLS = [
  {
    value: 'write',
    label: 'Write a Message',
    description: 'Create a professional message or response.',
    icon: MailIcon,
  },
  {
    value: 'prepare',
    label: 'Prepare for a Meeting',
    description: 'Build an agenda, talking points, and a plan for an upcoming meeting.',
    icon: ChecklistIcon,
  },
  {
    value: 'practice',
    label: 'Practice a Conversation',
    description: 'Role-play with a parent, student, colleague, or administrator.',
    icon: ScenarioIcon,
  },
  {
    value: 'review',
    label: 'Review My Communication',
    description: 'Get feedback on something already written.',
    icon: ChatBubbleIcon,
  },
] as const

export default function Communications() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const tool = searchParams.get('tool')
  const legacyTab = searchParams.get('tab')

  useEffect(() => {
    if (legacyTab === 'difficult') navigate('/communications?tool=practice', { replace: true })
    else if (legacyTab === 'parent') navigate('/communications?tool=write', { replace: true })
  }, [legacyTab, navigate])

  if (tool === 'write') return <WriteMessage />
  if (tool === 'prepare') return <PrepareConversation />
  if (tool === 'practice') return <PracticeConversation />
  if (tool === 'review') return <ReviewCommunication />

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-1">
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-terracotta-600">Wivoza · Plan</p>
        <h1 className="font-heading text-3xl font-extrabold text-forest md:text-4xl">
          Communication Coach<span className="text-gold">.</span>
        </h1>
        <p className="text-ink-soft">Prepare, write, practice, and improve important communication.</p>
        <Link
          to="/guide/communication-coach"
          className="mt-1 w-fit text-xs font-medium text-ink-soft underline decoration-hairline underline-offset-4 hover:text-terracotta"
        >
          New to this? Read the teacher's guide
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {TOOLS.map(({ value, label, description, icon: Icon }, i) => {
          const accent = ACCENT_CYCLE[i % ACCENT_CYCLE.length]
          return (
            <Link
              key={value}
              to={`/communications?tool=${value}`}
              className={`group flex flex-col rounded-3xl p-6 transition-all hover:-translate-y-0.5 hover:shadow-md ${accent.tint}`}
            >
              <div className="flex items-start justify-between">
                <span
                  className={`flex h-12 w-12 items-center justify-center rounded-2xl ${accent.band} ${
                    accent === ACCENTS.gold ? 'text-forest' : 'text-cream'
                  }`}
                >
                  <Icon className="h-6 w-6" />
                </span>
                <span aria-hidden="true" className="font-heading text-3xl font-extrabold text-forest/15">
                  {String(i + 1).padStart(2, '0')}
                </span>
              </div>
              <h2 className="mt-5 font-heading text-xl font-bold text-forest">{label}</h2>
              <p className="mt-1 flex-1 text-sm text-ink-soft">{description}</p>
              <span className={`mt-4 text-sm font-semibold ${accent.ink}`}>
                Start <span className="inline-block transition-transform group-hover:translate-x-0.5">→</span>
              </span>
            </Link>
          )
        })}
      </div>

      <RecentWork />
    </div>
  )
}

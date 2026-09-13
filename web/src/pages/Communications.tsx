import { useEffect } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import RecentWork from '../components/RecentWork'
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
        {TOOLS.map(({ value, label, description, icon: Icon }) => (
          <Link
            key={value}
            to={`/communications?tool=${value}`}
            className="group rounded-2xl border border-hairline bg-cream-card p-6 transition-all hover:border-terracotta/40 hover:shadow-md"
          >
            <Icon className="h-8 w-8 text-terracotta" />
            <h2 className="mt-4 font-heading text-lg font-semibold text-forest">{label}</h2>
            <p className="mt-1 text-sm text-ink-soft">{description}</p>
          </Link>
        ))}
      </div>

      <RecentWork />
    </div>
  )
}

import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { challengeLabel, recipientLabel } from '../lib/communicationOptions'
import {
  setPracticePrefill,
  setPreparePrefill,
  setReviewPrefill,
  setWritePrefill,
} from '../lib/communicationsPrefill'
import {
  deleteConversationPlan,
  deleteConversationPrep,
  deleteParentMessage,
  getConversationPlans,
  getConversationPreps,
  getParentMessages,
  renameConversationPlan,
  renameConversationPrep,
  renameParentMessage,
  type ConversationPlan,
  type ConversationPrep,
  type ParentMessage,
} from '../lib/api'

type WorkKind = 'message' | 'plan' | 'practice' | 'review'

type WorkItem = {
  kind: WorkKind
  id: string
  title: string
  createdAt: string
  meta: string | null
  raw: ParentMessage | ConversationPlan | ConversationPrep
}

const FILTERS: { label: string; value: WorkKind | 'all' }[] = [
  { label: 'All', value: 'all' },
  { label: 'Messages', value: 'message' },
  { label: 'Conversation Plans', value: 'plan' },
  { label: 'Practice Sessions', value: 'practice' },
  { label: 'Communication Reviews', value: 'review' },
]

const KIND_LABEL: Record<WorkKind, string> = {
  message: 'Message',
  plan: 'Conversation Plan',
  practice: 'Practice Session',
  review: 'Communication Review',
}

function messageToItem(m: ParentMessage): WorkItem {
  return {
    kind: 'message',
    id: m.id,
    title: m.title || m.incidentSummary || m.receivedMessage || m.existingDraft || 'Message',
    createdAt: m.createdAt,
    meta: recipientLabel(m.recipientType),
    raw: m,
  }
}

function planToItem(p: ConversationPlan): WorkItem {
  return {
    kind: 'plan',
    id: p.id,
    title: p.title || p.situationText,
    createdAt: p.createdAt,
    meta: recipientLabel(p.recipientType),
    raw: p,
  }
}

function prepToItem(p: ConversationPrep): WorkItem {
  return {
    kind: p.source === 'practice' ? 'practice' : 'review',
    id: p.id,
    title: p.title || p.situationText,
    createdAt: p.createdAt,
    meta: p.source === 'practice' ? challengeLabel(p.category) : null,
    raw: p,
  }
}

export default function RecentWork() {
  const [items, setItems] = useState<WorkItem[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<WorkKind | 'all'>('all')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameDraft, setRenameDraft] = useState('')
  const navigate = useNavigate()

  function refresh() {
    setLoading(true)
    Promise.all([getParentMessages(), getConversationPlans(), getConversationPreps()])
      .then(([messages, plans, preps]) => {
        const combined = [
          ...messages.map(messageToItem),
          ...plans.map(planToItem),
          ...preps.map(prepToItem),
        ]
        combined.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        setItems(combined)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  useEffect(refresh, [])

  const visible = filter === 'all' ? items : items.filter((i) => i.kind === filter)

  async function handleDelete(item: WorkItem) {
    const confirmed = window.confirm('Delete this permanently? This cannot be undone.')
    if (!confirmed) return
    try {
      if (item.kind === 'message') await deleteParentMessage(item.id)
      else if (item.kind === 'plan') await deleteConversationPlan(item.id)
      else await deleteConversationPrep(item.id)
      setItems((prev) => prev.filter((i) => i.id !== item.id))
    } catch {
      // leave the item in place — the user can retry
    }
  }

  function handleDuplicate(item: WorkItem) {
    if (item.kind === 'message') {
      const m = item.raw as ParentMessage
      setWritePrefill({
        startingAction: m.startingAction ?? 'new',
        incidentSummary: m.incidentSummary ?? undefined,
        receivedMessage: m.receivedMessage ?? undefined,
        existingDraft: m.existingDraft ?? undefined,
        recipientType: m.recipientType ?? undefined,
        purpose: m.purpose ?? undefined,
        tone: m.tone,
        format: m.format ?? undefined,
      })
      navigate('/communications?tool=write')
    } else if (item.kind === 'plan') {
      const p = item.raw as ConversationPlan
      setPreparePrefill({
        situationText: p.situationText,
        recipientType: p.recipientType ?? undefined,
        desiredOutcome: p.desiredOutcome ?? undefined,
        concerns: p.concerns ?? undefined,
        background: p.background ?? undefined,
        meetingFormat: p.meetingFormat ?? undefined,
      })
      navigate('/communications?tool=prepare')
    } else if (item.kind === 'practice') {
      const p = item.raw as ConversationPrep
      setPracticePrefill({
        personType: p.personType ?? undefined,
        challenge: p.category ?? undefined,
        gradeBand: p.gradeBand ?? undefined,
        difficulty: p.difficulty ?? undefined,
      })
      navigate('/communications?tool=practice')
    } else {
      const p = item.raw as ConversationPrep
      setReviewPrefill({ situationText: p.situationText, responseText: p.responseText })
      navigate('/communications?tool=review')
    }
  }

  function startRename(item: WorkItem) {
    setRenamingId(item.id)
    setRenameDraft(item.title)
  }

  async function commitRename(item: WorkItem) {
    const title = renameDraft.trim()
    setRenamingId(null)
    if (!title || title === item.title) return
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, title } : i)))
    try {
      if (item.kind === 'message') await renameParentMessage(item.id, title)
      else if (item.kind === 'plan') await renameConversationPlan(item.id, title)
      else await renameConversationPrep(item.id, title)
    } catch {
      refresh()
    }
  }

  return (
    <div>
      <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-soft">Recent Work</h2>
      <div className="mt-3 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => setFilter(f.value)}
            className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
              filter === f.value
                ? 'border-brand-500 bg-brand-50 text-brand-600'
                : 'border-border bg-canvas text-ink-soft hover:border-brand-400 hover:text-brand-600'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="mt-3 text-center text-sm text-ink-soft">Loading...</p>
      ) : visible.length === 0 ? (
        <div className="mt-3 rounded-2xl border border-dashed border-border p-6 text-center text-sm text-ink-soft">
          Work you create in any of the four tools will show up here.
        </div>
      ) : (
        <div className="mt-3 flex flex-col gap-3">
          {visible.map((item) => (
            <div key={item.id} className="rounded-xl border border-border bg-surface p-4">
              <div className="flex items-start justify-between gap-4">
                <button type="button" onClick={() => setExpandedId((id) => (id === item.id ? null : item.id))} className="min-w-0 flex-1 text-left">
                  {renamingId === item.id ? (
                    <input
                      autoFocus
                      value={renameDraft}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => setRenameDraft(e.target.value)}
                      onBlur={() => commitRename(item)}
                      onKeyDown={(e) => e.key === 'Enter' && commitRename(item)}
                      className="w-full rounded border border-brand-400 bg-canvas px-2 py-1 text-sm text-ink focus:outline-none"
                    />
                  ) : (
                    <p className="line-clamp-1 text-sm font-medium text-ink">{item.title}</p>
                  )}
                  <p className="mt-1 text-xs text-ink-soft">
                    {KIND_LABEL[item.kind]} · {new Date(item.createdAt).toLocaleDateString()}
                    {item.meta ? ` · ${item.meta}` : ''}
                  </p>
                </button>
                <div className="flex shrink-0 items-center gap-3 text-xs font-medium">
                  <button type="button" onClick={() => setExpandedId((id) => (id === item.id ? null : item.id))} className="text-ink-soft hover:text-ink">
                    {expandedId === item.id ? 'Hide' : 'Open'}
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      startRename(item)
                    }}
                    className="text-ink-soft hover:text-ink"
                  >
                    Rename
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleDuplicate(item)
                    }}
                    className="text-ink-soft hover:text-ink"
                  >
                    Duplicate
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleDelete(item)
                    }}
                    className="text-warm-500 hover:text-warm-600"
                  >
                    Delete
                  </button>
                </div>
              </div>

              {expandedId === item.id && (
                <div className="mt-3 flex flex-col gap-2 border-t border-border pt-3 text-sm text-ink">
                  {item.kind === 'message' && <p className="whitespace-pre-wrap">{(item.raw as ParentMessage).draftText}</p>}
                  {item.kind === 'plan' && (
                    <p className="whitespace-pre-wrap">
                      {(item.raw as ConversationPlan).planContent?.opening}
                      {'\n\n'}
                      {(item.raw as ConversationPlan).planContent?.mainConcern}
                    </p>
                  )}
                  {(item.kind === 'practice' || item.kind === 'review') && (
                    <>
                      <p className="whitespace-pre-wrap">{(item.raw as ConversationPrep).situationText}</p>
                      <p className="whitespace-pre-wrap text-ink-soft">{(item.raw as ConversationPrep).responseText}</p>
                    </>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

import { useState } from 'react'
import { Link } from 'react-router-dom'
import CoachingChat from '../components/CoachingChat'
import { MicIcon, StarIcon } from '../components/icons'
import SafetyAdvisoryBanner, { PrivacyReminder } from '../components/SafetyAdvisoryBanner'
import { useSpeechToText } from '../hooks/useSpeechToText'
import {
  MESSAGE_FORMATS,
  MESSAGE_PURPOSES,
  MESSAGE_TONES,
  RECIPIENT_TYPES,
  STARTING_ACTIONS,
  formatLabel,
  purposeLabel,
  recipientLabel,
  toneLabel,
  type MessageFormat,
  type MessagePurpose,
  type MessageTone,
  type RecipientType,
  type StartingAction,
} from '../lib/communicationOptions'
import { takeWritePrefill } from '../lib/communicationsPrefill'
import { draftParentMessage, sendParentMessageChat, setParentMessageSaved, type ParentMessage } from '../lib/api'

const QUICK_ACTIONS: { label: string; instruction: string }[] = [
  { label: 'Make warmer', instruction: 'Make this warmer and more supportive in tone.' },
  { label: 'Make firmer', instruction: 'Make this firmer and more direct, without sounding rude.' },
  { label: 'Shorten', instruction: 'Shorten this significantly while keeping the key points.' },
  { label: 'Simplify language', instruction: 'Simplify the language so it reads at an easier level.' },
  { label: 'Create another version', instruction: 'Write a different version of this message — different phrasing, same tone and information.' },
]

// Common languages across US K-12 EL populations, plus a free-text escape
// hatch for anything not listed — deliberately not exhaustive, this isn't
// meant to be a full locale list.
const TRANSLATE_LANGUAGES = [
  'Spanish',
  'Chinese (Simplified)',
  'Vietnamese',
  'Arabic',
  'Haitian Creole',
  'Portuguese',
  'Russian',
  'Tagalog',
  'Korean',
  'French',
  'Somali',
]

export default function WriteMessage() {
  const [prefill] = useState(() => takeWritePrefill())
  const [startingAction, setStartingAction] = useState<StartingAction>(
    (prefill?.startingAction as StartingAction | undefined) ?? 'new',
  )
  const [incidentSummary, setIncidentSummary] = useState(prefill?.incidentSummary ?? '')
  const [receivedMessage, setReceivedMessage] = useState(prefill?.receivedMessage ?? '')
  const [contextNotes, setContextNotes] = useState('')
  const [existingDraft, setExistingDraft] = useState(prefill?.existingDraft ?? '')
  const [recipientType, setRecipientType] = useState<RecipientType | undefined>(
    (prefill?.recipientType as RecipientType | undefined) ?? undefined,
  )
  const [purpose, setPurpose] = useState<MessagePurpose | undefined>(
    (prefill?.purpose as MessagePurpose | undefined) ?? undefined,
  )
  const [tone, setTone] = useState<MessageTone>((prefill?.tone as MessageTone | undefined) ?? 'warm')
  const [format, setFormat] = useState<MessageFormat | undefined>(
    (prefill?.format as MessageFormat | undefined) ?? undefined,
  )

  const [drafting, setDrafting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [current, setCurrent] = useState<ParentMessage | null>(null)
  const [copied, setCopied] = useState(false)

  const [chatDraft, setChatDraft] = useState('')
  const [chatSending, setChatSending] = useState(false)
  const [chatError, setChatError] = useState<string | null>(null)

  const [translateOpen, setTranslateOpen] = useState(false)
  const [customLanguage, setCustomLanguage] = useState('')

  const activeFieldSetter =
    startingAction === 'respond' ? setReceivedMessage : startingAction === 'improve' ? setExistingDraft : setIncidentSummary
  const { supported: speechSupported, listening, toggleListening } = useSpeechToText((text) =>
    activeFieldSetter((prev) => (prev ? `${prev} ${text}` : text)),
  )

  const inputText = startingAction === 'respond' ? receivedMessage : startingAction === 'improve' ? existingDraft : incidentSummary
  const canDraft = inputText.trim().length > 0 && !drafting

  async function handleDraft() {
    if (!canDraft) return
    setDrafting(true)
    setError(null)
    try {
      const message = await draftParentMessage({
        startingAction,
        incidentSummary: startingAction === 'new' ? incidentSummary.trim() : undefined,
        receivedMessage: startingAction === 'respond' ? receivedMessage.trim() : undefined,
        contextNotes: startingAction === 'respond' ? contextNotes.trim() || undefined : undefined,
        existingDraft: startingAction === 'improve' ? existingDraft.trim() : undefined,
        recipientType,
        purpose,
        format,
        tone,
      })
      setCurrent(message)
      setChatDraft('')
      setChatError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not draft a message. Please try again.')
    } finally {
      setDrafting(false)
    }
  }

  async function sendChatMessage(text: string) {
    if (!current || chatSending) return
    setChatSending(true)
    setChatError(null)
    try {
      const updated = await sendParentMessageChat(current.id, text)
      setCurrent(updated)
    } catch (err) {
      setChatError((err as Error).message || 'Could not reach your coach. Please try again.')
    } finally {
      setChatSending(false)
    }
  }

  function handleTranslate(language: string) {
    const trimmed = language.trim()
    if (!trimmed) return
    setTranslateOpen(false)
    setCustomLanguage('')
    sendChatMessage(`Translate this into ${trimmed}, keeping the same tone.`)
  }

  async function handleSendChat() {
    const trimmed = chatDraft.trim()
    if (!trimmed) return
    setChatDraft('')
    await sendChatMessage(trimmed)
  }

  async function handleCopy() {
    if (!current) return
    try {
      await navigator.clipboard.writeText(current.draftText)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // clipboard access unavailable/denied — the draft text is still visible to select manually
    }
  }

  async function handleToggleSaved() {
    if (!current) return
    const nextSaved = !current.saved
    setCurrent((prev) => (prev ? { ...prev, saved: nextSaved } : prev))
    try {
      await setParentMessageSaved(current.id, nextSaved)
    } catch {
      setCurrent((prev) => (prev ? { ...prev, saved: !nextSaved } : prev))
    }
  }

  function handleStartOver() {
    setCurrent(null)
    setIncidentSummary('')
    setReceivedMessage('')
    setContextNotes('')
    setExistingDraft('')
    setError(null)
    setChatDraft('')
    setChatError(null)
  }

  return (
    <div className="flex flex-col gap-6">
      <Link to="/communications" className="text-sm font-medium text-ink-soft hover:text-ink">
        ← Messages
      </Link>

      <div className="rounded-2xl border border-border bg-surface p-6">
        {!current ? (
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap gap-2">
              {STARTING_ACTIONS.map((a) => (
                <button
                  key={a.value}
                  type="button"
                  onClick={() => setStartingAction(a.value)}
                  disabled={drafting}
                  title={a.description}
                  className={`rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors ${
                    startingAction === a.value
                      ? 'border-brand-500 bg-brand-50 text-brand-600'
                      : 'border-border bg-canvas text-ink-soft hover:border-brand-400 hover:text-brand-600'
                  }`}
                >
                  {a.label}
                </button>
              ))}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-ink">Recipient</span>
                <select
                  value={recipientType ?? ''}
                  onChange={(e) => setRecipientType((e.target.value || undefined) as RecipientType | undefined)}
                  disabled={drafting}
                  className="rounded-lg border border-border bg-canvas px-3.5 py-2.5 text-sm text-ink focus:border-brand-400 focus:outline-none disabled:opacity-60"
                >
                  <option value="">Choose...</option>
                  {RECIPIENT_TYPES.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-ink">Purpose</span>
                <select
                  value={purpose ?? ''}
                  onChange={(e) => setPurpose((e.target.value || undefined) as MessagePurpose | undefined)}
                  disabled={drafting}
                  className="rounded-lg border border-border bg-canvas px-3.5 py-2.5 text-sm text-ink focus:border-brand-400 focus:outline-none disabled:opacity-60"
                >
                  <option value="">Choose...</option>
                  {MESSAGE_PURPOSES.map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-ink">Format</span>
                <select
                  value={format ?? ''}
                  onChange={(e) => setFormat((e.target.value || undefined) as MessageFormat | undefined)}
                  disabled={drafting}
                  className="rounded-lg border border-border bg-canvas px-3.5 py-2.5 text-sm text-ink focus:border-brand-400 focus:outline-none disabled:opacity-60"
                >
                  <option value="">Choose...</option>
                  {MESSAGE_FORMATS.map((f) => (
                    <option key={f.value} value={f.value}>
                      {f.label}
                    </option>
                  ))}
                </select>
              </label>
              <div className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-ink">Tone</span>
                <div className="flex flex-wrap gap-2">
                  {MESSAGE_TONES.map((t) => (
                    <button
                      key={t.value}
                      type="button"
                      onClick={() => setTone(t.value)}
                      disabled={drafting}
                      className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                        tone === t.value
                          ? 'border-brand-500 bg-brand-50 text-brand-600'
                          : 'border-border bg-canvas text-ink-soft hover:border-brand-400 hover:text-brand-600'
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {startingAction === 'new' && (
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-ink">
                  Briefly describe what happened and what you need to communicate
                </span>
                <textarea
                  value={incidentSummary}
                  onChange={(e) => setIncidentSummary(e.target.value)}
                  disabled={drafting}
                  rows={4}
                  className="rounded-lg border border-border bg-canvas px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-soft focus:border-brand-400 focus:outline-none disabled:opacity-60"
                />
              </label>
            )}
            {startingAction === 'respond' && (
              <>
                <label className="flex flex-col gap-1.5">
                  <span className="text-sm font-medium text-ink">The message you received</span>
                  <textarea
                    value={receivedMessage}
                    onChange={(e) => setReceivedMessage(e.target.value)}
                    disabled={drafting}
                    rows={4}
                    className="rounded-lg border border-border bg-canvas px-3.5 py-2.5 text-sm text-ink focus:border-brand-400 focus:outline-none disabled:opacity-60"
                  />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-sm font-medium text-ink">
                    Important facts or context <span className="font-normal text-ink-soft">(optional)</span>
                  </span>
                  <textarea
                    value={contextNotes}
                    onChange={(e) => setContextNotes(e.target.value)}
                    disabled={drafting}
                    rows={2}
                    className="rounded-lg border border-border bg-canvas px-3.5 py-2.5 text-sm text-ink focus:border-brand-400 focus:outline-none disabled:opacity-60"
                  />
                </label>
              </>
            )}
            {startingAction === 'improve' && (
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-ink">Your existing draft</span>
                <textarea
                  value={existingDraft}
                  onChange={(e) => setExistingDraft(e.target.value)}
                  disabled={drafting}
                  rows={5}
                  className="rounded-lg border border-border bg-canvas px-3.5 py-2.5 text-sm text-ink focus:border-brand-400 focus:outline-none disabled:opacity-60"
                />
              </label>
            )}

            {speechSupported && (
              <button
                type="button"
                onClick={toggleListening}
                disabled={drafting}
                className={`flex w-fit items-center gap-2 rounded-full border-2 px-4 py-2.5 text-sm font-semibold transition-colors ${
                  listening
                    ? 'border-warm-500 bg-warm-100 text-warm-500'
                    : 'border-brand-300 bg-brand-50 text-brand-600 hover:border-brand-400 hover:bg-brand-100'
                }`}
              >
                <MicIcon className="h-5 w-5" />
                {listening ? 'Listening... tap to stop' : 'Speak instead'}
              </button>
            )}

            <SafetyAdvisoryBanner text={inputText} />
            <PrivacyReminder />

            <button
              type="button"
              onClick={handleDraft}
              disabled={!canDraft}
              className="self-end rounded-lg bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-600 disabled:opacity-50"
            >
              {drafting ? 'Drafting...' : 'Generate Message'}
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap gap-1.5 text-xs text-ink-soft">
              {recipientLabel(current.recipientType) && <span>{recipientLabel(current.recipientType)}</span>}
              {purposeLabel(current.purpose) && <span>· {purposeLabel(current.purpose)}</span>}
              <span>· {toneLabel(current.tone)}</span>
              {formatLabel(current.format) && <span>· {formatLabel(current.format)}</span>}
            </div>
            <div className="rounded-xl border border-border bg-canvas p-4">
              <p className="text-sm whitespace-pre-wrap text-ink">{current.draftText}</p>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={handleToggleSaved}
                  className={`flex items-center gap-1.5 text-sm font-medium ${
                    current.saved ? 'text-warm-500' : 'text-ink-soft hover:text-warm-500'
                  }`}
                >
                  <StarIcon className="h-4 w-4" filled={current.saved} />
                  {current.saved ? 'Saved' : 'Save for later'}
                </button>
                <button
                  type="button"
                  onClick={handleCopy}
                  className="rounded-lg border border-border px-4 py-2 text-sm font-semibold text-ink transition-colors hover:border-brand-400 hover:text-brand-600"
                >
                  {copied ? 'Copied' : 'Copy'}
                </button>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {QUICK_ACTIONS.map((action) => (
                <button
                  key={action.label}
                  type="button"
                  onClick={() => sendChatMessage(action.instruction)}
                  disabled={chatSending}
                  className="rounded-full border border-border bg-canvas px-3 py-1.5 text-xs font-semibold text-ink-soft transition-colors hover:border-brand-400 hover:text-brand-600 disabled:opacity-50"
                >
                  {action.label}
                </button>
              ))}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setTranslateOpen((open) => !open)}
                  disabled={chatSending}
                  className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50 ${
                    translateOpen
                      ? 'border-brand-500 bg-brand-50 text-brand-600'
                      : 'border-border bg-canvas text-ink-soft hover:border-brand-400 hover:text-brand-600'
                  }`}
                >
                  Translate
                </button>
                {translateOpen && (
                  <div className="absolute left-0 top-full z-10 mt-2 w-56 rounded-lg border border-border bg-surface p-1.5 shadow-lg">
                    {TRANSLATE_LANGUAGES.map((language) => (
                      <button
                        key={language}
                        type="button"
                        onClick={() => handleTranslate(language)}
                        className="block w-full rounded-md px-3 py-1.5 text-left text-sm text-ink hover:bg-canvas"
                      >
                        {language}
                      </button>
                    ))}
                    <div className="mt-1 flex items-center gap-1.5 border-t border-border px-1 pt-1.5">
                      <input
                        type="text"
                        value={customLanguage}
                        onChange={(e) => setCustomLanguage(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleTranslate(customLanguage)
                        }}
                        placeholder="Other language..."
                        className="min-w-0 flex-1 rounded-md border border-border bg-canvas px-2 py-1 text-sm text-ink placeholder:text-ink-soft focus:border-brand-400 focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => handleTranslate(customLanguage)}
                        disabled={!customLanguage.trim()}
                        className="rounded-md bg-brand-500 px-2.5 py-1 text-xs font-semibold text-white disabled:opacity-50"
                      >
                        Go
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <CoachingChat
              messages={current.conversation.slice(2)}
              sending={chatSending}
              error={chatError}
              draft={chatDraft}
              onDraftChange={setChatDraft}
              onSend={handleSendChat}
              placeholder="Ask for a revision, e.g. 'make it warmer' or 'add a request for a meeting'..."
            />

            <button
              type="button"
              onClick={handleStartOver}
              className="self-end rounded-lg bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-600"
            >
              Start a New Message
            </button>
          </div>
        )}
        {error && <p className="mt-4 text-center text-sm text-warm-500">{error}</p>}
      </div>
    </div>
  )
}

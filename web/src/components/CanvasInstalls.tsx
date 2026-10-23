import { useEffect, useState } from 'react'
import {
  addCanvasInstall,
  getCanvasInstalls,
  removeCanvasInstall,
  setCanvasApiKey,
  type CanvasEnvironment,
  type CanvasInstall,
} from '../lib/api'
import { Spinner } from './Spinner'

// A school connecting its Canvas to Wivoza. The Canvas side is done by a
// Canvas admin (a developer key made from Wivoza's configuration URL, then
// installed by its client ID); the Wivoza side is pasting that client ID
// here. Teachers then find Wivoza in each course's menu — students never do.

const FOCUS = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forest'

function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-semibold text-ink-soft">{label}</span>
      <div className="flex min-w-0 items-center gap-2">
        <code className="w-0 min-w-0 flex-1 truncate rounded-lg border border-hairline bg-cream px-3 py-1.5 text-[13px] text-forest">{value}</code>
        <button
          type="button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(value)
              setCopied(true)
              window.setTimeout(() => setCopied(false), 1600)
            } catch {
              // The address is on screen to copy by hand.
            }
          }}
          className={`shrink-0 rounded-full border border-hairline bg-white px-3 py-1.5 text-xs font-semibold text-forest hover:bg-cream ${FOCUS}`}
        >
          {copied ? 'Copied ✓' : 'Copy'}
        </button>
      </div>
    </div>
  )
}

/// The scopes Send to Canvas asks for — the same four as CANVAS_SCOPES in
/// server/src/lib/canvasApi.ts, in Canvas's own words for the scope list.
const SCOPES_TO_TICK = [
  'Courses — GET /api/v1/courses',
  'Modules — GET /api/v1/courses/:course_id/modules',
  'Pages — POST /api/v1/courses/:course_id/pages',
  'Module items — POST /api/v1/courses/:course_id/modules/:module_id/items',
]

/// Send to Canvas's half of the set-up, for one connected Canvas: an API
/// developer key, which is what lets a teacher's page land in their course.
function SendSetup({ install, redirectUri, onSaved }: { install: CanvasInstall; redirectUri: string; onSaved: () => void }) {
  const [open, setOpen] = useState(false)
  const [canvasUrl, setCanvasUrl] = useState(install.canvasUrl ?? '')
  const [apiClientId, setApiClientId] = useState(install.apiClientId ?? '')
  const [secret, setSecret] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await setCanvasApiKey(install.id, { canvasUrl, apiClientId: apiClientId.trim(), apiClientSecret: secret.trim() || undefined })
      setSecret('')
      setOpen(false)
      onSaved()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="basis-full border-t border-hairline pt-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
        <span className="font-semibold text-forest">Send to Canvas:</span>
        <span className="text-ink-soft">
          {install.sendReady
            ? `on · ${install.sendingTeachers ?? 0} ${install.sendingTeachers === 1 ? 'teacher has' : 'teachers have'} allowed it`
            : 'not set up — teachers can open Wivoza from Canvas, but not send lessons to it'}
        </span>
        <button type="button" onClick={() => setOpen((o) => !o)} className={`rounded font-semibold text-forest underline underline-offset-2 ${FOCUS}`}>
          {open ? 'Close' : install.sendReady ? 'Change the API key' : 'Set it up'}
        </button>
      </div>
      {open && (
        <form onSubmit={save} className="mt-3 flex flex-col gap-3 text-sm text-ink">
          <p>
            <span className="font-semibold text-forest">1. In Canvas, make an API key.</span> Admin → Developer Keys → + Developer Key → API Key.
            Name it Wivoza and paste this under Redirect URIs:
          </p>
          <CopyField label="Redirect URI" value={redirectUri} />
          <div>
            <p>
              <span className="font-semibold text-forest">2. Turn on Enforce Scopes and tick only these four.</span> Wivoza can then list courses
              and modules and add pages — nothing else.
            </p>
            <ul className="mt-1 list-disc pl-5 text-xs text-ink-soft">
              {SCOPES_TO_TICK.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          </div>
          <p>
            <span className="font-semibold text-forest">3. Save, turn the key on, then copy</span> its client ID (Details column) and its key (Show
            Key) into the boxes below, with your Canvas address.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1 sm:col-span-2">
              <span className="text-xs font-semibold text-ink-soft">Your Canvas address</span>
              <input
                id={`canvas-url-${install.id}`}
                value={canvasUrl}
                onChange={(e) => setCanvasUrl(e.target.value)}
                placeholder="yourschool.instructure.com"
                className="rounded-xl border border-hairline bg-white px-3 py-2 text-sm text-ink focus:border-forest focus:outline-none"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-semibold text-ink-soft">API key client ID</span>
              <input
                id={`canvas-api-id-${install.id}`}
                inputMode="numeric"
                value={apiClientId}
                onChange={(e) => setApiClientId(e.target.value)}
                className="rounded-xl border border-hairline bg-white px-3 py-2 text-sm text-ink focus:border-forest focus:outline-none"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-semibold text-ink-soft">API key secret</span>
              <input
                id={`canvas-api-secret-${install.id}`}
                type="password"
                autoComplete="off"
                value={secret}
                onChange={(e) => setSecret(e.target.value)}
                placeholder={install.sendReady ? 'Leave empty to keep the current one' : ''}
                className="rounded-xl border border-hairline bg-white px-3 py-2 text-sm text-ink focus:border-forest focus:outline-none"
              />
            </label>
          </div>
          <p className="text-xs text-ink-soft">The secret is stored encrypted and never shown again. Changing the key or address asks each teacher to allow Wivoza once more.</p>
          {error && (
            <p role="alert" className="text-sm text-terracotta-600">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={busy || !canvasUrl.trim() || !apiClientId.trim() || (!install.sendReady && !secret.trim())}
            className={`flex items-center gap-2 self-start rounded-full bg-forest px-5 py-2 text-sm font-bold text-cream hover:bg-forest-soft disabled:opacity-60 ${FOCUS}`}
          >
            {busy && <Spinner />}
            <span className="text-cream">Save</span>
          </button>
        </form>
      )}
    </div>
  )
}

export default function CanvasInstalls() {
  const [data, setData] = useState<{ configUrl: string; oauthRedirectUri?: string; platforms: CanvasInstall[] } | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [clientId, setClientId] = useState('')
  const [name, setName] = useState('')
  const [environment, setEnvironment] = useState<CanvasEnvironment>('production')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState<string | null>(null)

  async function refresh() {
    try {
      setData(await getCanvasInstalls())
      setLoadError(null)
    } catch (e) {
      setLoadError((e as Error).message)
    }
  }
  useEffect(() => {
    void refresh()
  }, [])

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!clientId.trim() || busy) return
    setBusy(true)
    setError(null)
    try {
      await addCanvasInstall({ clientId: clientId.trim(), name: name.trim() || undefined, environment })
      setClientId('')
      setName('')
      await refresh()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function handleRemove(id: string) {
    setBusy(true)
    setError(null)
    try {
      await removeCanvasInstall(id)
      setConfirming(null)
      await refresh()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  if (loadError) return <p className="text-sm text-ink-soft">{loadError}</p>
  if (!data)
    return (
      <p className="flex items-center gap-2 text-sm text-ink-soft">
        <Spinner /> Loading…
      </p>
    )

  const launchUrl = data.configUrl.replace(/config\.json$/, 'launch')

  return (
    <div className="flex flex-col gap-6">
      {data.platforms.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-xs font-bold uppercase tracking-[0.14em] text-ink-soft">Connected</h2>
          <ul className="flex flex-col gap-2">
            {data.platforms.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl border border-hairline bg-white px-4 py-3">
                <span className="min-w-0 flex-1 basis-40">
                  <span className="block font-semibold text-forest">{p.name}</span>
                  <span className="block text-xs text-ink-soft">
                    Client ID {p.clientId}
                    {p.environment !== 'production' ? ` · ${p.environment}` : ''} · {p.connectedTeachers}{' '}
                    {p.connectedTeachers === 1 ? 'teacher has' : 'teachers have'} connected
                  </span>
                </span>
                {confirming === p.id ? (
                  <span className="flex items-center gap-2 text-xs text-forest">
                    Teachers lose the Wivoza link in Canvas.
                    <button type="button" disabled={busy} onClick={() => handleRemove(p.id)} className={`rounded font-semibold text-terracotta-600 underline underline-offset-2 ${FOCUS}`}>
                      Remove
                    </button>
                    <button type="button" onClick={() => setConfirming(null)} className={`rounded font-semibold underline underline-offset-2 ${FOCUS}`}>
                      Keep
                    </button>
                  </span>
                ) : (
                  <button type="button" onClick={() => setConfirming(p.id)} className={`rounded text-xs font-semibold text-ink-soft underline underline-offset-2 hover:text-forest ${FOCUS}`}>
                    Remove
                  </button>
                )}
                <SendSetup install={p} redirectUri={data.oauthRedirectUri ?? data.configUrl.replace(/lti\/config\.json$/, 'canvas/oauth/callback')} onSaved={() => void refresh()} />
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="flex flex-col gap-4 rounded-3xl border border-hairline bg-cream-card p-6 shadow-sm">
        <h2 className="font-heading text-lg font-bold text-forest">{data.platforms.length ? 'Connect another Canvas' : 'Connect your Canvas'}</h2>
        <ol className="flex flex-col gap-4 text-sm text-ink">
          <li className="flex flex-col gap-2">
            <p>
              <span className="font-semibold text-forest">1. In Canvas, make a developer key.</span> Admin → Developer Keys → + Developer Key → LTI
              Key. For Method, choose <span className="font-semibold">Enter URL</span> and paste the first address. Paste the second under
              Redirect URIs.
            </p>
            <CopyField label="JSON URL" value={data.configUrl} />
            <CopyField label="Redirect URI" value={launchUrl} />
          </li>
          <li>
            <span className="font-semibold text-forest">2. Turn the key on and copy its client ID</span> — the long number in the Details column.
          </li>
          <li>
            <span className="font-semibold text-forest">3. Install it.</span> Admin → Settings → Apps → View App Configurations → + App →
            Configuration Type: By Client ID. Paste the client ID and install.
          </li>
          <li className="flex flex-col gap-2">
            <span className="font-semibold text-forest">4. Paste the client ID here.</span>
            <form onSubmit={handleAdd} className="flex flex-col gap-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-semibold text-ink-soft">Client ID</span>
                  <input
                    id="canvas-client-id"
                    inputMode="numeric"
                    value={clientId}
                    onChange={(e) => setClientId(e.target.value)}
                    placeholder="e.g. 10000000000123"
                    className="rounded-xl border border-hairline bg-white px-3 py-2 text-sm text-ink focus:border-forest focus:outline-none"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-semibold text-ink-soft">Name (optional)</span>
                  <input
                    id="canvas-name"
                    value={name}
                    maxLength={80}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Canvas"
                    className="rounded-xl border border-hairline bg-white px-3 py-2 text-sm text-ink focus:border-forest focus:outline-none"
                  />
                </label>
              </div>
              <details className="text-xs text-ink-soft">
                <summary className="cursor-pointer font-semibold">Made the key in Canvas Beta or Test?</summary>
                <select
                  id="canvas-environment"
                  value={environment}
                  onChange={(e) => setEnvironment(e.target.value as CanvasEnvironment)}
                  className="mt-2 rounded-xl border border-hairline bg-white px-3 py-1.5 text-sm text-ink"
                >
                  <option value="production">Canvas (your school's usual Canvas)</option>
                  <option value="beta">Canvas Beta</option>
                  <option value="test">Canvas Test</option>
                </select>
              </details>
              {error && (
                <p role="alert" className="text-sm text-terracotta-600">
                  {error}
                </p>
              )}
              <button
                type="submit"
                disabled={busy || !clientId.trim()}
                className={`flex items-center gap-2 self-start rounded-full bg-forest px-5 py-2.5 text-sm font-bold text-cream hover:bg-forest-soft disabled:opacity-60 ${FOCUS}`}
              >
                {busy && <Spinner />}
                <span className="text-cream">Connect Canvas</span>
              </button>
            </form>
          </li>
        </ol>
        <p className="text-xs text-ink-soft">
          Teachers then see Wivoza in each course's menu, opening in its own tab. Students never see it. The first time, each teacher signs in to
          Wivoza once to connect their Canvas account.
        </p>
      </section>
    </div>
  )
}

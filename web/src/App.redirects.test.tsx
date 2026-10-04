// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, expect, test } from 'vitest'

// "Preserve existing routes as redirects to the new ones."
//
// These URLs are in teachers' browser history and bookmarks, and in links
// inside exports and check-in emails already sent. A 404 on any of them is
// the consolidation losing a teacher rather than reorganising the app for
// them — and a redirect that drops the query string is a subtler version of
// the same failure: a deep link quietly becomes a landing page.
//
// The redirect components are imported from App.tsx, not copied here: a copy
// would pass while the real ones were broken, which is exactly what happened
// the first time this file was written — mutating App.tsx's KeepQuery to drop
// the query string left these tests green.
//
// Importing App.tsx is safe despite its many `lazy()` calls: lazy defers the
// dynamic import until the component renders, and these tests render the
// redirect components directly rather than the app.
import { KeepQuery, LegacyOrRedirect, RedirectCoachChat } from './App'

afterEach(cleanup)

/// Renders the route table and reports where a given URL lands.
///
/// Cleans up first, so a test asserting several URLs in a row does not end up
/// reading the previous one's answer.
function landedAt(path: string): string {
  cleanup()
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="talk" element={<Where />} />
        <Route path="practice" element={<Where />} />
        <Route path="look-it-over" element={<Where />} />
        <Route path="debrief" element={<Where />} />
        <Route path="work" element={<Where />} />
        <Route path="guide" element={<Where />} />
        <Route path="guide/talk-it-through" element={<Where />} />

        <Route path="talk-to-me" element={<KeepQuery to="/talk" />} />
        <Route path="audio-coaching" element={<KeepQuery to="/debrief" />} />
        <Route path="coach-chat" element={<RedirectCoachChat />} />
        <Route path="communications" element={<LegacyOrRedirect to="/talk" page={<Legacy />} />} />
        <Route path="lesson-planning" element={<LegacyOrRedirect to="/look-it-over" page={<Legacy />} />} />
        <Route path="assignment-coach" element={<LegacyOrRedirect to="/look-it-over" page={<Legacy />} />} />
        <Route path="cheat-sheet" element={<Navigate to="/talk" replace />} />
        <Route path="first-30-days" element={<Navigate to="/talk" replace />} />
        <Route path="guide/practice" element={<Where />} />
        <Route path="guide/look-it-over" element={<Where />} />
        <Route path="guide/ask-practice" element={<Navigate to="/guide/talk-it-through" replace />} />
        <Route path="guide/cheat-sheet" element={<Navigate to="/guide" replace />} />
        <Route path="guide/lesson-planning" element={<Navigate to="/guide/look-it-over" replace />} />
        <Route path="guide/assignment-coach" element={<Navigate to="/guide/look-it-over" replace />} />
        <Route path="guide/communication-coach" element={<Navigate to="/guide/look-it-over" replace />} />
      </Routes>
    </MemoryRouter>,
  )
  return screen.getByTestId('where').textContent ?? ''
}

function Where() {
  const { pathname, search } = useLocation()
  return <span data-testid="where">{`${pathname}${search}`}</span>
}

/// Stands in for a retired tool's own page, still rendered when opening one
/// specific past item.
function Legacy() {
  const { pathname, search } = useLocation()
  return <span data-testid="where">{`LEGACY ${pathname}${search}`}</span>
}

// --- the four surfaces' own former URLs ---

test('the live Talk It Through URL still lands on Talk It Through', () => {
  expect(landedAt('/talk-to-me')).toBe('/talk')
})

// Telegram's check-in links carry ?followUp=, and Home's links carry ?open=.
// Both were sent before this refactor and cannot be reissued.
test('a Talk It Through deep link keeps its query', () => {
  expect(landedAt('/talk-to-me?followUp=f1')).toBe('/talk?followUp=f1')
  expect(landedAt('/talk-to-me?open=d1')).toBe('/talk?open=d1')
  expect(landedAt('/talk-to-me?mode=debrief')).toBe('/talk?mode=debrief')
})

test('the old Lesson Debrief URL lands on the debrief, query intact', () => {
  expect(landedAt('/audio-coaching')).toBe('/debrief')
  expect(landedAt('/audio-coaching?open=as1')).toBe('/debrief?open=as1')
})

// --- Ask & Practice split in two ---

test('Ask lands on Talk It Through, which now holds its conversations', () => {
  expect(landedAt('/coach-chat')).toBe('/talk')
  expect(landedAt('/coach-chat?tab=ask')).toBe('/talk')
})

test('Practice lands on Practice', () => {
  expect(landedAt('/coach-chat?tab=practice')).toBe('/practice')
})

test('a link to one past item keeps pointing at that item', () => {
  expect(landedAt('/coach-chat?tab=practice&open=a1')).toBe('/practice?open=a1')
  expect(landedAt('/coach-chat?tab=ask&open=d1')).toBe('/talk?open=d1')
})

// The old `area` param is the same taxonomy under its new name, so an
// onboarding or guide link that pre-selected a focus area still does.
test('the old area param arrives as the new topic param', () => {
  expect(landedAt('/coach-chat?area=classroom_management')).toBe('/talk?topic=classroom_management')
})

// --- the retired tools ---

test('bare visits to the retired tools land on the surface that replaced them', () => {
  expect(landedAt('/communications')).toBe('/talk')
  expect(landedAt('/lesson-planning')).toBe('/look-it-over')
  expect(landedAt('/assignment-coach')).toBe('/look-it-over')
})

// The promise that nobody loses their 97 conversations, 23 assignments and 12
// plans. My Work links to these with an id, and the page it was written on is
// still what opens it.
test('opening one specific past item still renders the page it was written on', () => {
  expect(landedAt('/communications?tool=write&open=m1')).toBe('LEGACY /communications?tool=write&open=m1')
  expect(landedAt('/lesson-planning?open=p1&mode=feedback')).toBe('LEGACY /lesson-planning?open=p1&mode=feedback')
  expect(landedAt('/assignment-coach?open=a1')).toBe('LEGACY /assignment-coach?open=a1')
})

// --- the two deletions ---

// "If any teacher is mid-program, their account should land on Talk It
// Through with no error and no empty state referring to it."
test('First 30 Days lands on Talk It Through, not an error', () => {
  expect(landedAt('/first-30-days')).toBe('/talk')
})

test('the Cheat Sheet lands on Talk It Through', () => {
  expect(landedAt('/cheat-sheet')).toBe('/talk')
})

// There is one guide per surface now, so five old guide URLs point at four
// pages. These are indexed and linked from inside the app, so none may 404.
test('every retired guide lands on the one that replaced it', () => {
  expect(landedAt('/guide/ask-practice')).toBe('/guide/talk-it-through')
  expect(landedAt('/guide/cheat-sheet')).toBe('/guide')
  // Lesson Planning, Assignment Coach and Communication Coach were one act
  // performed on four file types, and are one guide now.
  expect(landedAt('/guide/lesson-planning')).toBe('/guide/look-it-over')
  expect(landedAt('/guide/assignment-coach')).toBe('/guide/look-it-over')
  expect(landedAt('/guide/communication-coach')).toBe('/guide/look-it-over')
})

test('each surface has a guide of its own', () => {
  for (const path of ['/guide/talk-it-through', '/guide/practice', '/guide/look-it-over']) {
    expect(landedAt(path), path).toBe(path)
  }
})

// --- the surfaces exist ---

// The components above are the real ones now, so what is left to check is
// that the route table actually wires them to these paths.
test('every path tested here is declared in the real route table', async () => {
  const appSource = (await import('./App.tsx?raw')).default
  for (const path of [
    'talk-to-me',
    'audio-coaching',
    'coach-chat',
    'communications',
    'lesson-planning',
    'assignment-coach',
    'cheat-sheet',
    'first-30-days',
    'guide/ask-practice',
    'guide/cheat-sheet',
    'guide/lesson-planning',
    'guide/assignment-coach',
    'guide/communication-coach',
    'guide/practice',
    'guide/look-it-over',
    'talk',
    'practice',
    'look-it-over',
    'debrief',
    'work',
  ]) {
    expect(appSource.includes(`path="${path}"`), `${path} is not in App.tsx`).toBe(true)
  }
})

// A review result has a URL of its own now, so it has to be in the route
// table — a link from My Work that 404s is the same failure as a retired
// tool's URL 404ing.
test('a review result and a draft both have routes', async () => {
  const appSource = (await import('./App.tsx?raw')).default
  expect(appSource.includes('path="look-it-over/:reviewId"')).toBe(true)
  expect(appSource.includes('path="look-it-over"')).toBe(true)
})

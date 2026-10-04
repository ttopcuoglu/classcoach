// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, expect, test, vi } from 'vitest'
import type { UserProfile } from '../lib/api'

// The navigation IS the refactor. Nine items in three groups became four
// surfaces, and the thing most likely to undo that quietly is a later feature
// adding "just one more" nav item — which is how nine happened in the first
// place.
//
// So these tests count. A fifth surface appearing in the sidebar fails here
// with a list of what is in it, rather than being noticed six months later.

vi.mock('../lib/api', () => ({ logout: vi.fn() }))

const { default: Layout } = await import('./Layout')

function user(over: Partial<UserProfile> = {}): UserProfile {
  return {
    id: 'u1',
    email: 'teacher@example.com',
    name: 'Dana',
    role: 'teacher',
    plan: 'plus',
    focusMetric: null,
    experienceLevel: 'early',
    onboardingCompletedAt: new Date().toISOString(),
    ...over,
  } as UserProfile
}

function renderLayout(over: Partial<UserProfile> = {}) {
  return render(
    <MemoryRouter>
      <Layout user={user(over)} onLogout={() => {}} />
    </MemoryRouter>,
  )
}

afterEach(cleanup)

test('the sidebar offers exactly the four surfaces, plus Home, My Work and Profile', () => {
  renderLayout()
  // Scoped to the nav: the aside also holds the focus card and the upgrade
  // card, which link into a surface without being navigation.
  const links = Array.from(document.querySelectorAll('aside nav a')).map((a) => a.getAttribute('href'))
  expect(links).toEqual(['/', '/talk', '/practice', '/look-it-over', '/debrief', '/work', '/profile'])
})

test('the four surfaces are named as specified', () => {
  renderLayout()
  // The mobile bar carries short forms of the same labels, so this reads the
  // sidebar's own text rather than the whole document.
  const sidebar = document.querySelector('aside nav')!.textContent ?? ''
  for (const label of ['Talk It Through', 'Practice', 'Look It Over', 'Lesson Debrief']) {
    expect(sidebar.includes(label), label).toBe(true)
  }
})

// The subtitles say WHEN, not what — which is the distinction the nine-tool
// IA never drew.
test('the surfaces carry the specified subtitles', () => {
  renderLayout()
  expect(screen.getByText('ask, or think out loud')).toBeTruthy()
  expect(screen.getByText('rehearse the move')).toBeTruthy()
  expect(screen.getByText('before students see it')).toBeTruthy()
  expect(screen.getByText('after you taught it')).toBeTruthy()
})

test('Look It Over and Lesson Debrief sit under the before-and-after header', () => {
  renderLayout()
  expect(screen.getByText('Before and after')).toBeTruthy()
})

// Only one group has a header now. Headers on the other two would be labels
// for groups of two, which is a taxonomy nobody asked for.
test('only one group header is shown', () => {
  renderLayout()
  const headers = Array.from(document.querySelectorAll('aside nav p')).map((p) => p.textContent)
  expect(headers).toEqual(['Before and after'])
})

// Every deleted tool, by name. A later feature re-adding one of these to the
// nav is the specific regression this catches.
test('none of the nine retired tools is in the nav', () => {
  renderLayout()
  for (const gone of [
    'Ask & Practice',
    'Lesson Planning',
    'Assignment Coach',
    'Communication Coach',
    'Cheat Sheet',
    'First 30 Days',
  ]) {
    expect(screen.queryByText(gone), gone).toBeNull()
  }
})

test('the old three group headers are gone', () => {
  renderLayout()
  for (const gone of ['Coaching', 'Plan', 'Grow']) {
    expect(screen.queryByText(gone), gone).toBeNull()
  }
})

// Admin keeps its place but stays out of visual adjacency with the
// rubric/evaluation features — it sits in its own bordered block below
// everything else, not in the surface list.
test('an admin sees Admin, separated from the surfaces', () => {
  renderLayout({ role: 'org_admin' })
  const admin = screen.getByText('Admin').closest('a')
  expect(admin?.getAttribute('href')).toBe('/admin')
  // Not inside the surface nav.
  expect(document.querySelector('aside nav')?.contains(admin!)).toBe(false)
})

test('a teacher sees no Admin link at all', () => {
  renderLayout({ role: 'teacher' })
  expect(screen.queryByText('Admin')).toBeNull()
})

// The nav used to differ by experience level, to hide First 30 Days from
// veterans. A nav that varies between accounts is one nobody can be told how
// to use — "it's under Grow" was wrong for half of them.
test('the nav is identical for a new teacher and a veteran', () => {
  const { unmount } = renderLayout({ experienceLevel: 'first_year' })
  const first = Array.from(document.querySelectorAll('aside a')).map((a) => a.getAttribute('href'))
  unmount()
  renderLayout({ experienceLevel: 'veteran' })
  const veteran = Array.from(document.querySelectorAll('aside a')).map((a) => a.getAttribute('href'))
  expect(veteran).toEqual(first)
})

// Four surfaces fit a bottom bar, so the popover that made reaching a tool
// two taps is gone.
test('the mobile bar is flat — four surfaces and Home, no popovers', () => {
  renderLayout()
  const bar = document.querySelector('nav.fixed')
  const links = Array.from(bar?.querySelectorAll('a') ?? []).map((a) => a.getAttribute('href'))
  expect(links).toEqual(['/', '/talk', '/practice', '/look-it-over', '/debrief'])
  expect(bar?.querySelectorAll('button').length).toBe(0)
})

// They left the bottom bar to make room for the surfaces, so they have to be
// somewhere a phone can reach.
test('My Work and Profile are reachable on mobile from the top bar', () => {
  renderLayout()
  const top = document.querySelector('header')
  const links = Array.from(top?.querySelectorAll('a') ?? []).map((a) => a.getAttribute('href'))
  expect(links).toContain('/work')
  expect(links).toContain('/profile')
})

// The upgrade card used to name three tools that no longer exist.
test('the upgrade card names only things that still exist', () => {
  renderLayout({ plan: 'free', plusAccess: null } as Partial<UserProfile>)
  const card = screen.getByText('Wivoza Plus').parentElement
  expect(card?.textContent).not.toContain('Lesson Planning')
  expect(card?.textContent).not.toContain('Communication Coach')
  expect(card?.textContent).toContain('Look It Over')
})

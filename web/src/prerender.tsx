// Build-time only: renders the public pages to HTML so a crawler's first
// visit reads the page's text instead of an empty <div id="root">.
// scripts/prerender.mjs builds this as an SSR bundle after the normal build
// and writes one HTML file per route. The browser never loads this module.
//
// The pages are imported directly rather than through App's lazy() routes:
// a lazy page renders its Suspense fallback here, which is the spinner, not
// the page.
import { GoogleOAuthProvider } from '@react-oauth/google'
import { renderToString } from 'react-dom/server'
import { StaticRouter } from 'react-router-dom'
import Faq from './pages/Faq'
import ForSchools from './pages/ForSchools'
import Guide from './pages/Guide'
import GuideAskPractice from './pages/GuideAskPractice'
import GuideAssignmentCoach from './pages/GuideAssignmentCoach'
import GuideCommunicationCoach from './pages/GuideCommunicationCoach'
import GuideLessonDebrief from './pages/GuideLessonDebrief'
import GuideLessonPlanning from './pages/GuideLessonPlanning'
import GuideTalkItThrough from './pages/GuideTalkItThrough'
import Landing from './pages/Landing'
import Research from './pages/Research'
import Terms from './pages/Terms'

export { PUBLIC_PAGE_META } from './lib/pageMeta'

// Keep in step with PUBLIC_PAGE_META and public/sitemap.xml.
const PAGES: Record<string, () => React.ReactElement> = {
  '/': () => <Landing onSignedIn={() => {}} />,
  '/faq': () => <Faq />,
  '/for-schools': () => <ForSchools />,
  '/terms': () => <Terms />,
  '/research': () => <Research />,
  '/guide': () => <Guide />,
  '/guide/talk-it-through': () => <GuideTalkItThrough />,
  '/guide/lesson-debrief': () => <GuideLessonDebrief />,
  '/guide/ask-practice': () => <GuideAskPractice />,
  '/guide/lesson-planning': () => <GuideLessonPlanning />,
  '/guide/assignment-coach': () => <GuideAssignmentCoach />,
  '/guide/communication-coach': () => <GuideCommunicationCoach />,
}

export const ROUTES = Object.keys(PAGES)

export function render(path: string): string {
  const Page = PAGES[path]
  return renderToString(
    <GoogleOAuthProvider clientId={import.meta.env.VITE_GOOGLE_CLIENT_ID ?? ''}>
      <StaticRouter location={path}>
        <Page />
      </StaticRouter>
    </GoogleOAuthProvider>,
  )
}

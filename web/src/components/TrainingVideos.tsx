import { useState } from 'react'
import { ArrowRightIcon, CheckIcon } from './icons'

// The Wivoza Training videos, shared by the home page (the intro only) and the
// Guide (the whole library). One copy, so the two can never list different
// videos or play a different id for the same title.

// The Wivoza Training playlist on YouTube, in playlist order. Thumbnails are
// served from this site rather than YouTube's image servers, so the page makes
// no request to Google until someone actually presses play.
export const PLAYLIST_URL = 'https://www.youtube.com/playlist?list=PLcoaDQMmtVBU'

export const INTRO_VIDEO = {
  id: 'vG1IPMu8pLQ',
  thumb: '/videos/meet-wivoza.webp',
  title: 'Meet Wivoza — An AI Instructional Coach for K-12 Teachers',
}

export const GET_STARTED_VIDEO = {
  id: 'bao2qZHXzZA',
  thumb: '/videos/get-started.webp',
  title: 'Get Started with Wivoza',
  blurb: 'Setup and your first session.',
}

// `slug` is also the anchor — /guide#video-<slug> — that the home page's
// "Watch how it works" links land on.
export const FEATURE_VIDEOS = [
  { slug: 'talk-it-through', id: '-Xhmj0F7n_o', title: 'Talk It Through', blurb: 'Process a rough lesson in five minutes.' },
  { slug: 'lesson-debrief', id: 'lLnZhrtiAIw', title: 'Lesson Debrief', blurb: 'Record a class, see what it sounded like.' },
  { slug: 'ask-practice', id: 'yyYz795vFRg', title: 'Ask & Practice', blurb: 'Get the words, or rehearse the hard part.' },
  { slug: 'lesson-planning', id: '-LNj8wyhk2I', title: 'Lesson Planning', blurb: 'Beat the blank page.' },
  { slug: 'assignment-coach', id: 'HrlsBYrjmV4', title: 'Assignment Coach', blurb: 'What does your assignment really ask?' },
  { slug: 'communication-coach', id: '4fg0c7Q5CiY', title: 'Communication Coach', blurb: 'Say the hard thing without the edge.' },
]

// Shows the thumbnail until someone presses play, and only then loads YouTube —
// from the privacy-enhanced domain. A visitor who never watches never loads
// YouTube's scripts or cookies, and the page stays fast.
export function VideoFacade({
  id,
  thumb,
  title,
  size = 'large',
}: {
  id: string
  thumb: string
  title: string
  size?: 'large' | 'card'
}) {
  const [playing, setPlaying] = useState(false)
  const large = size === 'large'
  return (
    <div
      className={`relative aspect-video w-full overflow-hidden bg-forest ${large ? 'rounded-3xl shadow-xl' : 'rounded-xl shadow-sm'}`}
    >
      {playing ? (
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0`}
          title={title}
          allow="autoplay; encrypted-media; picture-in-picture"
          allowFullScreen
          className="absolute inset-0 h-full w-full"
        />
      ) : (
        <button
          type="button"
          onClick={() => setPlaying(true)}
          aria-label={`Play video: ${title}`}
          className="group absolute inset-0"
        >
          <img src={thumb} alt="" loading={large ? 'eager' : 'lazy'} className="h-full w-full object-cover" />
          {/* Tucked into the bottom-right corner, below the headline. Centred it
              covered the word "teacher", and anywhere higher it clipped "coach"
              on a phone: the thumbnail scales with the screen but a button does
              not, so it also steps down in size on small screens. */}
          <span
            className={`absolute bottom-[5%] right-[4%] flex items-center justify-center rounded-full bg-terracotta shadow-lg transition-transform duration-200 group-hover:scale-105 ${
              large ? 'h-10 w-10 sm:h-16 sm:w-16 lg:h-20 lg:w-20' : 'h-10 w-10'
            }`}
          >
            <svg
              viewBox="0 0 24 24"
              className={`ml-0.5 text-white ${large ? 'h-4 w-4 sm:h-7 sm:w-7 lg:ml-1 lg:h-8 lg:w-8' : 'h-4 w-4'}`}
              fill="currentColor"
              aria-hidden="true"
            >
              <path d="M8 5.5v13l11-6.5-11-6.5Z" />
            </svg>
          </span>
        </button>
      )}
    </div>
  )
}

// The full library: Get Started featured first, then one card per feature.
// Lives on the Guide rather than the home page — the home page's job is to
// show why Wivoza is worth trying, the Guide's is to teach it.
export function TrainingLibrary() {
  return (
    <>
      <div className="grid items-center gap-6 rounded-3xl border border-hairline bg-cream-card p-4 shadow-sm md:grid-cols-[1.35fr_1fr] md:gap-10 md:p-6">
        <VideoFacade {...GET_STARTED_VIDEO} size="card" />
        <div className="px-2 pb-2 text-left md:px-0 md:pb-0">
          <span className="inline-flex rounded-full bg-gold-tint px-3 py-1 text-xs font-semibold uppercase tracking-wide text-terracotta-600">
            Start here
          </span>
          <h3 className="mt-3 font-heading text-2xl font-extrabold text-forest sm:text-3xl">{GET_STARTED_VIDEO.title}</h3>
          <p className="mt-2 text-ink-soft">{GET_STARTED_VIDEO.blurb}</p>
          <ul className="mt-5 space-y-2.5 text-sm text-ink">
            {['Create your free account', 'Enter your district code, if your school has one', 'Run your first coaching session'].map(
              (step) => (
                <li key={step} className="flex items-start gap-2.5">
                  <CheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-forest" />
                  {step}
                </li>
              ),
            )}
          </ul>
        </div>
      </div>

      <div className="mt-6 grid gap-6 text-left sm:grid-cols-2 lg:grid-cols-3">
        {FEATURE_VIDEOS.map((video) => (
          <div key={video.id} id={`video-${video.slug}`} className="scroll-mt-24">
            <VideoFacade id={video.id} thumb={`/videos/${video.slug}.webp`} title={video.title} size="card" />
            <h3 className="mt-3 font-heading text-base font-bold text-forest">{video.title}</h3>
            <p className="mt-0.5 text-sm text-ink-soft">{video.blurb}</p>
          </div>
        ))}
      </div>

      <div className="mt-8 text-center">
        <a
          href={PLAYLIST_URL}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-2 text-sm font-semibold text-forest hover:text-terracotta-600"
        >
          Watch the full playlist on YouTube
          <ArrowRightIcon className="h-4 w-4" />
        </a>
      </div>
    </>
  )
}

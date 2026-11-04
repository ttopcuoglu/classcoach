import { useEffect } from 'react'

// Slide-in-as-you-scroll for the home page: every element marked
// `data-reveal` starts a little lower and transparent, and eases into place
// the first time it comes into view. Siblings marked together arrive one after
// another rather than all at once.
//
// Hidden only from JavaScript, and only once the page is running: the
// prerendered HTML (scripts/prerender.mjs), search engines and anyone without
// JavaScript get every element visible. Anything already on screen at load is
// left alone, so nothing at the top of the page flashes in. Reduce Motion
// turns it off entirely.
//
// Checked on scroll rather than with an IntersectionObserver. An observer only
// reports an element whose visibility it sees change, and in testing it now
// and then missed two cards entirely, leaving them invisible for good. This
// check cannot miss: anything scrolled to or past is shown.
export function useReveal() {
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    const pending = new Set(
      Array.from(document.querySelectorAll<HTMLElement>('[data-reveal]')).filter(
        (el) => el.getBoundingClientRect().top > window.innerHeight,
      ),
    )

    for (const el of pending) {
      const siblings = Array.from(el.parentElement?.children ?? []).filter((c) => c.hasAttribute('data-reveal'))
      const delay = Math.min(siblings.indexOf(el), 3) * 90
      el.style.opacity = '0'
      el.style.transform = 'translateY(28px)'
      el.style.transition = `opacity 600ms ease-out ${delay}ms, transform 600ms cubic-bezier(0.22, 1, 0.36, 1) ${delay}ms`
    }

    let frame = 0
    const check = () => {
      frame = 0
      const line = window.innerHeight * 0.92
      for (const el of pending) {
        if (el.getBoundingClientRect().top > line) continue
        pending.delete(el)
        el.style.opacity = '1'
        el.style.transform = 'none'
        // Hand the element back to its own styles once it has arrived, so hover
        // lifts and other transitions behave as before.
        window.setTimeout(() => {
          el.style.transition = ''
          el.style.transform = ''
          el.style.opacity = ''
        }, 1000)
      }
      if (pending.size === 0) stop()
    }
    const onScroll = () => {
      if (!frame) frame = window.requestAnimationFrame(check)
    }
    const stop = () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      if (frame) window.cancelAnimationFrame(frame)
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll, { passive: true })
    // A page opened at an anchor (#pricing) is already scrolled.
    onScroll()
    return stop
  }, [])
}

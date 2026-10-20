import { createContext, useContext } from 'react'

// True while the whole Lesson Debrief is laid out for printing: every
// "Read more", "Show all" and one-category-at-a-time picker opens fully, since
// paper cannot be tapped.
export const PrintAllContext = createContext(false)

export const usePrintAll = () => useContext(PrintAllContext)

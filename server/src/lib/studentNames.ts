/// Spotting a roster before it reaches the model.
///
/// Look It Over takes whatever a teacher made, and some of what they made has
/// their students' names in it — a gradebook export, a group-work plan, a
/// marked set of answers. None of that is needed to review the document, and
/// the promise this surface makes is that it reads the work rather than the
/// class.
///
/// So this runs on the extracted text BEFORE any model call, and the teacher
/// is asked. It is deliberately a structural heuristic rather than a name
/// list: name lists are culturally narrow and would quietly miss exactly the
/// students they can least afford to miss. What gives a roster away is its
/// shape — a column headed Name, or a run of lines that are nothing but two
/// capitalised words.

export type NameFinding = {
  /// What was spotted, in a teacher's words.
  reason: string
  /// Which lines look like roster rows, so they can be shown or stripped.
  lines: number[]
}

const NAME_HEADER = /^\s*(student|students|name|names|first name|last name|pupil)\s*$/i
// Internal capitals and stops are part of the name, not an exception to it:
// O’Connor, McDonald, St. John. A pattern that only accepts one capital per
// word quietly misses exactly the students it can least afford to miss.
const TWO_CAPITALISED = /^\s*[A-Z][A-Za-z'’.-]{1,20}(\s+[A-Z][A-Za-z'’.-]{1,20}){1,2}\s*$/
const DELIMITED = /[,\t;|]/

/// A header cell that names a person column, in a delimited first line.
function headerNamesAPerson(line: string): boolean {
  if (!DELIMITED.test(line)) return false
  return line
    .split(/[,\t;|]/)
    .some((cell) => NAME_HEADER.test(cell.replace(/^["']|["']$/g, '')))
}

/// Four or more consecutive lines that are nothing but a capitalised name.
///
/// Four rather than two: a worksheet with "Marie Curie" and "Rosalind
/// Franklin" in it is not a roster, and stopping a teacher over two lines
/// would teach them to click through the prompt without reading it.
const ROSTER_RUN = 4

export function findStudentNames(text: string): NameFinding | null {
  const lines = text.split('\n')

  for (const [i, line] of lines.entries()) {
    if (headerNamesAPerson(line)) {
      return { reason: 'a column headed with a student name', lines: [i] }
    }
  }

  let run: number[] = []
  let longest: number[] = []
  for (const [i, line] of lines.entries()) {
    if (TWO_CAPITALISED.test(line)) {
      run.push(i)
      if (run.length > longest.length) longest = [...run]
    } else if (line.trim() !== '') {
      run = []
    }
  }
  if (longest.length >= ROSTER_RUN) {
    return { reason: 'a list of names', lines: longest }
  }
  return null
}

/// Removes what `findStudentNames` found, leaving the rest of the document
/// intact.
///
/// A name column is blanked cell by cell rather than dropping the row, so the
/// marks, dates and comments beside it survive — that data is usually the
/// reason the teacher uploaded the file at all.
export function stripStudentNames(text: string): string {
  const lines = text.split('\n')
  const finding = findStudentNames(text)
  if (!finding) return text

  if (finding.reason === 'a list of names') {
    const drop = new Set(finding.lines)
    return lines.filter((_, i) => !drop.has(i)).join('\n')
  }

  const headerIndex = finding.lines[0]
  const header = lines[headerIndex]
  const delimiter = [',', '\t', ';', '|'].find((d) => header.includes(d)) ?? ','
  const columns = header.split(delimiter)
  const nameColumns = new Set(
    columns.flatMap((cell, i) => (NAME_HEADER.test(cell.replace(/^["']|["']$/g, '')) ? [i] : [])),
  )
  return lines
    .map((line, i) => {
      if (i < headerIndex || !line.includes(delimiter)) return line
      return line
        .split(delimiter)
        .map((cell, col) => (nameColumns.has(col) && i !== headerIndex ? '' : cell))
        .join(delimiter)
    })
    .join('\n')
}

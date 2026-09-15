// Grade/subject breakdown grouping for the admin panel. Small schools rarely
// have 5 teachers in one grade band or subject, so instead of a wall of "not
// enough data", neighbouring buckets merge upward until each shown group
// clears the floor: K-2 + 3-5 into K-5, Math + Science into STEM, and finally
// the whole school. A level is only ever shown whole — either every part on
// its own, or all of it combined — so a shown group can never be subtracted
// from its parent to expose a smaller one.

export type BreakdownRow = { userId: string }
export type BreakdownGroup<R> = { label: string; rows: R[]; combined?: string[] }

type TreeNode = { label: string; key?: string; children?: TreeNode[] }
type Resolved<R> = { groups: BreakdownGroup<R>[]; rows: R[]; complete: boolean }

const GRADE_TREE: TreeNode = {
  label: 'All grades',
  children: [
    { label: 'Grades K-5', children: [{ label: 'Grades K-2', key: 'K-2' }, { label: 'Grades 3-5', key: '3-5' }] },
    { label: 'Grades 6-12', children: [{ label: 'Grades 6-8', key: '6-8' }, { label: 'Grades 9-12', key: '9-12' }] },
  ],
}

const SUBJECT_TREE: TreeNode = {
  label: 'All subjects',
  children: [
    { label: 'STEM', children: [{ label: 'Math', key: 'Math' }, { label: 'Science', key: 'Science' }] },
    { label: 'Humanities', children: [{ label: 'ELA', key: 'ELA' }, { label: 'Social Studies', key: 'Social Studies' }] },
    { label: 'Other subjects', key: 'Other' },
  ],
}

export function mergeBreakdownGroups<R extends BreakdownRow>(
  grouped: Map<string, R[]>,
  by: 'gradeBand' | 'subject',
  minTeachers: number,
): BreakdownGroup<R>[] {
  const teachersIn = (rows: R[]) => new Set(rows.map((r) => r.userId)).size
  const rowsFor = (node: TreeNode): R[] =>
    node.key ? (grouped.get(node.key) ?? []) : (node.children ?? []).flatMap(rowsFor)
  const leafLabelsWithRows = (node: TreeNode): string[] =>
    node.key
      ? (grouped.get(node.key)?.length ?? 0) > 0
        ? [node.label.replace(/^Grades /, '')]
        : []
      : (node.children ?? []).flatMap(leafLabelsWithRows)

  function resolve(node: TreeNode): Resolved<R> {
    const rows = rowsFor(node)
    // A bucket nobody recorded in doesn't hold anything back.
    if (rows.length === 0) return { groups: [], rows, complete: true }
    if (node.key) {
      const shown = teachersIn(rows) >= minTeachers
      return { groups: shown ? [{ label: node.label, rows }] : [], rows, complete: shown }
    }
    const children = (node.children ?? []).map(resolve)
    if (children.every((c) => c.complete)) {
      return { groups: children.flatMap((c) => c.groups), rows, complete: true }
    }
    if (teachersIn(rows) >= minTeachers) {
      const combined = leafLabelsWithRows(node)
      return { groups: [{ label: node.label, rows, combined: combined.length > 1 ? combined : undefined }], rows, complete: true }
    }
    return { groups: [], rows, complete: false }
  }

  const groups = resolve(by === 'subject' ? SUBJECT_TREE : GRADE_TREE).groups
  // Sessions with no usable grade sit outside the tree — they aren't a grade
  // band anyone could target — and only show once there are enough of them.
  if (by === 'gradeBand') {
    const unspecified = grouped.get('Unspecified') ?? []
    if (teachersIn(unspecified) >= minTeachers) groups.push({ label: 'Grade not given', rows: unspecified })
  }
  return groups
}

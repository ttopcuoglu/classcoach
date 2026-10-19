// metricsDetail goes to clients as numbers only; anything else in it (the
// answer and follow-up logs) travels beside it as metricsLogs.
//
// The iPhone app decodes metricsDetail as a dictionary of numbers, and a
// single list in it fails the decode of the whole lesson — and with it the
// whole session list, which the app then reads as "the server has none of
// these" and cancels the uploads still in flight. Every installed copy reads
// this, so the shape is fixed here rather than in the app.

type Row = Record<string, unknown>

function isPlainObject(v: unknown): v is Row {
  return typeof v === 'object' && v !== null && !Array.isArray(v) && !(v instanceof Date)
}

function splitOne(row: Row): Row {
  if (!isPlainObject(row.metricsDetail)) return row
  const numbers: Row = {}
  const logs: Row = {}
  for (const [key, value] of Object.entries(row.metricsDetail)) {
    if (value === null || typeof value === 'number') numbers[key] = value
    else logs[key] = value
  }
  return { ...row, metricsDetail: numbers, metricsLogs: logs }
}

/// A session, a list of sessions, or anything else (returned as it is).
export function splitMetricLogs(body: unknown): unknown {
  if (Array.isArray(body)) return body.map((item) => (isPlainObject(item) ? splitOne(item) : item))
  if (isPlainObject(body)) return splitOne(body)
  return body
}

// Runs the voice classifier on a WAV file and prints what each minute was:
//   npx tsx src/scripts/tryVoiceClasses.ts recording.wav
// For checking it against a test recording where you know what happened when.
import { classifyVoicesInFile, voiceShares } from '../lib/voiceActivity.ts'

const path = process.argv[2]
if (!path) {
  console.error('usage: tsx src/scripts/tryVoiceClasses.ts <file.wav>')
  process.exit(1)
}
const started = Date.now()
const trace = await classifyVoicesInFile(path)
if (!trace) {
  console.error('Not a 16-bit or float PCM WAV of at least a second.')
  process.exit(1)
}
const pct = (n: number) => `${Math.round((n / trace.length) * 100)}%`
const s = voiceShares(trace)
console.log(`${trace.length}s analysed in ${Date.now() - started} ms`)
console.log(`one voice ${pct(s.voiceOneSec)}  many voices ${pct(s.voiceManySec)}  other sound ${pct(s.voiceOtherSec)}  quiet ${pct(s.voiceQuietSec)}`)
console.log('\nminute  v=one voice m=many voices o=other q=quiet')
for (let m = 0; m * 60 < trace.length; m++) {
  console.log(`${String(m).padStart(4)}:00  ${trace.slice(m * 60, m * 60 + 60)}`)
}

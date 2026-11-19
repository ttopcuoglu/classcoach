// Adds two more demo teachers and a demo supervisor to Maple Ridge Academy so
// the Self Evaluation sharing flow can be shown end to end: each teacher's
// supervisor is the demo supervisor, who then sees their shares under
// School Workspace > Evaluations.
//
//   DEMO_PASSWORD='…' npx tsx --env-file=.env src/scripts/seedSupervisorDemo.ts          (dry run)
//   DEMO_PASSWORD='…' npx tsx --env-file=.env src/scripts/seedSupervisorDemo.ts --write
//
// The password comes from the environment so it is never written to the repo.
// Refuses to touch an address that already exists.

import bcrypt from 'bcryptjs'
import { prisma } from '../lib/prisma.ts'

const SCHOOL_NAME = 'Maple Ridge Academy'
const SUPERVISOR = { email: 'demo.supervisor1@wivoza.com', name: 'Demo Supervisor', jobTitle: 'Assistant Principal' }
const TEACHERS = [
  { email: 'demo.teacher2@wivoza.com', name: 'Demo Teacher 2', jobTitle: 'Teacher' },
  { email: 'demo.teacher3@wivoza.com', name: 'Demo Teacher 3', jobTitle: 'Teacher' },
]

async function main() {
  const write = process.argv.includes('--write')
  const password = process.env.DEMO_PASSWORD
  if (!password || password.length < 8) throw new Error('Set DEMO_PASSWORD (8+ characters).')

  const org = await prisma.organization.findFirst({ where: { name: SCHOOL_NAME } })
  if (!org) throw new Error(`${SCHOOL_NAME} not found.`)
  const emails = [SUPERVISOR.email, ...TEACHERS.map((t) => t.email)]
  const existing = await prisma.user.findMany({ where: { email: { in: emails } }, select: { email: true } })
  if (existing.length) throw new Error(`Already exists: ${existing.map((u) => u.email).join(', ')}`)

  console.log(`School: ${org.name} (${org.id})`)
  console.log(`Supervisor: ${SUPERVISOR.email}`)
  for (const t of TEACHERS) console.log(`Teacher: ${t.email} -> supervisor ${SUPERVISOR.email}`)
  if (!write) {
    console.log('Dry run. Add --write to create them.')
    return
  }

  const passwordHash = await bcrypt.hash(password, 10)
  const now = new Date()
  const common = { passwordHash, role: 'teacher' as const, organizationId: org.id, termsAcceptedAt: now, ageConfirmedAt: now }
  await prisma.$transaction(async (tx) => {
    const supervisor = await tx.user.create({ data: { ...common, ...SUPERVISOR } })
    for (const t of TEACHERS) await tx.user.create({ data: { ...common, ...t, supervisorId: supervisor.id } })
  })
  console.log('Created.')
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())

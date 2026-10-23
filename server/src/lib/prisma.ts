import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../generated/prisma/client.ts'

// DATABASE_POOL_MAX exists for the privacy test's throwaway in-memory
// database (routes/schoolPriorities.privacy.test.ts), whose socket handles one
// connection at a time. Unset — as it is in production — the connection string
// alone is passed, exactly as before.
const poolMax = Number(process.env.DATABASE_POOL_MAX)
const adapter = new PrismaPg(
  Number.isInteger(poolMax) && poolMax > 0
    ? { connectionString: process.env.DATABASE_URL ?? '', max: poolMax }
    : (process.env.DATABASE_URL ?? ''),
)

export const prisma = new PrismaClient({ adapter })

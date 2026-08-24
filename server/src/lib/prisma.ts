import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../generated/prisma/client.ts'

const adapter = new PrismaPg(process.env.DATABASE_URL ?? '')

export const prisma = new PrismaClient({ adapter })

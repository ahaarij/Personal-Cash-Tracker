import 'dotenv/config'
import postgres from 'postgres'

const url = process.env.DATABASE_URL ?? 'postgresql://localhost:5432/cashflow'

// PostgreSQL BIGINT (type 20) returns as string by default in postgres.js.
// All our money amounts and ids are safe as JS numbers (< 2^53).
export const sql = postgres(url, {
  max: 10,
  idle_timeout: 30,
  types: {
    bigint: {
      to: 20,
      from: [20],
      parse: (x: string) => Number(x),
      serialize: (x: number) => String(x),
    },
  },
})

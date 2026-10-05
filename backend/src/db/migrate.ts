import { sql } from './client.js'

export async function migrate() {
  await sql`CREATE EXTENSION IF NOT EXISTS pgcrypto`

  await sql`
    CREATE TABLE IF NOT EXISTS users (
      id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      email       TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      username    TEXT NOT NULL UNIQUE,
      email_visibility BOOLEAN NOT NULL DEFAULT true,
      verified    BOOLEAN NOT NULL DEFAULT false,
      created     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated     TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `

  await sql`
    CREATE TABLE IF NOT EXISTS accounts (
      id               TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      owner            TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name             TEXT NOT NULL,
      type             TEXT NOT NULL CHECK (type IN ('credit_card','cash','debit_card')),
      currency         TEXT NOT NULL,
      opening_balance  BIGINT NOT NULL DEFAULT 0,
      credit_limit     BIGINT,
      opening_utilized BIGINT,
      archived         BOOLEAN NOT NULL DEFAULT false,
      sort_order       INTEGER NOT NULL DEFAULT 0,
      created          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated          TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `

  await sql`CREATE INDEX IF NOT EXISTS accounts_owner ON accounts(owner)`

  await sql`
    CREATE TABLE IF NOT EXISTS categories (
      id       TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      owner    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name     TEXT NOT NULL,
      colour   TEXT NOT NULL DEFAULT '',
      archived BOOLEAN NOT NULL DEFAULT false,
      created  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `

  await sql`CREATE INDEX IF NOT EXISTS categories_owner ON categories(owner)`

  await sql`
    CREATE TABLE IF NOT EXISTS trips (
      id         TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      owner      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name       TEXT NOT NULL,
      start_date TEXT NOT NULL,
      end_date   TEXT NOT NULL,
      created    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `

  await sql`CREATE INDEX IF NOT EXISTS trips_owner ON trips(owner)`

  await sql`
    CREATE TABLE IF NOT EXISTS transactions (
      id                 TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      owner              TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      date               TEXT NOT NULL,
      amount             BIGINT NOT NULL,
      account            TEXT NOT NULL REFERENCES accounts(id),
      type               TEXT NOT NULL CHECK (type IN ('expense','income','transfer')),
      category           TEXT REFERENCES categories(id),
      note               TEXT NOT NULL DEFAULT '',
      trip               TEXT REFERENCES trips(id),
      transfer_pair_id   TEXT,
      transfer_direction TEXT CHECK (transfer_direction IN ('in','out')),
      client_id          TEXT NOT NULL,
      deleted            BOOLEAN NOT NULL DEFAULT false,
      created            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated            TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `

  await sql`CREATE INDEX IF NOT EXISTS transactions_owner ON transactions(owner)`
  await sql`CREATE INDEX IF NOT EXISTS transactions_date  ON transactions(date)`
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS transactions_client_id ON transactions(client_id)`

  await sql`
    CREATE TABLE IF NOT EXISTS settings (
      id                  TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      owner               TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
      enabled_currencies  JSONB NOT NULL DEFAULT '[]',
      default_currency    TEXT NOT NULL DEFAULT '',
      default_account     TEXT REFERENCES accounts(id),
      date_format         TEXT NOT NULL DEFAULT 'DD/MM/YYYY',
      number_format       TEXT NOT NULL DEFAULT 'en-US',
      created             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated             TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `

  await sql`ALTER TABLE settings ADD COLUMN IF NOT EXISTS currency_order JSONB NOT NULL DEFAULT '[]'`

  await sql`
    CREATE TABLE IF NOT EXISTS audit_log (
      id            TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      user_id       TEXT,
      session_id    TEXT,
      ip            TEXT,
      action        TEXT NOT NULL,
      target_record TEXT,
      result        TEXT NOT NULL CHECK (result IN ('success','failure')),
      created       TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `

  console.log('[db] migrations applied')
}

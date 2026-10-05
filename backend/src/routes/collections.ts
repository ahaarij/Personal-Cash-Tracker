import { Hono } from 'hono'
import { sql } from '../db/client.js'
import { v4 as uuid } from 'uuid'

// Tables exposed via this generic handler and their allowed columns
const ALLOWED_COLLECTIONS = new Set([
  'accounts', 'categories', 'trips', 'transactions', 'settings',
])

// Columns that cannot be set/changed by the client
const PROTECTED = new Set(['id', 'owner', 'created', 'updated'])

// Explicit allowlist of writable columns per collection
const WRITABLE: Record<string, Set<string>> = {
  accounts:     new Set(['name','type','currency','opening_balance','credit_limit','opening_utilized','archived','sort_order']),
  categories:   new Set(['name','colour','archived']),
  trips:        new Set(['name','start_date','end_date']),
  transactions: new Set(['date','amount','account','type','category','note','trip','transfer_pair_id','transfer_direction','client_id','deleted']),
  settings:     new Set(['enabled_currencies','default_currency','default_account','date_format','number_format','currency_order']),
}

function filterWritable(collection: string, body: Record<string, unknown>): Record<string, unknown> {
  const allowed = WRITABLE[collection]
  if (!allowed) return {}
  return Object.fromEntries(Object.entries(body).filter(([k]) => allowed.has(k)))
}

// Max amount: 1 billion in minor units (e.g. fils/cents)
const MAX_AMOUNT = 1_000_000_000_00

async function validateTransaction(body: Record<string, unknown>, userId: string): Promise<string | null> {
  // #4 — amount must be a positive integer within bounds
  const amount = body.amount
  if (amount !== undefined) {
    if (typeof amount !== 'number' || !Number.isInteger(amount) || amount <= 0 || amount > MAX_AMOUNT) {
      return 'amount must be a positive integer (in minor currency units) up to 100,000,000,000'
    }
  }

  // #5 — account FK must belong to this user
  const accountId = body.account
  if (accountId) {
    const [acc] = await sql.unsafe(
      `SELECT id FROM accounts WHERE id = $1 AND owner = $2`,
      [accountId, userId],
    ) as Row[]
    if (!acc) return 'account not found or not owned by you'
  }

  // #5 — category FK must belong to this user (if provided)
  const categoryId = body.category
  if (categoryId) {
    const [cat] = await sql.unsafe(
      `SELECT id FROM categories WHERE id = $1 AND owner = $2`,
      [categoryId, userId],
    ) as Row[]
    if (!cat) return 'category not found or not owned by you'
  }

  return null
}

function auditLog(userId: string, action: string, targetId?: string) {
  sql.unsafe(
    `INSERT INTO audit_log (user_id, action, target_record, result) VALUES ($1, $2, $3, 'success')`,
    [userId, action, targetId ?? null],
  ).catch(() => {})
}

type Row = Record<string, unknown>

// --- Simple PocketBase-style filter parser ---
// Supports: field=value, field!=value, field=true, field=false, field=''
// Returns a postgres tagged-template-compatible fragment builder
function parseFilter(filter: string | undefined, owner: string): { where: string; values: unknown[] } {
  const conditions: string[] = [`owner = $1`]
  const values: unknown[] = [owner]

  if (!filter) return { where: conditions.join(' AND '), values }

  // Split by && (PocketBase uses && for AND)
  const parts = filter.split(/\s*&&\s*/)
  for (const part of parts) {
    // Match: field op value (op = = != >= <= > <)
    const m = part.trim().match(/^(\w+)\s*(!=|>=|<=|>|<|=)\s*(.+)$/)
    if (!m) continue
    const [, field, op, rawVal] = m

    // Whitelist allowed fields to prevent SQL injection
    if (!/^[a-z_]+$/.test(field)) continue

    let val: unknown
    if (rawVal === 'true') val = true
    else if (rawVal === 'false') val = false
    else if (rawVal === "''") val = null
    else val = rawVal.replace(/^['"]|['"]$/g, '') // strip surrounding quotes

    const idx = values.length + 1
    values.push(val)

    const pgOp = op === '=' && val === null ? 'IS' : op
    const notNull = op === '!=' && val === null

    if (notNull) {
      conditions.push(`${field} IS NOT NULL`)
      values.pop()
    } else {
      conditions.push(`${field} ${pgOp} $${idx}`)
    }
  }

  return { where: conditions.join(' AND '), values }
}

// Parse sort string: '-date' → 'date DESC', 'name' → 'name ASC'
function parseSort(sort: string | undefined): string {
  if (!sort) return 'created ASC'
  return sort
    .split(',')
    .map((s) => {
      const desc = s.startsWith('-')
      const col = s.replace(/^-/, '')
      if (!/^[a-z_]+$/.test(col)) return 'created ASC'
      return `${col} ${desc ? 'DESC' : 'ASC'}`
    })
    .join(', ')
}

const app = new Hono<{ Variables: { userId: string } }>()

// GET /api/collections/:collection/records
app.get('/:collection/records', async (c) => {
  const collection = c.req.param('collection')
  if (!ALLOWED_COLLECTIONS.has(collection)) return c.json({ message: 'Not found' }, 404)

  const userId = c.get('userId')
  const filter = c.req.query('filter')
  const sort = parseSort(c.req.query('sort'))

  const { where, values } = parseFilter(filter, userId)

  // Build query with parameterized values
  const query = `SELECT * FROM ${collection} WHERE ${where} ORDER BY ${sort}`
  const rows = await sql.unsafe(query, values as never[]) as Row[]

  return c.json({
    page: 1,
    perPage: rows.length,
    totalItems: rows.length,
    totalPages: 1,
    items: rows,
  })
})

// GET /api/collections/:collection/records/:id
app.get('/:collection/records/:id', async (c) => {
  const collection = c.req.param('collection')
  if (!ALLOWED_COLLECTIONS.has(collection)) return c.json({ message: 'Not found' }, 404)

  const userId = c.get('userId')
  const id = c.req.param('id')

  const [row] = await sql.unsafe(
    `SELECT * FROM ${collection} WHERE id = $1 AND owner = $2`,
    [id, userId],
  ) as Row[]

  if (!row) return c.json({ message: 'Not found' }, 404)
  return c.json(row)
})

// POST /api/collections/:collection/records
app.post('/:collection/records', async (c) => {
  const collection = c.req.param('collection')
  if (!ALLOWED_COLLECTIONS.has(collection)) return c.json({ message: 'Not found' }, 404)

  const userId = c.get('userId')
  const raw: Row = await c.req.json().catch(() => ({}))
  const body = filterWritable(collection, raw) as Row

  // Validate transaction-specific rules (#4 amount, #5 FK ownership)
  if (collection === 'transactions') {
    const err = await validateTransaction(body, userId)
    if (err) return c.json({ message: err }, 400)
  }

  // Inject server-controlled fields
  const id = uuid()
  const now = new Date().toISOString()
  const record: Row = { id, owner: userId, ...body, created: now, updated: now }

  // For settings: upsert on owner uniqueness
  if (collection === 'settings') {
    const [existing] = await sql.unsafe(
      `SELECT id FROM settings WHERE owner = $1`,
      [userId],
    ) as Row[]
    if (existing) {
      // Update instead
      const setClause = Object.keys(body)
        .filter((k) => !PROTECTED.has(k))
        .map((k, i) => `${k} = $${i + 2}`)
        .join(', ')
      const setVals = Object.entries(body)
        .filter(([k]) => !PROTECTED.has(k))
        .map(([, v]) => v)
      const [updated] = await sql.unsafe(
        `UPDATE settings SET ${setClause}, updated = NOW() WHERE owner = $1 RETURNING *`,
        [userId, ...setVals] as never[],
      ) as Row[]
      return c.json(updated, 200)
    }
  }

  const cols = Object.keys(record).join(', ')
  const placeholders = Object.keys(record).map((_, i) => `$${i + 1}`).join(', ')
  const vals = Object.values(record)

  const [created] = await sql.unsafe(
    `INSERT INTO ${collection} (${cols}) VALUES (${placeholders}) RETURNING *`,
    vals as never[],
  ) as Row[]

  auditLog(userId, `${collection}.create`, created?.id as string)
  return c.json(created, 201)
})

// PATCH /api/collections/:collection/records/:id
app.patch('/:collection/records/:id', async (c) => {
  const collection = c.req.param('collection')
  if (!ALLOWED_COLLECTIONS.has(collection)) return c.json({ message: 'Not found' }, 404)

  const userId = c.get('userId')
  const id = c.req.param('id')
  const raw: Row = await c.req.json().catch(() => ({}))
  const body = filterWritable(collection, raw) as Row

  if (Object.keys(body).length === 0) return c.json({ message: 'No fields to update' }, 400)

  // Validate transaction-specific rules on update (#4 amount, #5 FK ownership)
  if (collection === 'transactions') {
    const err = await validateTransaction(body, userId)
    if (err) return c.json({ message: err }, 400)
  }

  // Verify ownership
  const [existing] = await sql.unsafe(
    `SELECT id FROM ${collection} WHERE id = $1 AND owner = $2`,
    [id, userId],
  ) as Row[]
  if (!existing) return c.json({ message: 'Not found' }, 404)

  const setClause = Object.keys(body).map((k, i) => `${k} = $${i + 3}`).join(', ')
  const vals = [id, userId, ...Object.values(body)]

  const [updated] = await sql.unsafe(
    `UPDATE ${collection} SET ${setClause}, updated = NOW()
     WHERE id = $1 AND owner = $2 RETURNING *`,
    vals as never[],
  ) as Row[]

  auditLog(userId, `${collection}.update`, id)
  return c.json(updated)
})

// DELETE /api/collections/:collection/records/:id
// (Transactions use soft-delete via PATCH deleted=true, but for other collections we allow hard delete)
app.delete('/:collection/records/:id', async (c) => {
  const collection = c.req.param('collection')
  if (!ALLOWED_COLLECTIONS.has(collection)) return c.json({ message: 'Not found' }, 404)
  if (collection === 'transactions') {
    return c.json({ message: 'Use PATCH to set deleted=true for transactions' }, 400)
  }

  const userId = c.get('userId')
  const id = c.req.param('id')

  const result = await sql.unsafe(
    `DELETE FROM ${collection} WHERE id = $1 AND owner = $2 RETURNING id`,
    [id, userId],
  ) as Row[]

  if (result.length === 0) return c.json({ message: 'Not found' }, 404)
  auditLog(userId, `${collection}.delete`, id)
  return c.json({})
})

export { app as collectionsRoutes }

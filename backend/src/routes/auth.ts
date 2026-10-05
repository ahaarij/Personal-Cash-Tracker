import { Hono } from 'hono'
import { sql } from '../db/client.js'
import { verifyPassword, hashPassword } from '../lib/password.js'
import { signToken, verifyToken } from '../lib/tokens.js'

const COOKIE = 'cf_session'
const COOKIE_OPTS = 'HttpOnly; SameSite=Strict; Path=/; Max-Age=2592000'

function setCookie(c: { header: (k: string, v: string) => void }, token: string) {
  const isSecure = process.env.NODE_ENV === 'production' ? '; Secure' : ''
  c.header('Set-Cookie', `${COOKIE}=${token}${isSecure}; ${COOKIE_OPTS}`)
}

function clearCookie(c: { header: (k: string, v: string) => void }) {
  c.header('Set-Cookie', `${COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`)
}

export const authRoutes = new Hono()

authRoutes.post('/sign-in', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const email = String(body.email ?? '').toLowerCase().trim()
  const password = String(body.password ?? '')

  if (!email || !password) {
    return c.json({ message: 'Email and password required' }, 400)
  }

  const [user] = await sql`
    SELECT id, email, password_hash, verified, created, updated
    FROM users WHERE email = ${email}
  `
  if (!user) {
    sql`INSERT INTO audit_log (user_id, ip, action, result) VALUES (
      NULL, ${c.req.header('CF-Connecting-IP') ?? c.req.header('X-Forwarded-For') ?? ''}, 'sign_in', 'failure'
    )`.catch(() => {})
    return c.json({ message: 'Invalid credentials' }, 401)
  }

  const ok = await verifyPassword(password, user.password_hash)
  if (!ok) {
    sql`INSERT INTO audit_log (user_id, ip, action, result) VALUES (
      ${user.id}, ${c.req.header('CF-Connecting-IP') ?? c.req.header('X-Forwarded-For') ?? ''}, 'sign_in', 'failure'
    )`.catch(() => {})
    return c.json({ message: 'Invalid credentials' }, 401)
  }

  const token = signToken(user.id)
  setCookie(c, token)

  // Log sign-in (best effort)
  sql`INSERT INTO audit_log (user_id, ip, action, result) VALUES (
    ${user.id},
    ${c.req.header('CF-Connecting-IP') ?? c.req.header('X-Forwarded-For') ?? ''},
    'sign_in', 'success'
  )`.catch(() => {})

  return c.json({
    token,
    user: {
      id: user.id,
      email: user.email,
      verified: user.verified,
      mfaEnabled: false,
      created: user.created,
      updated: user.updated,
    },
  })
})

authRoutes.post('/refresh', async (c) => {
  const cookieHeader = c.req.header('Cookie') ?? ''
  const match = cookieHeader.match(/(?:^|;\s*)cf_session=([^;]+)/)
  const token = match?.[1]

  if (!token) return c.json({ message: 'No session' }, 401)

  let payload
  try {
    payload = verifyToken(token)
  } catch {
    clearCookie(c)
    return c.json({ message: 'Session expired' }, 401)
  }

  const [user] = await sql`
    SELECT id, email, verified, created, updated FROM users WHERE id = ${payload.id}
  `
  if (!user) {
    clearCookie(c)
    return c.json({ message: 'Session expired' }, 401)
  }

  const newToken = signToken(user.id)
  setCookie(c, newToken)

  return c.json({
    token: newToken,
    user: {
      id: user.id,
      email: user.email,
      verified: user.verified,
      mfaEnabled: false,
      created: user.created,
      updated: user.updated,
    },
  })
})

authRoutes.post('/sign-out', async (c) => {
  clearCookie(c)
  return c.json({ ok: true })
})

authRoutes.get('/reauth-check', (c) => {
  const cookieHeader = c.req.header('Cookie') ?? ''
  const match = cookieHeader.match(/(?:^|;\s*)cf_session=([^;]+)/)
  const token = match?.[1]
  if (!token) return c.json({ message: 'Not authenticated' }, 401)

  try {
    const payload = verifyToken(token)
    const age = Math.floor(Date.now() / 1000) - payload.iat
    if (age > 300) return c.json({ message: 'Re-authentication required' }, 403)
    return c.json({ ok: true })
  } catch {
    return c.json({ message: 'Invalid session' }, 401)
  }
})

// Admin-only: create a user (for initial setup)
authRoutes.post('/create-user', async (c) => {
  // Only allow when explicitly enabled via env flag (Host header is spoofable)
  if (process.env.ALLOW_CREATE_USER !== '1') {
    return c.json({ message: 'Not found' }, 404)
  }

  const body = await c.req.json().catch(() => ({}))
  const email = String(body.email ?? '').toLowerCase().trim()
  const password = String(body.password ?? '')
  const username = String(body.username ?? email.split('@')[0])

  if (!email || !password || password.length < 8) {
    return c.json({ message: 'Email and password (min 8 chars) required' }, 400)
  }

  const hash = await hashPassword(password)
  const [user] = await sql`
    INSERT INTO users (email, password_hash, username, verified)
    VALUES (${email}, ${hash}, ${username}, true)
    RETURNING id, email, created
  `

  return c.json({ id: user.id, email: user.email, created: user.created }, 201)
})

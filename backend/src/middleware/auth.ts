import type { MiddlewareHandler } from 'hono'
import { verifyToken } from '../lib/tokens.js'

export const requireAuth: MiddlewareHandler = async (c, next) => {
  // Check Authorization header first (Bearer token), then cookie
  const authHeader = c.req.header('Authorization')
  let token: string | undefined

  if (authHeader?.startsWith('Bearer ')) {
    token = authHeader.slice(7)
  } else {
    // Parse cookie manually — Hono's getCookie helper works here too
    const cookieHeader = c.req.header('Cookie') ?? ''
    const match = cookieHeader.match(/(?:^|;\s*)cf_session=([^;]+)/)
    token = match?.[1]
  }

  if (!token) return c.json({ message: 'Unauthorized' }, 401)

  try {
    const payload = verifyToken(token)
    c.set('userId', payload.id)
    c.set('tokenIat', payload.iat)
    return next()
  } catch {
    return c.json({ message: 'Unauthorized' }, 401)
  }
}

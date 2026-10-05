import type { MiddlewareHandler } from 'hono'

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

export const csrf: MiddlewareHandler = async (c, next) => {
  if (SAFE_METHODS.has(c.req.method)) return next()

  const path = new URL(c.req.url).pathname
  // Auth routes, admin UI paths, and JWT-authenticated requests are CSRF-safe
  const hasAuth = c.req.header('Authorization') !== undefined
  if (path.startsWith('/api/auth/') || hasAuth) return next()

  if (c.req.header('X-CF-App-Request') !== '1') {
    return c.json({ message: 'Forbidden' }, 403)
  }

  return next()
}

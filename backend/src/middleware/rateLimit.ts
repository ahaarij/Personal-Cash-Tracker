import type { MiddlewareHandler } from 'hono'

interface Bucket {
  count: number
  resetAt: number
}

const store = new Map<string, Bucket>()
const WINDOW_MS = 15 * 60 * 1000  // 15 minutes
const MAX_ATTEMPTS = 10

// Periodically clean up expired buckets
setInterval(() => {
  const now = Date.now()
  for (const [key, bucket] of store) {
    if (now > bucket.resetAt) store.delete(key)
  }
}, 5 * 60 * 1000)

export function rateLimitAuth(): MiddlewareHandler {
  return async (c, next) => {
    const ip =
      c.req.header('CF-Connecting-IP') ??
      c.req.header('X-Forwarded-For')?.split(',')[0].trim() ??
      'unknown'

    const now = Date.now()
    let bucket = store.get(ip)

    if (!bucket || now > bucket.resetAt) {
      bucket = { count: 0, resetAt: now + WINDOW_MS }
      store.set(ip, bucket)
    }

    if (bucket.count >= MAX_ATTEMPTS) {
      const retryAfter = Math.ceil((bucket.resetAt - now) / 1000)
      c.header('Retry-After', String(retryAfter))
      return c.json({ message: 'Too many attempts. Try again later.' }, 429)
    }

    bucket.count++
    return next()
  }
}

export function resetRateLimit(ip: string) {
  store.delete(ip)
}

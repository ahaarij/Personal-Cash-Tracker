import { Hono } from 'hono'

const app = new Hono()

interface ErApiResponse {
  result: string
  base_code: string
  rates: Record<string, number>
}

let cache: { rates: Record<string, number>; fetchedAt: number } | null = null
const CACHE_TTL = 6 * 60 * 60 * 1000 // 6 hours

export const fxRoutes = app.get('/', async (c) => {
  const now = Date.now()

  if (!cache || now - cache.fetchedAt > CACHE_TTL) {
    try {
      const res = await fetch('https://open.er-api.com/v6/latest/AED')
      if (!res.ok) throw new Error('upstream error')
      const data = await res.json() as ErApiResponse
      if (data.result !== 'success') throw new Error('bad response')
      cache = { rates: data.rates, fetchedAt: now }
    } catch {
      if (cache) {
        // Return stale rather than hard-fail
        return c.json({ base: 'AED', rates: cache.rates, stale: true })
      }
      return c.json({ error: 'Could not fetch exchange rates' }, 502)
    }
  }

  return c.json({
    base: 'AED',
    rates: cache.rates,
    fetchedAt: new Date(cache.fetchedAt).toISOString(),
  })
})

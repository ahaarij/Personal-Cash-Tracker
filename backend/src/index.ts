import 'dotenv/config'
import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { migrate } from './db/migrate.js'
import { csrf } from './middleware/csrf.js'
import { requireAuth } from './middleware/auth.js'
import { rateLimitAuth } from './middleware/rateLimit.js'
import { securityHeaders } from './middleware/securityHeaders.js'
import { authRoutes } from './routes/auth.js'
import { collectionsRoutes } from './routes/collections.js'

const app = new Hono<{ Variables: { userId: string; tokenIat: number } }>()

// CORS — origins from env, fallback to localhost for dev
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map((o) => o.trim())
  : ['http://localhost:5173', 'http://localhost:3000']

app.use('*', cors({
  origin: allowedOrigins,
  credentials: true,
  allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization', 'X-CF-App-Request'],
}))

app.use('*', csrf)
app.use('*', securityHeaders)

// Rate-limit sign-in attempts
app.use('/api/auth/sign-in', rateLimitAuth())

// Auth routes (no requireAuth middleware)
app.route('/api/auth', authRoutes)

// Data routes (require valid JWT or session cookie)
app.use('/api/collections/*', requireAuth)
app.route('/api/collections', collectionsRoutes)

app.get('/api/health', (c) => c.json({ ok: true }))

// Startup
const port = parseInt(process.env.PORT ?? '3000', 10)

await migrate()
console.log(`[server] listening on http://localhost:${port}`)
serve({ fetch: app.fetch, port })

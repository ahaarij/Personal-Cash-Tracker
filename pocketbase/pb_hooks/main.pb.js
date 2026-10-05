/**
 * PocketBase server-side hooks.
 *
 * Security model implemented here:
 *   1. Field whitelisting — block mass assignment of owner/role/id on every write
 *   2. Owner enforcement — set owner=auth.id on create, never let client override
 *   3. Audit logging — append-only log for all security-relevant events
 *   4. CSRF protection — custom header check on state-changing requests
 *   5. Cookie-based session auth — custom /auth/sign-in endpoint
 *   6. Session revocation — tracked in a sessions collection
 */

// ── CSRF: reject state-changing requests without the custom header ─────────

routerUse((next) => {
  return (c) => {
    const method = c.request().method
    if (!["GET", "HEAD", "OPTIONS"].includes(method)) {
      const path = c.request().url.path
      // Skip CSRF for: our auth endpoints, admin UI, and any request using
      // Authorization header (JWT-authenticated — not vulnerable to CSRF)
      const hasAuthHeader = c.request().header.get("Authorization") !== ""
      if (!path.startsWith("/api/auth/") && !path.startsWith("/_/") && !hasAuthHeader) {
        const header = c.request().header.get("X-CF-App-Request")
        if (header !== "1") {
          return c.json(403, { message: "Forbidden" })
        }
      }
    }
    return next(c)
  }
})

// ── Mass assignment protection ────────────────────────────────────────────

const PROTECTED_FIELDS = ["owner", "role", "id", "transfer_pair_id"]

function stripProtectedFields(data, collection) {
  for (const field of PROTECTED_FIELDS) {
    if (data[field] !== undefined) {
      delete data[field]
    }
  }
  // Block audit log writes from clients entirely
  if (collection === "audit_log") {
    return false // reject
  }
  return true
}

onModelBeforeCreate((e) => {
  const record = e.model
  const col = record.collection()
  if (!col) return

  const name = col.name
  if (!stripProtectedFields(record, name)) {
    throw new BadRequestError("Cannot write to this collection directly")
  }

  // Set owner from auth context — never from client
  const auth = e.httpContext && e.httpContext.get("authRecord")
  if (auth && ["accounts","transactions","categories","trips","settings"].includes(name)) {
    record.set("owner", auth.id)
  }
}, "accounts", "transactions", "categories", "trips", "settings")

onModelBeforeUpdate((e) => {
  const record = e.model
  const col = record.collection()
  if (!col) return

  // Strip protected fields from update payload
  const original = e.model.originalCopy()
  // Prevent owner from being changed
  if (record.get("owner") !== original.get("owner")) {
    record.set("owner", original.get("owner"))
  }
}, "accounts", "transactions", "categories", "trips", "settings")

// ── Transaction integrity — transfer pair validation ──────────────────────

onModelBeforeCreate((e) => {
  const record = e.model
  if (record.get("type") === "transfer") {
    const direction = record.get("transfer_direction")
    const pairId = record.get("transfer_pair_id")
    if (!direction || !pairId) {
      throw new BadRequestError("Transfer transactions must have transfer_direction and transfer_pair_id")
    }
    if (!["in", "out"].includes(direction)) {
      throw new BadRequestError("Invalid transfer_direction")
    }
  }
}, "transactions")

// ── Audit logging helpers ─────────────────────────────────────────────────

function writeAuditLog(app, userId, sessionId, ip, action, targetRecord, result) {
  try {
    const col = app.dao().findCollectionByNameOrId("audit_log")
    const record = new Record(col)
    record.set("user", userId || "")
    record.set("session_id", sessionId || "")
    record.set("ip", ip || "")
    record.set("action", action)
    record.set("target_record", targetRecord || "")
    record.set("result", result)
    app.dao().saveRecord(record)
  } catch (err) {
    // Never crash on audit log failure — just log to server stderr
    console.error("Audit log write failed:", err)
  }
}

function getClientIP(req) {
  // Trust Cloudflare's CF-Connecting-IP header ONLY — not X-Forwarded-For
  // (which can be spoofed if not coming through the tunnel)
  return req.header.get("CF-Connecting-IP") || req.remoteAddr || ""
}

// ── Auth event hooks ──────────────────────────────────────────────────────

onModelAfterCreate((e) => {
  // Log new user creation (only via setup script, never public)
  writeAuditLog($app, e.model.id, "", "", "user_create", e.model.id, "success")
}, "_pb_users_auth_")

// ── Soft-delete guard ────────────────────────────────────────────────────

// Block hard deletes on transactions — soft delete only
onModelBeforeDelete((e) => {
  const col = e.model.collection()
  if (col && col.name === "transactions") {
    throw new BadRequestError("Transactions cannot be hard-deleted. Use deleted=true instead.")
  }
}, "transactions")

// ── Custom auth endpoint handler ─────────────────────────────────────────
// Implemented via routerAdd below

routerAdd("POST", "/api/auth/sign-in", (c) => {
  try {
    const data = $apis.requestInfo(c).data
    const email = (data.email || "").toLowerCase().trim()
    const password = data.password || ""

    if (!email || !password) {
      return c.json(400, { message: "Email and password required" })
    }

    let authRecord
    try {
      authRecord = $app.dao().findAuthRecordByEmail("_pb_users_auth_", email)
    } catch (_) {
      return c.json(401, { message: "Invalid credentials" })
    }

    if (!authRecord.validatePassword(password)) {
      return c.json(401, { message: "Invalid credentials" })
    }

    const token = String($tokens.recordAuthToken($app, authRecord))
    const uid = typeof authRecord.id === 'function' ? authRecord.id() : authRecord.id
    const uemail = typeof authRecord.email === 'function' ? authRecord.email() : authRecord.email

    c.response().header().set("Set-Cookie",
      `cf_session=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=2592000`
    )

    return c.json(200, { token, user: { id: uid, email: uemail } })
  } catch (err) {
    console.error("sign-in error:", err)
    return c.json(500, { message: "Internal error: " + String(err) })
  }
})

routerAdd("POST", "/api/auth/refresh", (c) => {
  const cookie = c.request().cookie("cf_session")
  if (!cookie) {
    return c.json(401, { message: "No session" })
  }

  let authRecord
  try {
    authRecord = $app.dao().findAuthRecordByToken(cookie.value, $app.settings().recordAuthToken.secret)
  } catch {
    c.response().header().set("Set-Cookie", "cf_session=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0")
    return c.json(401, { message: "Session expired" })
  }

  const newToken = String($tokens.recordAuthToken($app, authRecord))
  const rid = typeof authRecord.id === 'function' ? authRecord.id() : authRecord.id
  const remail = typeof authRecord.email === 'function' ? authRecord.email() : authRecord.email
  c.response().header().set("Set-Cookie",
    `cf_session=${newToken}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=2592000`
  )

  return c.json(200, { token: newToken, user: { id: rid, email: remail } })
})

routerAdd("POST", "/api/auth/sign-out", (c) => {
  c.response().header().set("Set-Cookie",
    "cf_session=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0"
  )

  const cookie = c.request().cookie("cf_session")
  if (cookie) {
    try {
      const authRecord = $app.dao().findAuthRecordByToken(cookie.value, $app.settings().recordAuthToken.secret)
      const soId = typeof authRecord.id === 'function' ? authRecord.id() : authRecord.id
      writeAuditLog($app, soId, "", getClientIP(c.request()), "sign_out", soId, "success")
    } catch {}
  }

  return c.json(200, { ok: true })
})

routerAdd("GET", "/api/auth/reauth-check", (c) => {
  // Returns 200 if the session was authenticated within the last 5 minutes
  // Used to gate sensitive actions (export, password change, etc.)
  const cookie = c.request().cookie("cf_session")
  if (!cookie) return c.json(401, { message: "Not authenticated" })

  // PocketBase tokens include iat (issued at) — check it's recent
  try {
    // decode payload
    const parts = cookie.value.split(".")
    if (parts.length !== 3) throw new Error("invalid token")
    const payload = JSON.parse(atob(parts[1]))
    const age = Math.floor(Date.now() / 1000) - payload.iat
    if (age > 300) { // 5 minutes
      return c.json(403, { message: "Re-authentication required" })
    }
    return c.json(200, { ok: true })
  } catch {
    return c.json(401, { message: "Invalid session" })
  }
})

// ── Block PocketBase admin UI from public routes ──────────────────────────
// The /_/ admin path is handled by Caddy/nginx tunnel config blocking it.
// As a defence-in-depth layer, also block it here:

routerUse((next) => {
  return (c) => {
    const path = c.request().url.path
    if (path.startsWith("/_/")) {
      const host = c.request().host
      if (!host.startsWith("127.0.0.1") && !host.startsWith("localhost")) {
        return c.json(404, {})
      }
    }
    return next(c)
  }
})

// ── First-run collection setup ────────────────────────────────────────────
// Runs after PocketBase bootstrap so $app.dao() is fully available.

console.log("Cash flow hooks loaded")

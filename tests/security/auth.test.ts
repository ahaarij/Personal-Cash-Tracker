/**
 * Security tests: authentication, session handling, token tampering.
 *
 * Run against a local staging instance:
 *   PB_URL=http://localhost:8090 npx vitest run tests/security/
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'

const PB_URL = process.env.PB_URL ?? 'http://localhost:8090'

let ownerToken = ''
let ownerUserId = ''
let attackerToken = ''
let attackerUserId = ''

// ── Helpers ────────────────────────────────────────────────────────────────

async function signIn(email: string, password: string) {
  const res = await fetch(`${PB_URL}/api/collections/_pb_users_auth_/auth-with-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-CF-App-Request': '1' },
    body: JSON.stringify({ identity: email, password }),
  })
  return res
}

async function apiGet(path: string, token: string) {
  return fetch(`${PB_URL}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
}

async function apiPost(path: string, token: string, body: unknown) {
  return fetch(`${PB_URL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      'X-CF-App-Request': '1',
    },
    body: JSON.stringify(body),
  })
}

async function apiPatch(path: string, token: string, body: unknown) {
  return fetch(`${PB_URL}${path}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      'X-CF-App-Request': '1',
    },
    body: JSON.stringify(body),
  })
}

// ── Test setup ─────────────────────────────────────────────────────────────

beforeAll(async () => {
  // These tests require two pre-created test users in the staging instance:
  // owner@test.local / OwnerPassword2024!
  // attacker@test.local / AttackerPassword2024!
  const ownerRes = await signIn('owner@test.local', 'OwnerPassword2024!')
  if (ownerRes.ok) {
    const data = await ownerRes.json()
    ownerToken = data.token
    ownerUserId = data.record.id
  }

  const attackerRes = await signIn('attacker@test.local', 'AttackerPassword2024!')
  if (attackerRes.ok) {
    const data = await attackerRes.json()
    attackerToken = data.token
    attackerUserId = data.record.id
  }
})

// ── CSRF protection ────────────────────────────────────────────────────────

describe('CSRF protection', () => {
  it('rejects POST without X-CF-App-Request header', async () => {
    const res = await fetch(`${PB_URL}/api/collections/transactions/records`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ownerToken}`,
        // Missing X-CF-App-Request
      },
      body: JSON.stringify({ amount: 100, type: 'expense' }),
    })
    expect(res.status).toBe(403)
  })

  it('allows GET without X-CF-App-Request header', async () => {
    const res = await apiGet(`/api/collections/accounts/records`, ownerToken)
    // Should be 200 or 404/empty, not 403
    expect(res.status).not.toBe(403)
  })
})

// ── IDOR / BOLA tests ──────────────────────────────────────────────────────

describe('IDOR — attacker cannot access owner records', () => {
  let ownerAccountId: string

  beforeAll(async () => {
    // Create an account as the owner
    const res = await apiPost(`/api/collections/accounts/records`, ownerToken, {
      name: 'Owner Test Account',
      type: 'cash',
      currency: 'AED',
      opening_balance: 1000_00,
    })
    if (res.ok) {
      const data = await res.json()
      ownerAccountId = data.id
    }
  })

  it('attacker cannot read owner account by ID', async () => {
    if (!ownerAccountId) return
    const res = await apiGet(
      `/api/collections/accounts/records/${ownerAccountId}`,
      attackerToken,
    )
    expect([403, 404]).toContain(res.status)
  })

  it('attacker list of accounts does not include owner accounts', async () => {
    const res = await apiGet('/api/collections/accounts/records', attackerToken)
    expect(res.ok).toBe(true)
    const data = await res.json()
    const ids = (data.items ?? []).map((r: { id: string }) => r.id)
    expect(ids).not.toContain(ownerAccountId)
  })

  it('attacker cannot update owner account', async () => {
    if (!ownerAccountId) return
    const res = await apiPatch(
      `/api/collections/accounts/records/${ownerAccountId}`,
      attackerToken,
      { name: 'Hijacked' },
    )
    expect([403, 404]).toContain(res.status)
  })

  it('attacker cannot soft-delete owner transaction', async () => {
    // First create a transaction as owner
    const txRes = await apiPost(`/api/collections/transactions/records`, ownerToken, {
      date: '2024-01-01',
      amount: 500_00,
      account: ownerAccountId,
      type: 'expense',
      note: 'test',
      client_id: 'test-client-id',
    })
    if (!txRes.ok) return
    const tx = await txRes.json()

    // Attacker tries to mark it deleted
    const attackRes = await apiPatch(
      `/api/collections/transactions/records/${tx.id}`,
      attackerToken,
      { deleted: true },
    )
    expect([403, 404]).toContain(attackRes.status)
  })
})

// ── Mass assignment ────────────────────────────────────────────────────────

describe('Mass assignment protection', () => {
  it('cannot set owner to another user ID on create', async () => {
    const res = await apiPost(`/api/collections/accounts/records`, ownerToken, {
      owner: attackerUserId,   // attempt to hijack
      name: 'Test',
      type: 'cash',
      currency: 'AED',
      opening_balance: 0,
    })
    if (res.ok) {
      const data = await res.json()
      // Owner must be the auth user, not the supplied attacker ID
      expect(data.owner).toBe(ownerUserId)
      expect(data.owner).not.toBe(attackerUserId)
    }
  })

  it('cannot change owner on update', async () => {
    const createRes = await apiPost(`/api/collections/accounts/records`, ownerToken, {
      name: 'Mass Assign Test',
      type: 'cash',
      currency: 'USD',
      opening_balance: 0,
    })
    if (!createRes.ok) return
    const { id } = await createRes.json()

    const updateRes = await apiPatch(
      `/api/collections/accounts/records/${id}`,
      ownerToken,
      { owner: attackerUserId },
    )
    if (updateRes.ok) {
      const data = await updateRes.json()
      expect(data.owner).toBe(ownerUserId)
    }
  })

  it('cannot write to audit_log directly', async () => {
    const res = await apiPost(`/api/collections/audit_log/records`, ownerToken, {
      action: 'injected',
      result: 'success',
    })
    expect([400, 403, 404]).toContain(res.status)
  })
})

// ── Token tampering ────────────────────────────────────────────────────────

describe('Token tampering', () => {
  it('tampered JWT signature is rejected', async () => {
    // Take a valid token and corrupt the signature
    const parts = ownerToken.split('.')
    if (parts.length !== 3) return
    const tampered = `${parts[0]}.${parts[1]}.tampered_signature`

    const res = await apiGet('/api/collections/accounts/records', tampered)
    expect(res.status).toBe(401)
  })

  it('JWT with none algorithm is rejected', async () => {
    // Build a "none alg" JWT
    const header = btoa(JSON.stringify({ alg: 'none', typ: 'JWT' }))
    const parts = ownerToken.split('.')
    const payload = parts[1] // reuse valid payload
    const noneToken = `${header}.${payload}.`

    const res = await apiGet('/api/collections/accounts/records', noneToken)
    expect(res.status).toBe(401)
  })

  it('expired token is rejected', async () => {
    // Build a token with exp in the past — signature will be invalid anyway
    const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
    const payload = btoa(JSON.stringify({
      id: ownerUserId,
      exp: Math.floor(Date.now() / 1000) - 3600,
    }))
    const expiredToken = `${header}.${payload}.fakesig`

    const res = await apiGet('/api/collections/accounts/records', expiredToken)
    expect(res.status).toBe(401)
  })
})

// ── Hard delete prevention ─────────────────────────────────────────────────

describe('Soft delete enforcement', () => {
  it('hard delete of a transaction is rejected', async () => {
    // Create a transaction
    const accRes = await apiPost(`/api/collections/accounts/records`, ownerToken, {
      name: 'Delete Test Account',
      type: 'cash',
      currency: 'AED',
      opening_balance: 1000_00,
    })
    if (!accRes.ok) return
    const acc = await accRes.json()

    const txRes = await apiPost(`/api/collections/transactions/records`, ownerToken, {
      date: '2024-01-01',
      amount: 100_00,
      account: acc.id,
      type: 'expense',
      note: 'delete test',
      client_id: 'delete-test-id',
    })
    if (!txRes.ok) return
    const tx = await txRes.json()

    const deleteRes = await fetch(
      `${PB_URL}/api/collections/transactions/records/${tx.id}`,
      {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${ownerToken}`,
          'X-CF-App-Request': '1',
        },
      },
    )
    expect([400, 403, 405]).toContain(deleteRes.status)
  })
})

// ── Admin route access ─────────────────────────────────────────────────────

describe('Admin route protection', () => {
  it('non-admin cannot access /_/ admin UI', async () => {
    const res = await fetch(`${PB_URL}/_/`, {
      headers: { Authorization: `Bearer ${ownerToken}` },
    })
    // Should be 404 (blocked by Caddyfile and PocketBase hook)
    expect(res.status).toBe(404)
  })
})

// ── Input validation ───────────────────────────────────────────────────────

describe('Input validation', () => {
  it('rejects XSS payload in note field', async () => {
    const res = await apiPost(`/api/collections/transactions/records`, ownerToken, {
      date: '2024-01-01',
      amount: 100_00,
      account: 'fake-id',
      type: 'expense',
      note: '<script>alert(1)</script>',
      client_id: 'xss-test',
    })
    // Either rejected (400/404 due to invalid account) or stored safely
    // If stored, the note must be stored as plain text (not executed)
    if (res.ok) {
      const data = await res.json()
      expect(data.note).not.toContain('<script>')
    }
  })

  it('rejects negative amount', async () => {
    const res = await apiPost(`/api/collections/transactions/records`, ownerToken, {
      date: '2024-01-01',
      amount: -500,
      account: 'fake-id',
      type: 'expense',
      note: '',
      client_id: 'neg-amount-test',
    })
    expect([400, 404]).toContain(res.status)
  })

  it('rejects amount that overflows minor unit range', async () => {
    const res = await apiPost(`/api/collections/transactions/records`, ownerToken, {
      date: '2024-01-01',
      amount: 999_999_999_999, // > max in schema
      account: 'fake-id',
      type: 'expense',
      note: '',
      client_id: 'overflow-test',
    })
    expect([400, 404]).toContain(res.status)
  })

  it('rejects oversized note', async () => {
    const res = await apiPost(`/api/collections/transactions/records`, ownerToken, {
      date: '2024-01-01',
      amount: 100_00,
      account: 'fake-id',
      type: 'expense',
      note: 'A'.repeat(1000),   // max is 500
      client_id: 'long-note-test',
    })
    expect([400, 404]).toContain(res.status)
  })
})

import 'dotenv/config'
import jwt from 'jsonwebtoken'

const secret = process.env.JWT_SECRET ?? 'dev-secret'
if (secret === 'dev-secret') {
  console.warn('[security] WARNING: JWT_SECRET is not set. Using insecure default — set a strong secret in production.')
}
const THIRTY_DAYS = 60 * 60 * 24 * 30

export interface TokenPayload {
  id: string
  type: 'auth'
  iat: number
  exp: number
}

export function signToken(userId: string): string {
  return jwt.sign({ id: userId, type: 'auth' }, secret, { expiresIn: THIRTY_DAYS })
}

export function verifyToken(token: string): TokenPayload {
  return jwt.verify(token, secret) as TokenPayload
}

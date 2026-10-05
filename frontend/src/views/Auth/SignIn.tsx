import { useState } from 'react'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { signIn } from '@/lib/api'

interface SignInProps {
  onSuccess: () => void
}

export function SignIn({ onSuccess }: SignInProps) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (!email.trim() || !password) {
      setError('Enter your email and password.')
      return
    }

    setLoading(true)
    try {
      await signIn(email.trim(), password)
      onSuccess()
    } catch {
      // Generic error — don't reveal whether email exists
      setError('Sign in failed. Check your credentials and try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="sign-in">
      <div className="sign-in__card">
        <h1 className="sign-in__title">Personal Cash Flow</h1>
        <p className="sign-in__subtitle">Sign in to continue</p>

        <form className="sign-in__form" onSubmit={handleSubmit} noValidate>
          {error && (
            <div className="sign-in__error" role="alert">
              {error}
            </div>
          )}

          <Input
            label="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            autoFocus
            inputMode="email"
          />

          <Input
            label="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />

          <Button
            type="submit"
            variant="primary"
            size="lg"
            loading={loading}
            className="sign-in__submit"
          >
            Sign in
          </Button>
        </form>

      </div>
    </div>
  )
}

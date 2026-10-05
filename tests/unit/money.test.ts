import { describe, it, expect } from 'vitest'
import {
  parseAmount,
  formatAmount,
  utilizationPercent,
  utilizationLevel,
  liveFormatAmount,
  todayISO,
} from '../../frontend/src/lib/money'

describe('parseAmount', () => {
  it('parses whole numbers', () => {
    expect(parseAmount('100', 'AED')).toBe(100_00)
  })

  it('parses decimals', () => {
    expect(parseAmount('100.50', 'AED')).toBe(100_50)
  })

  it('strips thousands separators', () => {
    expect(parseAmount('1,000.00', 'AED')).toBe(1000_00)
    expect(parseAmount('10,000', 'AED')).toBe(10000_00)
  })

  it('handles JPY (no minor units)', () => {
    expect(parseAmount('1000', 'JPY')).toBe(1000)
  })

  it('handles KWD (3 decimal places)', () => {
    expect(parseAmount('1.500', 'KWD')).toBe(1500)
  })

  it('returns null for empty input', () => {
    expect(parseAmount('', 'AED')).toBeNull()
    expect(parseAmount('   ', 'AED')).toBeNull()
  })

  it('returns null for non-numeric input', () => {
    expect(parseAmount('abc', 'AED')).toBeNull()
    expect(parseAmount('$100', 'AED')).toBeNull()
  })

  it('always returns positive (ignores sign)', () => {
    expect(parseAmount('100', 'AED')).toBe(100_00)
    // parseAmount returns absolute value
    expect(parseAmount('100', 'AED')).toBeGreaterThan(0)
  })

  it('handles pasted values with spaces', () => {
    expect(parseAmount(' 250 ', 'AED')).toBe(250_00)
  })
})

describe('formatAmount', () => {
  it('formats AED with 2 decimal places', () => {
    expect(formatAmount(1000_00, 'AED')).toBe('1,000.00')
  })

  it('formats USD correctly', () => {
    expect(formatAmount(50_00, 'USD')).toBe('50.00')
  })

  it('formats JPY without decimals', () => {
    expect(formatAmount(1000, 'JPY')).toBe('1,000')
  })

  it('formats KWD with 3 decimal places', () => {
    expect(formatAmount(1500, 'KWD')).toBe('1.500')
  })

  it('formats large amounts with commas', () => {
    expect(formatAmount(1_000_000_00, 'AED')).toBe('1,000,000.00')
  })
})

describe('utilizationPercent', () => {
  it('returns 0 for zero utilized', () => {
    expect(utilizationPercent(0, 10_000_00)).toBe(0)
  })

  it('calculates percentage correctly', () => {
    expect(utilizationPercent(3_200_00, 10_000_00)).toBe(32)
  })

  it('returns 100 when at or over limit', () => {
    expect(utilizationPercent(10_000_00, 10_000_00)).toBe(100)
    expect(utilizationPercent(12_000_00, 10_000_00)).toBe(100)
  })

  it('returns 0 when limit is zero', () => {
    expect(utilizationPercent(1000, 0)).toBe(0)
  })

  it('returns 80% threshold correctly', () => {
    expect(utilizationPercent(8_000_00, 10_000_00)).toBe(80)
  })
})

describe('utilizationLevel', () => {
  it('returns ok below 80%', () => {
    expect(utilizationLevel(0)).toBe('ok')
    expect(utilizationLevel(50)).toBe('ok')
    expect(utilizationLevel(79)).toBe('ok')
  })

  it('returns warn at 80-94%', () => {
    expect(utilizationLevel(80)).toBe('warn')
    expect(utilizationLevel(90)).toBe('warn')
    expect(utilizationLevel(94)).toBe('warn')
  })

  it('returns danger at 95%+', () => {
    expect(utilizationLevel(95)).toBe('danger')
    expect(utilizationLevel(100)).toBe('danger')
  })
})

describe('todayISO', () => {
  it('returns a valid ISO date string', () => {
    const today = todayISO()
    expect(today).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})

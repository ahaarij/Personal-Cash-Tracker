/**
 * Money formatting utilities.
 * All amounts are stored as integer minor units (fils, cents, pence, paise).
 */

/** Minor unit divisors per currency */
const MINOR_UNITS: Record<string, number> = {
  AED: 100, // fils
  USD: 100, // cents
  GBP: 100, // pence
  INR: 100, // paise
  EUR: 100,
  JPY: 1,   // no minor unit
  KWD: 1000,
  BHD: 1000,
  OMR: 1000,
}

export function getMinorUnitDivisor(currency: string): number {
  return MINOR_UNITS[currency] ?? 100
}

/**
 * Converts minor units to a decimal number for display only.
 * Never use this result in calculations.
 */
export function minorToDecimal(amount: number, currency: string): number {
  return amount / getMinorUnitDivisor(currency)
}

/**
 * Parses a user-entered string to integer minor units.
 * Returns null if the input is invalid.
 */
export function parseAmount(input: string, currency: string): number | null {
  // Remove thousands separators and trim whitespace
  const cleaned = input.replace(/[,\s]/g, '').trim()
  if (!cleaned || cleaned === '-') return null

  const num = parseFloat(cleaned)
  if (!Number.isFinite(num)) return null

  const divisor = getMinorUnitDivisor(currency)
  const minor = Math.round(Math.abs(num) * divisor)
  return minor
}

/**
 * Formats an amount in minor units for display.
 * Uses tabular-numeral-ready output with consistent decimal places.
 *
 * @example formatAmount(320050, 'AED') → '3,200.50'
 */
export function formatAmount(amount: number, currency: string): string {
  const divisor = getMinorUnitDivisor(currency)
  const decimal = amount / divisor

  const fractionDigits = divisor === 1 ? 0 : divisor === 1000 ? 3 : 2

  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(decimal)
}

/**
 * Formats with currency code as a suffix label.
 * @example formatWithCurrency(320050, 'AED') → '3,200.50 AED'
 */
export function formatWithCurrency(amount: number, currency: string): string {
  return `${formatAmount(amount, currency)} ${currency}`
}

/**
 * Formats an amount for screen readers, e.g. "three thousand two hundred AED".
 */
export function formatAmountAccessible(amount: number, currency: string): string {
  const divisor = getMinorUnitDivisor(currency)
  const fractionDigits = divisor === 1 ? 0 : divisor === 1000 ? 3 : 2
  return new Intl.NumberFormat('en', {
    style: 'currency',
    currency,
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(amount / divisor)
}

/**
 * Live-formats an amount string as the user types.
 * Returns the formatted string and cursor position adjustment.
 */
export function liveFormatAmount(
  raw: string,
  currency: string,
): { formatted: string; selectionOffset: number } {
  const divisor = getMinorUnitDivisor(currency)
  const fractionDigits = divisor === 1 ? 0 : divisor === 1000 ? 3 : 2

  // Strip everything except digits and one decimal point
  const digits = raw.replace(/[^0-9.]/g, '')
  const parts = digits.split('.')
  const intPart = parts[0] ?? ''
  const fracPart = fractionDigits > 0 ? (parts[1] ?? '').slice(0, fractionDigits) : ''

  // Format integer part with commas
  const formattedInt = intPart
    ? Number(intPart).toLocaleString('en-US')
    : ''

  const formatted =
    fractionDigits > 0 && (fracPart !== '' || digits.includes('.'))
      ? `${formattedInt}.${fracPart}`
      : formattedInt

  // Estimate cursor offset after formatting (commas added/removed)
  const originalCommas = (raw.match(/,/g) ?? []).length
  const newCommas = (formatted.match(/,/g) ?? []).length
  const selectionOffset = newCommas - originalCommas

  return { formatted, selectionOffset }
}

/**
 * Returns the ISO date string for today.
 */
export function todayISO(): string {
  return new Date().toISOString().split('T')[0]
}

/**
 * Formats an ISO date string using the locale date format.
 */
export function formatDate(
  isoDate: string,
  format: string = 'dd MMM yyyy',
): string {
  const date = new Date(isoDate + 'T00:00:00')
  const d = date.getDate().toString().padStart(2, '0')
  const m = date.toLocaleString('en', { month: 'short' })
  const y = date.getFullYear()
  return format
    .replace('dd', d)
    .replace('MMM', m)
    .replace('yyyy', y.toString())
}

/**
 * Calculates utilization percentage for a credit card.
 * Returns 0–100.
 */
export function utilizationPercent(utilized: number, limit: number): number {
  if (limit <= 0) return 0
  return Math.min(100, Math.round((utilized / limit) * 100))
}

/**
 * Returns 'ok' | 'warn' | 'danger' based on credit utilization.
 */
export function utilizationLevel(percent: number): 'ok' | 'warn' | 'danger' {
  if (percent >= 95) return 'danger'
  if (percent >= 80) return 'warn'
  return 'ok'
}

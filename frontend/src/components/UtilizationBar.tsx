interface UtilizationBarProps {
  percent: number
  level: 'ok' | 'warn' | 'danger'
  hideBalances: boolean
}

export function UtilizationBar({ percent, level, hideBalances }: UtilizationBarProps) {
  const display = hideBalances ? 0 : percent

  return (
    <div
      className="util-bar"
      role="progressbar"
      aria-valuenow={hideBalances ? undefined : percent}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={`Credit utilization: ${percent}%`}
      aria-hidden={hideBalances}
    >
      <div
        className={`util-bar__fill util-bar__fill--${level}`}
        style={{ width: `${display}%` }}
      />
    </div>
  )
}

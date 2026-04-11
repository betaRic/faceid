/**
 * ActionButton — base-styled button with busy/loading state.
 *
 * Callers only pass variant-specific overrides (bg, text, border colors).
 * Base layout (flex, padding, rounded, font, transition) is always applied.
 */
export default function ActionButton({
  busy,
  busyLabel,
  className = '',
  label,
  onClick,
  disabled,
}) {
  return (
    <button
      className={[
        'inline-flex items-center justify-center gap-2',
        'rounded-full px-4 py-2',
        'text-sm font-semibold',
        'transition-all duration-150',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className,
      ].join(' ')}
      disabled={disabled || busy}
      onClick={onClick}
      type="button"
    >
      {busy ? (
        <>
          <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
          {busyLabel}
        </>
      ) : label}
    </button>
  )
}

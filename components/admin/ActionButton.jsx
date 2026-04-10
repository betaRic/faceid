export default function ActionButton({ busy, busyLabel, className, label, onClick, disabled }) {
  return (
    <button
      className={className}
      disabled={disabled || busy}
      onClick={onClick}
      type="button"
    >
      {busy ? busyLabel : label}
    </button>
  )
}
export default function LoadingPanel({ title, body }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="h-10 w-10 animate-spin rounded-full border-4 border-navy/30 border-t-brand" />
      <h3 className="mt-4 text-lg font-semibold text-ink">{title}</h3>
      <p className="mt-2 text-sm text-muted">{body}</p>
    </div>
  )
}


import DilgLoadingIndicator from '@/components/shared/DilgLoadingIndicator'

export default function LoadingPanel({ title, body }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <DilgLoadingIndicator label="" />
      <h3 className="mt-1 text-lg font-semibold text-ink">{title}</h3>
      <p className="mt-2 text-sm text-muted">{body}</p>
    </div>
  )
}


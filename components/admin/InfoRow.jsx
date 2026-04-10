export default function InfoRow({ label, value }) {
  return (
    <div className="flex justify-between border-b border-black/5 py-2 text-sm">
      <span className="text-muted">{label}</span>
      <span className="font-medium text-ink">{value}</span>
    </div>
  )
}
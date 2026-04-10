export default function MetricCard({ label, value, subtle = false }) {
  return (
    <div className={`rounded-2xl border p-4 ${subtle ? 'border-black/5 bg-stone-50' : 'border-black/5 bg-white'}`}>
      <div className="text-3xl font-bold text-ink">{value}</div>
      <div className="mt-1 text-xs font-semibold uppercase tracking-[0.12em] text-muted">{label}</div>
    </div>
  )
}

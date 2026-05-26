interface MetricCardProps {
  title: string
  value: string | number
  unit?: string
  trend?: number
  description?: string
}

export default function MetricCard({ title, value, unit, trend, description }: MetricCardProps) {
  const trendPositive = trend !== undefined && trend >= 0

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-5">
      <p className="mb-1 text-xs font-medium uppercase tracking-wider text-slate-400">{title}</p>
      <div className="flex items-baseline gap-1">
        <span className="text-3xl font-bold text-white">{value}</span>
        {unit && <span className="text-sm text-slate-400">{unit}</span>}
      </div>
      {trend !== undefined && (
        <p
          className="mt-1 text-xs font-medium"
          style={{ color: trendPositive ? 'var(--color-teal)' : 'var(--color-orange)' }}
        >
          {trendPositive ? '▲' : '▼'} {Math.abs(trend)}%
        </p>
      )}
      {description && <p className="mt-2 text-xs text-slate-500">{description}</p>}
    </div>
  )
}

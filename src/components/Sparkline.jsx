/**
 * Sparkline — a tiny inline SVG line chart used for trend visualizations
 * (7-day momentum in Executive Overview cards and Provincial Breakdown rows).
 *
 * Renders the values as a polyline scaled to fit width × height. When there is
 * only one point (or zero), it renders a flat dot/line so layouts stay stable.
 */
export default function Sparkline({
  data = [],
  width = 56,
  height = 18,
  strokeClass = 'text-teal-500 dark:text-teal-400',
  positive = true,
  strokeWidth = 1.6,
}) {
  if (!data || data.length === 0) return <span className="inline-block" style={{ width, height }} />

  const nums = data.filter((v) => typeof v === 'number' && !isNaN(v))
  if (nums.length === 0) return <span className="inline-block" style={{ width, height }} />

  const pad = 2
  const min = Math.min(...nums)
  const max = Math.max(...nums)
  const span = max - min || 1

  const coords = nums.map((v, i) => {
    const x = nums.length === 1 ? width / 2 : pad + (i * (width - pad * 2)) / (nums.length - 1)
    const y = height - pad - ((v - min) / span) * (height - pad * 2)
    return [x, y]
  })

  const line = coords.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
  const color = positive
    ? strokeClass
    : 'text-rose-500 dark:text-rose-400'

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={`overflow-visible ${color}`}
      fill="none"
      aria-hidden="true"
    >
      {/* Soft area fill */}
      {nums.length > 1 && (
        <path
          d={`${line} L${coords[coords.length - 1][0].toFixed(1)},${height} L${coords[0][0].toFixed(1)},${height} Z`}
          className="opacity-[0.12]"
          fill="currentColor"
          stroke="none"
        />
      )}
      <path d={line} stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
      {nums.length === 1 && (
        <circle cx={coords[0][0]} cy={coords[0][1]} r={2} fill="currentColor" />
      )}
    </svg>
  )
}

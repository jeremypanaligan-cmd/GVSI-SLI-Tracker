import { useRef, useState, useEffect } from 'react'
import { formatNumber, getBadgeStyle } from '../utils/dataProcessor'

export default function SLITable({ rows, columns }) {
  const scrollRef = useRef(null)
  const [scrollState, setScrollState] = useState({ left: false, right: false })

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return

    const updateScroll = () => {
      setScrollState({
        left: el.scrollLeft > 10,
        right: el.scrollLeft < el.scrollWidth - el.clientWidth - 10,
      })
    }
    updateScroll()
    el.addEventListener('scroll', updateScroll, { passive: true })
    window.addEventListener('resize', updateScroll)
    return () => {
      el.removeEventListener('scroll', updateScroll)
      window.removeEventListener('resize', updateScroll)
    }
  }, [])

  const containerClasses = [
    'table-scroll-container',
    scrollState.left ? 'has-left-scroll' : '',
    scrollState.right ? 'has-right-scroll' : '',
  ].filter(Boolean).join(' ')

  return (
    <div
      ref={scrollRef}
      className={`${containerClasses} overflow-x-auto overflow-y-auto`}
      style={{ maxHeight: 'calc(100dvh - 130px)' }}
    >
      <table className="w-full border-collapse min-w-[1100px] text-sm">
        <thead className="sticky top-0 z-40">
          <tr>
            {columns.map((col) => (
              <th
                key={col.key}
                className={`
                  px-2.5 py-2.5 text-xs font-bold uppercase tracking-wider
                  bg-slate-100 dark:bg-slate-800
                  border-b-2 border-slate-200 dark:border-slate-600/50
                  ${col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left'}
                  ${col.sticky ? 'sticky z-50 bg-slate-100 dark:bg-slate-800' : ''}
                  ${col.highlight ? 'text-cyan-700 dark:text-cyan-300' : 'text-slate-500 dark:text-slate-300'}
                  ${col.prominent ? 'text-cyan-700 dark:text-cyan-300' : ''}
                  ${col.sticky && col.key === 'CLUSTER' ? 'left-0' : ''}
                  ${col.sticky && col.key === 'AREA' ? 'left-[70px]' : ''}
                `}
                style={col.sticky ? {
                  minWidth: col.key === 'CLUSTER' ? '70px' : '100px',
                  boxShadow: '4px 0 8px -4px rgba(0,0,0,0.1)',
                } : undefined}
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((entry, i) => {
            if (entry.type === 'cluster-header') {
              return <ClusterHeaderRow key={`ch-${i}`} entry={entry} columns={columns} />
            }
            if (entry.type === 'cluster-subtotal') {
              return <ClusterSubtotalRow key={`cs-${i}`} entry={entry} columns={columns} />
            }
            if (entry.type === 'overall-total') {
              return <OverallTotalRow key={`ot-${i}`} entry={entry} columns={columns} />
            }
            return <AreaRow key={`ar-${i}`} entry={entry} columns={columns} />
          })}
        </tbody>
      </table>
    </div>
  )
}

function AreaRow({ entry, columns }) {
  const row = entry.row
  return (
    <tr className="hover:bg-slate-100 dark:hover:bg-slate-800/50 transition-colors border-b border-slate-100 dark:border-slate-800/60">
      {columns.map((col) => {
        const val = row[col.key] || ''
        const isHighlight = col.highlight
        const isProminent = col.prominent

        if (isHighlight) {
          const badge = getBadgeStyle(val)
          return (
            <td key={col.key} className="px-2.5 py-2 text-center">
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold border ${badge.bg} ${badge.color} ${badge.border} ${badge.pulse ? 'badge-hit' : ''}`}>
                {formatNumber(val, col.key)}
                <span className={`text-[9px] opacity-70 ${badge.color}`}>{badge.label}</span>
              </span>
            </td>
          )
        }

        return (
          <td
            key={col.key}
            className={`
              px-2.5 py-2
              ${col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left'}
              ${col.bold ? 'font-bold text-slate-900 dark:text-white' : 'text-slate-600 dark:text-slate-300'}
              ${isProminent ? 'font-bold text-cyan-700 dark:text-cyan-300' : ''}
              ${col.sticky ? 'sticky bg-slate-50 dark:bg-slate-900/95 backdrop-blur z-30' : ''}
            `}
            style={col.sticky ? {
              minWidth: col.key === 'CLUSTER' ? '70px' : '100px',
              boxShadow: '4px 0 8px -4px rgba(0,0,0,0.1)',
            } : undefined}
          >
            {col.key === 'CLUSTER' ? '' : formatNumber(val, col.key)}
          </td>
        )
      })}
    </tr>
  )
}

function ClusterHeaderRow({ entry, columns }) {
  return (
    <tr className="bg-slate-100 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700/50">
      {columns.map((col) => {
        const isFirst = col.key === 'CLUSTER'
        return (
          <td
            key={col.key}
            className={`
              px-2.5 py-2 font-bold text-xs uppercase tracking-wider
              ${isFirst ? 'text-cyan-700 dark:text-cyan-400 text-sm' : 'text-slate-400 dark:text-slate-500'}
              ${col.sticky ? 'sticky bg-slate-100 dark:bg-slate-800/95 backdrop-blur z-30' : ''}
            `}
            style={col.sticky ? {
              minWidth: col.key === 'CLUSTER' ? '70px' : '100px',
              boxShadow: '4px 0 8px -4px rgba(0,0,0,0.1)',
            } : undefined}
            colSpan={isFirst ? undefined : 1}
          >
            {isFirst ? entry.cluster : ''}
          </td>
        )
      })}
    </tr>
  )
}

function ClusterSubtotalRow({ entry, columns }) {
  return (
    <tr className="bg-slate-50 dark:bg-slate-800/40 border-t border-slate-200 dark:border-slate-600/40 border-b-2 border-slate-200 dark:border-slate-600/30">
      {columns.map((col) => {
        const val = entry.row[col.key] || ''
        const isArea = col.key === 'AREA'
        const isHighlight = col.highlight
        const isProminent = col.prominent

        if (isHighlight) {
          const badge = getBadgeStyle(val)
          return (
            <td key={col.key} className="px-2.5 py-2 text-center">
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold border ${badge.bg} ${badge.color} ${badge.border} ${badge.pulse ? 'badge-hit' : ''}`}>
                {formatNumber(val, col.key)}
                <span className={`text-[9px] opacity-70 ${badge.color}`}>{badge.label}</span>
              </span>
            </td>
          )
        }

        return (
          <td
            key={col.key}
            className={`
              px-2.5 py-2 text-xs font-bold
              ${col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left'}
              ${isArea ? 'text-slate-500 dark:text-slate-300 uppercase' : 'text-slate-700 dark:text-slate-200'}
              ${isProminent ? 'text-cyan-600 dark:text-cyan-200' : ''}
              ${col.sticky ? 'sticky bg-slate-50 dark:bg-slate-800/95 backdrop-blur z-30' : ''}
            `}
            style={col.sticky ? {
              minWidth: col.key === 'CLUSTER' ? '70px' : '100px',
              boxShadow: '4px 0 8px -4px rgba(0,0,0,0.1)',
            } : undefined}
          >
            {isArea ? 'SUBTOTAL' : formatNumber(val, col.key)}
          </td>
        )
      })}
    </tr>
  )
}

function OverallTotalRow({ entry, columns }) {
  return (
    <tr className="bg-gradient-to-r from-cyan-50 via-slate-50 to-cyan-50 dark:from-cyan-900/30 dark:via-slate-800 dark:to-cyan-900/30 border-t-2 border-cyan-400 dark:border-cyan-600/40 font-bold">
      {columns.map((col) => {
        const val = entry.row[col.key] || ''
        const isFirst = col.key === 'CLUSTER'
        const isArea = col.key === 'AREA'
        const isHighlight = col.highlight
        const isProminent = col.prominent

        if (isHighlight) {
          const badge = getBadgeStyle(val)
          return (
            <td key={col.key} className="px-2.5 py-3 text-center">
              <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-sm font-bold border ${badge.bg} ${badge.color} ${badge.border} ${badge.pulse ? 'badge-hit' : ''}`}>
                {formatNumber(val, col.key)}
                <span className={`text-[9px] opacity-70 ${badge.color}`}>{badge.label}</span>
              </span>
            </td>
          )
        }

        return (
          <td
            key={col.key}
            className={`
              px-2.5 py-3
              ${col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left'}
              text-sm text-slate-900 dark:text-white
              ${isProminent ? 'text-cyan-700 dark:text-cyan-200 text-base font-black' : ''}
              ${col.sticky ? 'sticky bg-slate-50 dark:bg-slate-800/95 backdrop-blur z-30' : ''}
            `}
            style={col.sticky ? {
              minWidth: col.key === 'CLUSTER' ? '70px' : '100px',
              boxShadow: '4px 0 8px -4px rgba(0,0,0,0.1)',
            } : undefined}
          >
            {(isFirst || isArea) ? entry.cluster : formatNumber(val, col.key)}
          </td>
        )
      })}
    </tr>
  )
}

import { formatNumber, getBadgeStyle } from '../utils/dataProcessor'

export default function SLITable({ rows, showVariance, onToggleVariance }) {
  return (
    <div className="w-full overflow-x-auto">
      <table className="w-full border-collapse text-[13px] leading-tight" style={{ fontVariantNumeric: 'tabular-nums' }}>
        <thead>
          <tr>
            <Th sticky label="CLUSTER" />
            <Th sticky label="AREA" />
            <Th label="BF" />
            <Th label="INC" />
            <Th label="TOTAL" />
            <Th label="CMP-TOT" />
            <Th label="CMP-RJO" />
            <Th label="CMP" />
            <Th label="RJO" />
            <Th label="CO" />
            <Th label="MTD" />
            <Th label="TARGET" />
            <Th label="%" />
            <Th label="VARI" />
            <Th label="TO GO" />
          </tr>
        </thead>
        <tbody>
          {rows.map((entry, i) => {
            if (entry.type === 'overall-total') {
              return <OverallRow key={`ot-${i}`} entry={entry} />
            }
            if (entry.type === 'cluster-subtotal') {
              return <SubtotalRow key={`cs-${i}`} entry={entry} showVariance={showVariance} />
            }
            if (entry.type === 'cluster-header') {
              return <ClusterHeaderRow key={`ch-${i}`} entry={entry} showVariance={showVariance} onToggleVariance={onToggleVariance} />
            }
            return <AreaRow key={`ar-${i}`} entry={entry} />
          })}
        </tbody>
      </table>
    </div>
  )
}

/* ─── Table Header Cell ─── */
function Th({ label, sticky }) {
  const isCluster = label === 'CLUSTER'
  return (
    <th
      className={`
        px-3 py-2.5 text-[10px] font-bold uppercase tracking-[0.08em] text-center
        border-b border-slate-800
        ${sticky
          ? 'sticky z-40 bg-[#0B0F17] border-r border-slate-800'
          : 'bg-[#0B0F17]'
        }
        ${label === '%' ? 'text-teal-400' : label === 'TO GO' ? 'text-teal-400' : 'text-slate-500'}
      `}
      style={sticky ? { left: isCluster ? '0px' : '80px', minWidth: isCluster ? '80px' : '140px' } : undefined}
    >
      {label}
    </th>
  )
}

/* ─── Cluster Header Row ─── */
function ClusterHeaderRow({ entry, showVariance, onToggleVariance }) {
  const isActive = showVariance

  return (
    <tr className="bg-slate-900/60">
      <td
        className="px-3 py-2 sticky z-30 bg-slate-900/80 border-r border-slate-800"
        style={{ left: '0px' }}
        rowSpan={1}
      >
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-bold text-teal-400 tracking-wide">
            CLUSTER {entry.cluster}
          </span>
          {onToggleVariance && (
            <button
              onClick={onToggleVariance}
              className={`text-[10px] px-2 py-0.5 rounded-full font-semibold transition-all duration-200 ${
                isActive
                  ? 'bg-teal-500/20 text-teal-300 border border-teal-500/30'
                  : 'bg-slate-800 text-slate-500 border border-slate-700 hover:border-slate-600 hover:text-slate-400'
              }`}
            >
              {isActive ? '▼ VARIANCE' : '▶ VARIANCE'}
            </button>
          )}
        </div>
      </td>
      <td className="px-3 py-2 bg-slate-900/40" colSpan={14}></td>
    </tr>
  )
}

/* ─── Area Data Row ─── */
function AreaRow({ entry }) {
  const row = entry.row
  const isSubtotal = entry.type === 'cluster-subtotal'

  return (
    <tr className={`
      transition-colors border-b border-slate-800/40
      ${isSubtotal
        ? 'bg-slate-800/30'
        : 'hover:bg-slate-800/20'
      }
    `}>
      <Td sticky stickyLeft="0px">{entry.cluster}</Td>
      <Td sticky stickyLeft="80px" bold>{entry.area}</Td>
      <Td num>{row['BF']}</Td>
      <Td num>{row['INC']}</Td>
      <Td num bold>{row['TOTAL']}</Td>
      <Td num>{row['COMPLETED FROM TOTAL']}</Td>
      <Td num>{row['COMPLETED FROM RJO']}</Td>
      <Td num bold>{row['COMPLETED TOTAL']}</Td>
      <Td num>{row['RJO']}</Td>
      <Td num>{row['CARRY OVER']}</Td>
      <Td num bold>{row['MTD']}</Td>
      <Td num>{row['TARGET']}</Td>
      <Td><PctBadge value={row['%']} /></Td>
      <Td num>{row['VARIANCE']}</Td>
      <Td num prominent>{row['TO GO']}</Td>
    </tr>
  )
}

/* ─── Subtotal Row (Variance) ─── */
function SubtotalRow({ entry, showVariance }) {
  if (!showVariance) return null
  const row = entry.row

  return (
    <tr className="bg-teal-950/20 border-t border-teal-800/20 border-b border-slate-800/40">
      <Td sticky stickyLeft="0px" className="text-slate-500 italic">{entry.cluster}</Td>
      <Td sticky stickyLeft="80px" className="text-teal-500/80 font-medium">CLUSTER VARIANCE</Td>
      <Td empty /><Td empty /><Td empty /><Td empty /><Td empty /><Td empty /><Td empty /><Td empty /><Td empty /><Td empty />
      <Td empty />
      <Td num className={Number(String(row['VARIANCE']).replace(/,/g, '')) >= 0 ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>
        {row['VARIANCE']}
      </Td>
      <Td num prominent className="text-teal-300 font-bold">
        {row['TO GO']}
      </Td>
    </tr>
  )
}

/* ─── Overall Total Row ─── */
function OverallRow({ entry }) {
  const row = entry.row

  return (
    <tr className="bg-gradient-to-r from-teal-950/40 via-slate-900/60 to-teal-950/40 border-t-2 border-teal-500/30 font-bold">
      <Td sticky stickyLeft="0px" className="text-teal-400 font-black text-xs tracking-wider">OVERALL</Td>
      <Td sticky stickyLeft="80px" className="text-teal-400 font-black text-xs tracking-wider">TOTAL</Td>
      <Td num>{row['BF']}</Td>
      <Td num>{row['INC']}</Td>
      <Td num bold>{row['TOTAL']}</Td>
      <Td num>{row['COMPLETED FROM TOTAL']}</Td>
      <Td num>{row['COMPLETED FROM RJO']}</Td>
      <Td num bold>{row['COMPLETED TOTAL']}</Td>
      <Td num>{row['RJO']}</Td>
      <Td num>{row['CARRY OVER']}</Td>
      <Td num bold>{row['MTD']}</Td>
      <Td num>{row['TARGET']}</Td>
      <Td><PctBadge value={row['%']} large /></Td>
      <Td num>{row['VARIANCE']}</Td>
      <Td num prominent className="text-teal-300">{row['TO GO']}</Td>
    </tr>
  )
}

/* ─── Reusable Cell Components ─── */

function Td({ children, sticky, bold, num, prominent, empty, className = '', stickyLeft = '0px' }) {
  if (empty) {
    return (
      <td className={`px-3 py-2 text-center text-slate-800 ${sticky ? 'sticky z-30 bg-[#0B0F17] border-r border-slate-800' : ''}`} style={sticky ? { left: stickyLeft } : undefined}>
        —
      </td>
    )
  }

  return (
    <td
      className={`
        px-3 py-2 text-right
        ${sticky ? 'sticky z-30 bg-[#0B0F17] border-r border-slate-800 text-left' : ''}
        ${bold ? 'font-semibold text-slate-100' : 'text-slate-400'}
        ${prominent ? 'text-teal-300 font-bold' : ''}
        ${className}
      `}
      style={sticky ? { left: stickyLeft } : undefined}
    >
      {num ? formatNumber(children) : children}
    </td>
  )
}

function PctBadge({ value, large }) {
  const badge = getBadgeStyle(value)
  const size = large ? 'text-xs px-2.5 py-1' : 'text-[11px] px-2 py-0.5'

  return (
    <div className="flex justify-center">
      <span className={`
        inline-flex items-center gap-1 rounded-full font-bold border
        ${badge.bg} ${badge.color} ${badge.border}
        ${badge.pulse ? 'badge-hit' : ''}
        ${size}
      `}>
        {formatNumber(value, '%')}
        <span className="text-[8px] opacity-60">{badge.label}</span>
      </span>
    </div>
  )
}

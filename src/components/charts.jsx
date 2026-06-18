import { weekLongest } from '../data/plan.js'

// ---- Route profile: long-run distance across the block, as a canyon strata line ----
export function RouteProfile({ plan, currentIdx }) {
  const W = Math.max(820, plan.length * 70), H = 150, padX = 40, padY = 28
  const maxLong = 50
  const phaseColor = { Return: '#9CA98C', Base: '#7E97A6', Build: '#BC6B47', Peak: '#A14A35', Sharpen: '#C99A4B', Taper: '#C99A4B', Race: '#BC6B47' }
  const pts = plan.map((w, i) => {
    const x = padX + (W - 2 * padX) * i / (plan.length - 1)
    const lr = weekLongest(w)
    const y = H - padY - (H - 2 * padY) * (lr / maxLong)
    return { x, y, w, lr }
  })
  const line = pts.map((p, i) => (i ? 'L' : 'M') + p.x.toFixed(1) + ' ' + p.y.toFixed(1)).join(' ')
  const area = line + ` L ${pts.at(-1).x.toFixed(1)} ${H - padY} L ${pts[0].x.toFixed(1)} ${H - padY} Z`
  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ minWidth: W }} preserveAspectRatio="xMidYMid meet">
        <defs>
          <linearGradient id="rg" x1="0" x2={W} y1="0" y2="0">
            <stop stopColor="#7E97A6" /><stop offset=".5" stopColor="#BC6B47" /><stop offset="1" stopColor="#A14A35" />
          </linearGradient>
          <linearGradient id="ra" x1="0" x2="0" y1="0" y2="1">
            <stop stopColor="#BC6B47" stopOpacity=".18" /><stop offset="1" stopColor="#BC6B47" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={area} fill="url(#ra)" />
        <path d={line} fill="none" stroke="url(#rg)" strokeWidth="2.5" />
        {pts.map((p, i) => {
          const cur = i === currentIdx, race = p.w.phase === 'Race'
          return (
            <g key={i}>
              {cur && <circle cx={p.x} cy={p.y} r="11" fill="none" stroke="#BC6B47" strokeWidth="1.5" opacity=".5">
                <animate attributeName="r" values="8;15;8" dur="2.4s" repeatCount="indefinite" />
                <animate attributeName="opacity" values=".5;0;.5" dur="2.4s" repeatCount="indefinite" /></circle>}
              <circle cx={p.x} cy={p.y} r={race ? 7 : cur ? 6.5 : 4.5} fill={race ? '#BC6B47' : phaseColor[p.w.phase]} stroke="#FBF8F2" strokeWidth="2" />
              <text x={p.x} y={H - 9} textAnchor="middle" fontSize="9" fill="#8C8173" fontFamily="JetBrains Mono">{p.w.n === 0 ? 'R' : p.w.n}</text>
              {(p.lr >= 18 || race) && <text x={p.x} y={p.y - 10} textAnchor="middle" fontSize="9" fill="#5C5246" fontFamily="JetBrains Mono">{p.lr}</text>}
            </g>
          )
        })}
      </svg>
    </div>
  )
}

export function Sparkline({ data, color = '#C2703F', band, labels = [], unit = '' }) {
  const w = 520, h = 150, pad = 24, n = data.length
  const mn = Math.min(...data) - 2, mx = Math.max(...data) + 2
  const X = (i) => pad + (w - 2 * pad) * i / (n - 1)
  const Y = (v) => h - pad - (h - 2 * pad) * (v - mn) / (mx - mn)
  const path = data.map((v, i) => (i ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(v).toFixed(1)).join(' ')
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%">
      {band && (() => { const y1 = Y(band[1]), y2 = Y(band[0]); return (
        <g><rect x={pad} y={y1} width={w - 2 * pad} height={y2 - y1} fill="#7E8C6A" opacity=".10" />
          <text x={w - pad} y={y1 - 4} textAnchor="end" fontSize="9" fill="#5F6E4E" fontFamily="JetBrains Mono">balanced</text></g>) })()}
      <path d={path} fill="none" stroke={color} strokeWidth="2.2" />
      {data.map((v, i) => (i % 3 === 0 || i === n - 1) && <circle key={i} cx={X(i)} cy={Y(v)} r="2.6" fill={color} />)}
      {labels.map((l, i) => (
        <text key={i} x={pad + (w - 2 * pad) * i / (labels.length - 1)} y={h - 6}
          textAnchor={i === 0 ? 'start' : i === labels.length - 1 ? 'end' : 'middle'}
          fontSize="9" fill="#8C8173" fontFamily="JetBrains Mono">{l}</text>
      ))}
      <text x={pad} y="13" fontSize="9" fill="#8C8173" fontFamily="JetBrains Mono">{mx.toFixed(0)}{unit}</text>
      <text x={pad} y={h - pad + 10} fontSize="9" fill="#8C8173" fontFamily="JetBrains Mono">{mn.toFixed(0)}</text>
    </svg>
  )
}

export function LoadBars({ acute, chronic, band }) {
  const w = 520, h = 150, pad = 28, scaleMax = 520
  const Y = (v) => h - pad - (h - 2 * pad) * v / scaleMax
  const bx = Y(band[1]), bh = Y(band[0]) - Y(band[1])
  const bars = [['Acute', acute, '#7E97A6', 130], ['Chronic', chronic, '#BC6B47', 270]]
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%">
      <rect x={pad} y={bx} width={w - 2 * pad} height={bh} fill="#7E8C6A" opacity=".12" />
      <text x={w - pad} y={bx - 5} textAnchor="end" fontSize="9" fill="#5F6E4E" fontFamily="JetBrains Mono">optimal chronic band</text>
      {bars.map((b) => { const bw = 110, y = Y(b[1]); return (
        <g key={b[0]}>
          <rect x={b[3]} y={y} width={bw} height={h - pad - y} rx="6" fill={b[2]} opacity=".9" />
          <text x={b[3] + bw / 2} y={y - 7} textAnchor="middle" fontSize="13" fontWeight="700" fill="#352E27" fontFamily="JetBrains Mono">{b[1]}</text>
          <text x={b[3] + bw / 2} y={h - pad + 13} textAnchor="middle" fontSize="10" fill="#5C5246">{b[0]} load</text>
        </g>) })}
    </svg>
  )
}

export function StreamChart({ s }) {
  const w = 820, h = 210, pad = 34
  const n = s.dist.length, X = (i) => pad + (w - 2 * pad) * s.dist[i] / 8.4
  const hrMn = 120, hrMx = 180, Yhr = (v) => pad + (h - 2 * pad) * (1 - (v - hrMn) / (hrMx - hrMn))
  const pMn = 400, pMx = 470, Yp = (v) => pad + (h - 2 * pad) * ((v - pMn) / (pMx - pMn))
  const altMx = Math.max(...s.alt), Ya = (v) => h - pad - 28 * v / altMx
  const altPath = s.alt.map((v, i) => (i ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Ya(v).toFixed(1)).join(' ') + ` L ${X(n - 1)} ${h - pad} L ${X(0)} ${h - pad} Z`
  const hrPath = s.hr.map((v, i) => (i ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Yhr(v).toFixed(1)).join(' ')
  const pPath = s.pace.map((v, i) => (i ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Yp(v).toFixed(1)).join(' ')
  const z = Yhr(166)
  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${w} ${h}`} width="100%" style={{ minWidth: 560 }}>
        <path d={altPath} fill="#7E97A6" opacity=".12" />
        <line x1={pad} y1={z} x2={w - pad} y2={z} stroke="#C99A4B" strokeWidth="1" strokeDasharray="4 4" opacity=".6" />
        <text x={w - pad} y={z - 4} textAnchor="end" fontSize="9" fill="#9c7a2e" fontFamily="JetBrains Mono">Z3 line · 166 bpm</text>
        <path d={pPath} fill="none" stroke="#C2703F" strokeWidth="2" opacity=".9" />
        <path d={hrPath} fill="none" stroke="#A14A35" strokeWidth="2.2" />
        {[0, 2, 4, 6, 8].map((d) => <text key={d} x={pad + (w - 2 * pad) * d / 8.4} y={h - 6} textAnchor="middle" fontSize="9" fill="#8C8173" fontFamily="JetBrains Mono">{d}km</text>)}
        <g fontFamily="JetBrains Mono" fontSize="10">
          <circle cx={pad} cy="14" r="4" fill="#A14A35" /><text x={pad + 10} y="17" fill="#5C5246">heart rate</text>
          <circle cx={pad + 110} cy="14" r="4" fill="#C2703F" /><text x={pad + 120} y="17" fill="#5C5246">pace</text>
          <rect x={pad + 200} y="10" width="8" height="8" fill="#7E97A6" opacity=".5" /><text x={pad + 212} y="17" fill="#5C5246">elevation</text>
        </g>
      </svg>
    </div>
  )
}

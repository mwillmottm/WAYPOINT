// src/components/pages/Coach.jsx
// Live AI coaching chat + coaching philosophy cards
// Requires VITE_ANTHROPIC_KEY in Netlify env vars for live chat

import { useState, useRef, useEffect } from 'react'
import { IconCoach } from '../icons.jsx'
import { SNAP as SNAP_FALLBACK } from '../../data/snapshot.js'

const API_KEY = import.meta.env.VITE_ANTHROPIC_KEY

const QUICK = [
  { label: 'Explain today\'s session', key: 'today' },
  { label: 'Replan this week', key: 'replan' },
  { label: 'Am I on track for 50K?', key: 'track' },
  { label: 'What do my numbers mean?', key: 'numbers' },
  { label: 'I\'m tired — what should I do?', key: 'tired' },
  { label: 'How should I fuel on long runs?', key: 'fuel' },
]

const QUICK_TEXT = {
  today: (snap) => `Can you explain today's session in detail — what I should focus on, exact pacing targets, and why it's in the plan at this point in the block?`,
  replan: (snap) => `My readiness is ${snap?.readiness ?? 'unknown'} today and HRV is ${snap?.hrv ?? 'unknown'} ms. Can you replan this week around that reality, keeping the long run protected?`,
  track: (snap) => `Based on my current fitness data — readiness ${snap?.readiness}, HRV ${snap?.hrv} ms, ACWR ${snap?.acwr}, VO2 ${snap?.vo2} — am I on track for the 50K on 12 September?`,
  numbers: (snap) => `Can you explain what my fitness numbers mean: readiness ${snap?.readiness}/100, HRV ${snap?.hrv} ms (${snap?.hrvStatus}), RHR ${snap?.rhr} bpm (avg ${snap?.rhr7}), ACWR ${snap?.acwr}?`,
  tired: (snap) => `I'm feeling tired and my readiness is ${snap?.readiness ?? 'low'}. What should I do with today's session and the rest of this week?`,
  fuel: () => `What's the best fuelling strategy for my long runs building toward a 50K? When should I start taking carbs, how much, and what should I use?`,
}

function buildSystem(snap) {
  const SNAP = snap || SNAP_FALLBACK
  return `You are WAYPOINT, an experienced running coach specialising in ultramarathon training. You coach Mol Willmott, training for a 50K ultramarathon on 12 September 2026, based in Torquay, Surf Coast VIC.

CURRENT FITNESS DATA (live from Garmin):
- Readiness: ${SNAP.readiness ?? '—'}/100 | Recovery: ${SNAP.recoveryHrs ?? '—'}
- HRV: ${SNAP.hrv ?? '—'} ms (${SNAP.hrvStatus ?? '—'}) | Baseline: 40–49 ms
- Resting HR: ${SNAP.rhr ?? '—'} bpm | 7-day avg: ${SNAP.rhr7 ?? '—'} bpm
- Body battery: ${SNAP.battery ?? '—'}% | Sleep: ${SNAP.sleep ?? '—'}/100
- Stress: ${SNAP.stress ?? '—'}/100 | SpO₂: ${SNAP.spo2 ?? '—'}%
- VO₂ max: ${SNAP.vo2 ?? '—'} | Threshold HR: ${SNAP.ltHr ?? 173} bpm
- Acute load: ${SNAP.acute ?? '—'} | Chronic load: ${SNAP.chronic ?? '—'} | ACWR: ${SNAP.acwr ?? '—'}
- Training status: ${SNAP.status ?? '—'} | Balance: ${SNAP.balance ?? '—'}

PACE ZONES (Garmin/Daniels):
Recover: 7:50–8:20 | Easy: 7:15–7:50 | Aerobic: 6:35–6:55 | Threshold: 5:45–5:55 | 5K: 5:10–5:20 | Interval: 5:00–5:10 | Rep: 4:45–4:55

COACHING PHILOSOPHY: Threshold and tempo-led. Inspired by Jeff Cunningham, Brock Kelly, Canova/NCAA systems. Deep aerobic base. Weekend back-to-backs for ultra durability. Real data drives decisions.

INSTRUCTIONS: Be direct, warm, specific. Use the actual numbers above. Keep responses concise — 3–5 sentences for simple questions, up to 8 for complex ones. When replanning, give concrete day-by-day suggestions. If asked outside coaching, redirect gently.`
}

const CARDS = [
  { t: 'Threshold is the engine', c: '#C2703F', b: 'You thrive on tempo and threshold, so the block is built around it — cruise intervals, float threshold, tempo progressions buried inside long runs. Aim to accumulate lots of time at 5:45–5:55 without ever tipping into a race. Run the same pace from the first rep to the last; even efforts compound, heroic ones cost the next session.' },
  { t: 'Aerobic base carries it all', c: '#C9954F', b: 'Threshold only pays off on a deep aerobic floor. Your aerobic pace (6:35–6:55) gets its own steady mid-week runs and the easy days stay genuinely easy. Most of the week is unglamorous aerobic volume — that\'s the point. It\'s the soil the quality grows in.' },
  { t: 'Back-to-backs build the ultra', c: '#A07C53', b: 'A 50K is run on tired legs, so we rehearse exactly that. The Sunday medium-long after your Saturday long run teaches fatigue resistance better than any single big run. By peak week, 32 km + 15 km is the dress rehearsal for race-day durability.' },
  { t: 'Read the signals, not the ego', c: '#7E97A6', b: 'The dashboard surfaces readiness, HRV, resting HR and load for a reason. A red morning means swap the quality day for easy or rest — you lose nothing and protect everything. Adjusting around a bad day is training maturity, not weakness.' },
  { t: 'Fuelling the distance', c: '#BC6B47', b: 'Practise race fuelling on every long run: 50–70 g of carbohydrate per hour from the 40-minute mark, with fluid and electrolytes to match. Train the gut like a muscle now so race day holds no surprises.' },
  { t: 'Taper with trust', c: '#C99A4B', b: 'The final two weeks cut volume hard while keeping a whisper of intensity. You\'ll feel twitchy and want to do more — don\'t. Fitness is banked weeks earlier; the taper just lets it surface. Arrive slightly under-done rather than a single session over.' },
]

function Message({ msg }) {
  const isUser = msg.role === 'user'
  return (
    <div className={`flex gap-2.5 ${isUser ? 'flex-row-reverse' : ''}`}>
      {!isUser && (
        <div className="w-7 h-7 rounded-lg bg-clay grid place-items-center text-bone shrink-0 mt-0.5">
          <IconCoach className="w-3.5 h-3.5" />
        </div>
      )}
      <div className={`max-w-[85%] rounded-xl px-3.5 py-2.5 text-[13.5px] leading-relaxed whitespace-pre-wrap
        ${isUser ? 'bg-clay text-bone rounded-br-sm' : 'bg-bone border border-line-soft text-ink rounded-bl-sm'}`}>
        {msg.content || (msg.loading && <span className="inline-block w-1 h-3.5 bg-clay ml-0.5 animate-pulse" />)}
      </div>
    </div>
  )
}

export function Coach({ ctx }) {
  const snap = ctx?.snap || SNAP_FALLBACK
  const hasKey = !!API_KEY

  const [tab, setTab] = useState(hasKey ? 'chat' : 'notebook')
  const [messages, setMessages] = useState([{
    role: 'assistant',
    content: `Hi Mol 👋 I have your latest Garmin data — readiness ${snap.readiness ?? '—'}/100, HRV ${snap.hrv ?? '—'} ms. What do you need?`
  }])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [apiError, setApiError] = useState(null)
  const bottomRef = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  const send = async (text) => {
    const userText = (text || input).trim()
    if (!userText || loading) return
    setInput('')
    setApiError(null)

    setMessages(prev => [...prev,
      { role: 'user', content: userText },
      { role: 'assistant', content: '', loading: true }
    ])
    setLoading(true)

    try {
      const history = [...messages, { role: 'user', content: userText }]
        .map(m => ({ role: m.role, content: m.content || '' }))
        .filter(m => m.content)

      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': API_KEY,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-allow-browser': 'true',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 1000,
          system: buildSystem(snap),
          messages: history,
        })
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error?.message || `HTTP ${res.status}`)
      const reply = data.content?.find(b => b.type === 'text')?.text || 'No response.'
      setMessages(prev => [...prev.slice(0, -1), { role: 'assistant', content: reply }])
    } catch (e) {
      const msg = e.message?.includes('401') ? 'Invalid API key — check VITE_ANTHROPIC_KEY in Netlify.'
        : e.message?.includes('403') ? 'API key lacks permissions.'
        : 'Connection issue — try again.'
      setApiError(msg)
      setMessages(prev => prev.slice(0, -1))
    }
    setLoading(false)
    inputRef.current?.focus()
  }

  return (
    <div className="animate-rise">
      <div className="eyebrow">AI coaching · live</div>
      <h1 className="pagetitle mt-0.5">Coach's <span className="thin">notebook</span></h1>

      {/* Tab switcher */}
      <div className="flex gap-1 mt-4 mb-4 bg-bone border border-line rounded-xl p-1 w-fit">
        {['chat', 'notebook'].map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-1.5 rounded-lg text-[13px] font-semibold transition capitalize
              ${tab === t ? 'bg-clay text-bone shadow-sm' : 'text-muted hover:text-ink'}`}>
            {t === 'chat' ? '✦ Live chat' : 'Philosophy'}
          </button>
        ))}
      </div>

      {tab === 'chat' ? (
        !hasKey ? (
          <div className="card p-6 text-center">
            <IconCoach className="w-8 h-8 text-muted mx-auto mb-3" />
            <div className="font-semibold text-ink mb-2">Coach chat needs an API key</div>
            <p className="text-[13px] text-muted max-w-sm mx-auto leading-relaxed mb-4">
              Add <code className="bg-bone border border-line px-1.5 py-0.5 rounded text-[11px]">VITE_ANTHROPIC_KEY</code> to your Netlify environment variables, then redeploy.
            </p>
            <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noreferrer"
              className="btn btn-primary btn-sm">Get an API key →</a>
          </div>
        ) : (
          <div className="flex flex-col h-[calc(100dvh-220px)]">
            {/* Quick prompts */}
            <div className="flex gap-2 overflow-x-auto pb-2 shrink-0 scrollbar-none">
              {QUICK.map(p => (
                <button key={p.key} onClick={() => send(QUICK_TEXT[p.key](snap))} disabled={loading}
                  className="shrink-0 text-[11.5px] font-semibold px-3 py-2 rounded-xl border border-line bg-bone hover:border-clay hover:text-clay transition whitespace-nowrap text-slate">
                  {p.label}
                </button>
              ))}
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto space-y-3 py-3 min-h-0">
              {messages.map((msg, i) => <Message key={i} msg={msg} />)}
              {apiError && (
                <div className="text-[12px] text-red-600 bg-red-50 border border-red-200 rounded-xl p-3">{apiError}</div>
              )}
              <div ref={bottomRef} />
            </div>

            {/* Input */}
            <div className="shrink-0 pt-3 border-t border-line">
              <div className="flex gap-2">
                <input ref={inputRef} className="input flex-1 text-[14px]"
                  value={input} onChange={e => setInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send()}
                  placeholder="Ask about a session, your fitness, or anything training…"
                  disabled={loading} />
                <button className="btn btn-primary shrink-0 w-10" onClick={() => send()} disabled={loading || !input.trim()}>
                  {loading ? '…' : '↑'}
                </button>
              </div>
              <div className="text-[10px] text-muted mt-1.5 text-center">Powered by Claude · Uses your live Garmin data</div>
            </div>
          </div>
        )
      ) : (
        <div>
          <p className="text-[14px] text-slate mb-4 max-w-2xl leading-relaxed">
            The principles behind your block — threshold-led, aerobically deep, and built to get you to the start line healthy and to the finish line strong.
          </p>
          <div className="grid sm:grid-cols-2 gap-4">
            {CARDS.map(c => (
              <div key={c.t} className="card p-5 relative overflow-hidden">
                <span className="absolute inset-y-0 left-0 w-1" style={{ background: c.c }} />
                <h3 className="font-display text-[17px] text-ink mb-2 pl-1">{c.t}</h3>
                <p className="text-[13.5px] text-slate leading-relaxed pl-1">{c.b}</p>
              </div>
            ))}
          </div>
          <div className="card p-5 mt-4 flex gap-4" style={{ background: 'linear-gradient(120deg,#FBF6EE,#F6EFE4)' }}>
            <div className="w-9 h-9 shrink-0 rounded-lg bg-clay grid place-items-center text-bone">
              <IconCoach className="w-5 h-5" />
            </div>
            <p className="text-[13.5px] text-slate leading-relaxed">
              <b className="text-ink">A note on the jump.</b> Going from 10 km runs to a 50K in twelve weeks works on one condition: consistency over heroics. The threshold work will feel great because it's your strength — the discipline is keeping the easy days easy and honouring the deloads. Miss a day, shrug, move on. Stack the weeks and the distance takes care of itself.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

import { useState, useRef, useEffect } from 'react'
import { IconCoach, IconRefresh } from '../icons.jsx'
import { SNAP as SNAP_FALLBACK } from '../../data/snapshot.js'
import { TODAY_ISO } from '../../data/snapshot.js'
import { findDay, currentWeek } from '../../lib/utils.js'
import { KIND } from '../../data/plan.js'

const QUICK_PROMPTS = [
  { label: 'Explain today\'s session', key: 'today' },
  { label: 'Replan this week', key: 'replan' },
  { label: 'Am I on track for 50K?', key: 'track' },
  { label: 'What do my fitness numbers mean?', key: 'fitness' },
  { label: 'How should I fuel on long runs?', key: 'fuel' },
  { label: 'I\'m feeling tired — what should I do?', key: 'tired' },
]

function buildSystemPrompt(snap, plan, today) {
  const SNAP = snap || SNAP_FALLBACK
  const week = currentWeek(plan)
  const day = findDay(plan, TODAY_ISO)
  const k = day ? KIND[day.kind] : null

  return `You are WAYPOINT, an experienced running coach specialising in ultramarathon training. You coach Mol Willmott, a woman based in Torquay, Surf Coast VIC, Australia. She is training for a 50K ultramarathon on 12 September 2026.

CURRENT FITNESS (synced from Garmin today):
- Readiness: ${SNAP.readiness}/100
- HRV: ${SNAP.hrv} ms (status: ${SNAP.hrvStatus})
- Resting HR: ${SNAP.rhr} bpm (7-day avg: ${SNAP.rhr7})
- Body battery: ${SNAP.battery}%
- Sleep: ${SNAP.sleep}/100
- VO₂ max: ${SNAP.vo2}
- Threshold HR: ${SNAP.ltHr} bpm
- Acute load: ${SNAP.acute} | Chronic load: ${SNAP.chronic} | ACWR: ${SNAP.acwr}
- Training status: ${SNAP.status}
- Training balance: ${SNAP.balance}

MOL'S TRAINING ZONES (from Garmin):
- Recover/SJ: 7:50–8:20/km | Easy: 7:15–7:50 | Aerobic: 6:35–6:55 | Threshold: 5:45–5:55 | 5K: 5:10–5:20 | Interval: 5:00–5:10 | Rep: 4:45–4:55

CURRENT WEEK: Week ${week?.n ?? '—'} · ${week?.phase ?? ''} · ${week?.note ?? ''}

TODAY (${TODAY_ISO}): ${day?.title ?? 'Rest day'} — ${day?.km ?? '—'} km ${k ? '(' + k.label + ')' : ''}
${day?.purpose ? 'Purpose: ' + day.purpose : ''}

COACHING PHILOSOPHY: Threshold and tempo-led. Inspired by Jeff Cunningham, Brock Kelly, Canova/NCAA systems. Deep aerobic base. Weekend back-to-backs for ultra durability. Real data drives decisions — if the numbers say rest, we rest.

INSTRUCTIONS: Be direct, warm, and specific. Use actual numbers from the data above. Keep responses concise (3–5 sentences for simple questions, up to 8 for complex ones). When asked to replan the week, give concrete day-by-day suggestions. Never fabricate quotes. If asked something outside coaching, redirect gently.`
}

function Message({ msg }) {
  const isUser = msg.role === 'user'
  return (
    <div className={`flex gap-2.5 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
      {!isUser && (
        <div className="w-7 h-7 rounded-lg bg-clay grid place-items-center text-bone shrink-0 mt-0.5">
          <IconCoach className="w-3.5 h-3.5" />
        </div>
      )}
      <div className={`max-w-[85%] rounded-xl px-3.5 py-2.5 text-[13.5px] leading-relaxed whitespace-pre-wrap
        ${isUser ? 'bg-clay text-bone rounded-br-sm ml-auto' : 'bg-bone border border-line-soft text-ink rounded-bl-sm'}`}>
        {msg.content}
        {msg.loading && <span className="inline-block w-1 h-3.5 bg-clay ml-0.5 animate-pulse" />}
      </div>
    </div>
  )
}

export function Coach({ ctx }) {
  const { plan, snap } = ctx
  const SNAP = snap || SNAP_FALLBACK

  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content: `Hi Mol 👋 I'm your WAYPOINT coach. I can see your latest data — readiness ${SNAP.readiness}/100, HRV ${SNAP.hrv} ms, and you're in ${currentWeek(plan)?.phase || 'the'} phase. What would you like to know?`,
    }
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  const send = async (text) => {
    const userText = (text || input).trim()
    if (!userText || loading) return
    setInput('')

    const userMsg = { role: 'user', content: userText }
    const thinkingMsg = { role: 'assistant', content: '', loading: true }
    setMessages(prev => [...prev, userMsg, thinkingMsg])
    setLoading(true)

    try {
      const history = [...messages, userMsg].map(m => ({ role: m.role, content: m.content }))

      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 1000,
          system: buildSystemPrompt(SNAP, plan, TODAY_ISO),
          messages: history,
        }),
      })
      const data = await res.json()
      const reply = data.content?.find(b => b.type === 'text')?.text || 'Sorry, I couldn\'t respond right now.'
      setMessages(prev => [...prev.slice(0, -1), { role: 'assistant', content: reply }])
    } catch {
      setMessages(prev => [...prev.slice(0, -1), { role: 'assistant', content: 'Connection issue — try again in a moment.' }])
    }
    setLoading(false)
    inputRef.current?.focus()
  }

  const quickSend = (key) => {
    const prompts = {
      today: `Can you explain today's session in detail — what I should focus on, pacing targets, and why it's in the plan at this point?`,
      replan: `My readiness is ${SNAP.readiness} today. Can you replan this week around that, keeping the long run protected?`,
      track: `Based on my current fitness data and training load, am I on track for the 50K on 12 September?`,
      fitness: `Can you explain what my fitness numbers mean — readiness ${SNAP.readiness}, HRV ${SNAP.hrv}ms, ACWR ${SNAP.acwr}, chronic load ${SNAP.chronic}?`,
      fuel: `What's the best fuelling strategy for my long runs building toward 50K?`,
      tired: `I'm feeling tired and my readiness is ${SNAP.readiness}. What should I do with today's session and the rest of this week?`,
    }
    send(prompts[key])
  }

  const clearChat = () => {
    setMessages([{ role: 'assistant', content: `Chat cleared. Readiness is ${SNAP.readiness}/100 today — what do you need?` }])
  }

  return (
    <div className="animate-rise flex flex-col h-[calc(100dvh-140px)] lg:h-[calc(100dvh-80px)]">
      {/* header */}
      <div className="flex items-center justify-between mb-3 shrink-0">
        <div>
          <div className="eyebrow">AI coaching · live</div>
          <h1 className="pagetitle mt-0.5">Coach <span className="thin">chat</span></h1>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={clearChat}>
          <IconRefresh className="w-3.5 h-3.5" />Clear
        </button>
      </div>

      {/* quick prompts */}
      <div className="flex gap-2 overflow-x-auto pb-2 shrink-0 scrollbar-none">
        {QUICK_PROMPTS.map(p => (
          <button key={p.key} onClick={() => quickSend(p.key)} disabled={loading}
            className="shrink-0 text-[11.5px] font-semibold px-3 py-2 rounded-xl border border-line bg-bone hover:border-clay hover:text-clay transition whitespace-nowrap text-slate">
            {p.label}
          </button>
        ))}
      </div>

      {/* message thread */}
      <div className="flex-1 overflow-y-auto space-y-3 py-3 min-h-0">
        {messages.map((msg, i) => <Message key={i} msg={msg} />)}
        <div ref={bottomRef} />
      </div>

      {/* input */}
      <div className="shrink-0 pt-3 border-t border-line">
        <div className="flex gap-2">
          <input ref={inputRef} className="input flex-1 text-[14px]"
            value={input} onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send()}
            placeholder="Ask about a session, your fitness, or anything training…"
            disabled={loading} />
          <button className="btn btn-primary shrink-0" onClick={() => send()} disabled={loading || !input.trim()}>
            {loading ? '…' : '↑'}
          </button>
        </div>
        <div className="text-[10px] text-muted mt-1.5 text-center">Powered by Claude · Uses your live Garmin data</div>
      </div>
    </div>
  )
}

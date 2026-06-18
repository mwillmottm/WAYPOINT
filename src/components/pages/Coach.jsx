import { IconCoach } from '../icons.jsx'

const CARDS = [
  { t: 'Threshold is the engine', c: '#C2703F', b: 'You thrive on tempo and threshold, so the block is built around it — cruise intervals, float threshold, tempo progressions and threshold buried inside long runs. The aim is to accumulate lots of time at 5:45–5:55 without ever tipping into a race. Run the same pace from the first rep to the last; even efforts compound, heroic ones cost you the next session.' },
  { t: 'Aerobic base carries it all', c: '#C9954F', b: 'Threshold only pays off when it sits on a deep aerobic floor. Your “Aerobic” pace (6:35–6:55) gets its own steady mid-week runs, and the easy days stay genuinely easy. Most of your week is unglamorous aerobic volume — that’s the point. It’s the soil the quality grows in.' },
  { t: 'Back-to-backs build the ultra', c: '#A07C53', b: 'A 50K is run on tired legs, so we rehearse exactly that. The Sunday medium-long the morning after your long run teaches fatigue resistance better than any single big run could. By peak week, a 32 km Saturday plus a 15 km Sunday is your dress rehearsal for race-day durability.' },
  { t: 'Coming back from illness', c: '#7E8C6A', b: 'You’re returning from a five-day lay-off, and the smart move is patience, not catch-up. Frequency rebuilds you faster than intensity: easy, short, often. Your HRV and resting HR are already green, which is your green light to ramp — but let the body confirm it run by run before stacking the hard days back on.' },
  { t: 'Fuelling the distance', c: '#BC6B47', b: 'Practise race fuelling on every long run: 50–70 g of carbohydrate per hour from the 40-minute mark, with fluid and electrolytes to match. Train the gut like a muscle now so race day holds no surprises. Going in under-fuelled is the most common way a strong 50K runner unravels in the final 10 km.' },
  { t: 'Read the signals, not the ego', c: '#7E97A6', b: 'The dashboard surfaces readiness, HRV, resting HR and load for a reason. A red morning means swap the quality day for easy or rest — you lose nothing and protect everything. Adjusting around a bad day is training maturity, not weakness. The plan serves you; you don’t serve the plan.' },
  { t: 'Taper with trust', c: '#C99A4B', b: 'The final two weeks cut volume hard while keeping a whisper of intensity so the legs stay sharp. You’ll feel twitchy and want to do more — don’t. Fitness is banked weeks earlier; the taper just lets it surface. Arrive at the start line slightly under-done rather than a single session over.' },
]

export function Coach() {
  return (
    <div className="animate-rise">
      <div className="eyebrow">Coaching philosophy · the road to 50K</div>
      <h1 className="pagetitle mt-1.5">Coach’s <span className="thin">notebook</span></h1>
      <p className="text-[14px] text-slate mt-2 max-w-2xl leading-relaxed">
        The principles behind your block — threshold-led, aerobically deep, and built to get you to the start line healthy and to the finish line strong.
      </p>

      <div className="grid md:grid-cols-2 gap-4 mt-5">
        {CARDS.map((c) => (
          <div key={c.t} className="card p-5 relative overflow-hidden">
            <span className="absolute inset-y-0 left-0 w-1" style={{ background: c.c }} />
            <h3 className="font-display text-[17px] text-ink mb-2 pl-1">{c.t}</h3>
            <p className="text-[13.5px] text-slate leading-relaxed pl-1">{c.b}</p>
          </div>
        ))}
      </div>

      <div className="card p-5 mt-4 flex gap-4" style={{ background: 'linear-gradient(120deg,#FBF6EE,#F6EFE4)' }}>
        <div className="w-9 h-9 shrink-0 rounded-lg bg-clay grid place-items-center text-bone"><IconCoach className="w-5 h-5" /></div>
        <p className="text-[13.5px] text-slate leading-relaxed">
          <b className="text-ink">A note on the jump.</b> Going from your current 10 km runs to a 50K in twelve weeks is ambitious, and it works on one condition: consistency over heroics.
          The threshold work will feel great because it’s your strength — the discipline is keeping the easy days easy and honouring the deloads so the quality keeps landing. Miss a day, shrug, move on. Stack the weeks and the distance takes care of itself.
        </p>
      </div>
    </div>
  )
}

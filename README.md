# WAYPOINT · Road to 50K

A production-ready coaching dashboard for Mol's 12-week, threshold-led 50K build.
Built with **Vite + React + Tailwind**, fully self-contained, deployable to Netlify.

Race: **50K ultramarathon — Saturday 12 September 2026.**

---

## Run it locally

```bash
npm install
npm run dev      # → http://localhost:5173
```

Build a production bundle:

```bash
npm run build    # outputs to /dist
npm run preview  # preview the built site
```

You need Node 18+.

---

## Deploy to Netlify

**Option A — drag & drop (fastest)**
1. `npm run build`
2. Go to app.netlify.com → drag the `dist` folder onto the page. Done.

**Option B — connect a repo (recommended, auto-deploys)**
1. Push this folder to GitHub/GitLab.
2. Netlify → *Add new site* → *Import an existing project*.
3. Netlify reads `netlify.toml` automatically:
   - build command `npm run build`
   - publish directory `dist`
   - functions directory `netlify/functions`
4. Deploy. The included serverless function and SPA redirect work out of the box.

No environment variables are required to run. Everything renders from the bundled
data and saves your edits to the browser via `localStorage`.

---

## How the data works

The fitness numbers (readiness, HRV, training load, recent runs) and your training
zones were pulled live from **Garmin Connect + Strava on 18 Jun 2026** and bundled
into the app:

- `src/data/snapshot.js` — fitness signals + recent runs
- `src/data/zones.js` — your 7 pace zones + HR zones (single source of truth)
- `src/data/plan.js` — the full 12-week block; every session is generated here

To refresh the snapshot, either ask the coach (me) in chat to re-pull and hand you
updated files, or wire the live feed below.

---

## The Garmin zones feed

The **Zones** tab has a *Sync from Garmin* button. It tries these sources in order
and gracefully falls back, so it always does something sensible:

1. `VITE_ZONES_FEED_URL` — your own endpoint (set in Netlify env vars)
2. `/.netlify/functions/garmin-zones` — the bundled serverless function
3. `/zones.json` — the static snapshot in `public/`

**Out of the box** the button reads the bundled snapshot. **To make it pull live
from Garmin:** open `netlify/functions/garmin-zones.js` and complete the
`fetchLiveZones()` function with a call to your Garmin source (a small
`python-garminconnect` worker, an exported JSON in object storage, or a third-party
API), then add any secrets as Netlify environment variables. There's a worked
example and a `mps → mm:ss` pace converter already in the file.

You can also just **edit zones by hand** in the Zones tab any time — edits persist
locally and immediately reshape every pace in the plan.

> Why a function instead of calling Garmin from the browser? Garmin has no public
> browser-callable zones API, and credentials must never live in front-end code.
> The serverless function keeps secrets server-side and returns only finished
> zone numbers.

---

## What's inside

| Tab | What it does |
|-----|--------------|
| **Today** | The prescribed session in full + this morning's readiness instrument |
| **This week** | Editable 7-day strip — tap any day to adjust or mark done |
| **The plan** | The whole 12-week block; expand a week, expand a session for the full breakdown |
| **Fitness** | VO₂, HRV trend, training load, last long-run stream, race predictions |
| **Zones** | Your 7 pace zones + HR zones, editable, with the Garmin sync feed |
| **Coach** | The philosophy behind the block |
| **Re-route** | Adaptive actions when life happens — reshapes the week, protects the long run |

---

## Project structure

```
waypoint/
├── index.html                 fonts + root
├── netlify.toml               build, publish, functions, SPA redirect
├── tailwind.config.js         the Sedona palette + fonts
├── public/
│   ├── favicon.svg
│   └── zones.json             static zones feed fallback
├── netlify/functions/
│   └── garmin-zones.js        zones feed endpoint (wire Garmin here)
└── src/
    ├── App.jsx                layout + routing
    ├── data/                  zones · snapshot · plan generator
    ├── lib/                   storage · utils · zones feed client
    ├── state/useWaypoint.js   app state (plan + overrides + log + zones)
    └── components/            sidebar · topbar · charts · pages · modal
```

The plan is generated in `src/data/plan.js` — edit the weekly blueprints (`WB`) or
the threshold/tempo library (`Q`) there and every tab updates automatically.

---

## The block at a glance

Threshold/tempo-led on a deep aerobic base, with weekend back-to-backs for ultra
durability. Phases: Base → Recovery → Build → Recovery → Peak → Sharpen → Taper →
Race. Peak week is ~97 km with a 32 km long run + 13 km back-to-back. Every session
specifies warm-up, main set, paces (from your zones), goal elevation and its purpose.

Built around your zones: **Threshold 5:45–5:55** is the engine; everything else
supports it.

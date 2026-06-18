// Safe localStorage wrapper. Falls back to an in-memory store if storage is
// unavailable (private mode, SSR, etc.) so the app never throws.

const mem = {}
const ok = (() => {
  try {
    const k = '__wp_test__'
    window.localStorage.setItem(k, '1')
    window.localStorage.removeItem(k)
    return true
  } catch {
    return false
  }
})()

export function load(key, fallback) {
  try {
    const raw = ok ? window.localStorage.getItem(key) : mem[key]
    return raw ? JSON.parse(raw) : fallback
  } catch {
    return fallback
  }
}

export function save(key, value) {
  const raw = JSON.stringify(value)
  try {
    if (ok) window.localStorage.setItem(key, raw)
    else mem[key] = raw
  } catch {
    mem[key] = raw
  }
}

export function remove(key) {
  try {
    if (ok) window.localStorage.removeItem(key)
    else delete mem[key]
  } catch {
    delete mem[key]
  }
}

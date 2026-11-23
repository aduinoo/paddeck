// Theme engine: built-in presets + fully custom colours, applied as CSS variables.
import type { Theme } from './types'

export interface ThemeColors { accent: string; accent2: string; bg: string; panel: string; button: string; text: string; border: string; selected: string }

export const PRESETS: Record<string, { label: string; colors: ThemeColors }> = {
  dark: { label: 'Dark', colors: { accent: '#7c5cff', accent2: '#38bdf8', bg: '#07070d', panel: '#121219', button: '#1b1b24', text: '#f4f4f8', border: '#24242e', selected: '#7c5cff' } },
  light: { label: 'Light', colors: { accent: '#6d4aff', accent2: '#0ea5e9', bg: '#eef0f6', panel: '#ffffff', button: '#f4f5fa', text: '#12131a', border: '#e1e3ec', selected: '#6d4aff' } },
  midnight: { label: 'Midnight', colors: { accent: '#3b82f6', accent2: '#22d3ee', bg: '#0b1220', panel: '#111a2e', button: '#18233b', text: '#e2e8f0', border: '#1e2a44', selected: '#3b82f6' } },
  amoled: { label: 'AMOLED', colors: { accent: '#01b6be', accent2: '#a3e635', bg: '#000000', panel: '#0a0a0a', button: '#141414', text: '#ffffff', border: '#1f1f1f', selected: '#01b6be' } },
  minimal: { label: 'Minimal', colors: { accent: '#f97316', accent2: '#facc15', bg: '#111111', panel: '#181818', button: '#222222', text: '#ededed', border: '#2a2a2a', selected: '#f97316' } },
}

const hexRe = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i
export const isHex = (v: string) => hexRe.test(v.trim())
export function normHex(v: string) {
  let s = v.trim(); if (!s.startsWith('#')) s = '#' + s
  if (/^#[0-9a-f]{3}$/i.test(s)) s = '#' + s.slice(1).split('').map((c) => c + c).join('')
  return s.toLowerCase()
}
function rgb(hex: string) { const h = normHex(hex).slice(1); return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) }
export function luminance(hex: string) {
  const [r, g, b] = rgb(hex).map((v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4 })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
export const readableOn = (hex: string) => (isHex(hex) && luminance(hex) > 0.45 ? '#0b0b12' : '#ffffff')

// Old (1.x) themes only had mode + accent: derive full colours from them.
export function themeColors(t?: Theme | null): ThemeColors {
  const anyT = (t || {}) as any
  if (anyT.colors) return { ...PRESETS.dark.colors, ...anyT.colors }
  const base = PRESETS[anyT.preset] || (anyT.mode === 'light' ? PRESETS.light : PRESETS.dark)
  return { ...base.colors, ...(anyT.accent ? { accent: anyT.accent, selected: anyT.accent } : {}) }
}

export function applyTheme(t: Theme | null | undefined) {
  if (!t) return
  const c = themeColors(t)
  const r = document.documentElement
  const light = luminance(c.bg) > 0.4
  r.dataset.theme = light ? 'light' : 'dark'
  const v = (k: string, val: string) => r.style.setProperty(k, val)
  v('--accent', c.accent); v('--accent-2', c.accent2); v('--selected', c.selected); v('--on-accent', readableOn(c.accent)); v('--on-selected', readableOn(c.selected))
  v('--bg', c.bg); v('--surface', `color-mix(in oklab, ${c.panel} ${light ? 82 : 78}%, transparent)`); v('--surface-solid', c.panel)
  v('--surface-2', c.button); v('--ink', c.text)
  v('--ink-2', `color-mix(in oklab, ${c.text} 68%, ${c.bg})`); v('--ink-3', `color-mix(in oklab, ${c.text} 45%, ${c.bg})`)
  v('--line', c.border)
  v('--radius', `${t.radius}px`); v('--gap', `${t.gap}px`)
  v('--font-sans', `'${t.font === 'Inter' ? 'Inter Variable' : t.font}', ui-sans-serif, system-ui, sans-serif`)
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', c.bg)
}

// CSS background for a deck button: solid, or gradient when a second colour is set.
export function buttonBackground(bg?: string, bg2?: string, angle = 160) {
  if (!bg) return undefined
  if (bg2) return `linear-gradient(${angle}deg, ${bg}, ${bg2})`
  return `linear-gradient(160deg, color-mix(in oklab, ${bg} 100%, white 8%), ${bg})`
}

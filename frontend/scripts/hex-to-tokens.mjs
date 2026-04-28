#!/usr/bin/env node
/* Replace hardcoded hex colors in JSX with design tokens.
 *
 * Strategy:
 *   1. 8-char hex (#RRGGBBAA)  → color-mix(in srgb, var(--token) <pct>%, transparent)
 *   2. 6-char hex used in `xxx + 'NN'` concatenation  → color-mix(...)
 *   3. 6-char hex used in `'xxx' + 'NN'` (literal-literal concat) → color-mix(...)
 *   4. 6-char hex standalone   → var(--token)
 *   5. 3-char hex standalone   → var(--token)
 *
 * Built to be idempotent — running twice produces the same output.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const srcDir = path.resolve(__dirname, '../src')

// ── Token map: hex (uppercase, 6-char) → CSS variable ─────────
const HEX_TO_TOKEN = {
  // Brand
  '#0A84FF': 'var(--accent)',
  '#9B6BFF': 'var(--accent-2)',
  '#7C6FFF': 'var(--accent-2)',
  '#BF5AF2': 'var(--purple)',
  '#A855F7': 'var(--purple)',
  // Semantic — danger/red family
  '#FF453A': 'var(--danger)',
  '#FF4444': 'var(--danger)',
  '#FF6B6B': 'var(--danger)',
  '#FF9999': 'var(--danger)',
  '#FF6B8A': 'var(--danger)',
  '#E1395F': 'var(--danger)',
  '#D44000': 'var(--danger)',
  // Semantic — success/green family
  '#30D158': 'var(--success)',
  '#00B864': 'var(--success)',
  '#006B3C': 'var(--success)',
  '#5EE9B5': 'var(--success)',
  '#5EE9DD': 'var(--success)',
  // Semantic — warning/yellow/orange family
  '#FFD60A': 'var(--warning)',
  '#FF9F0A': 'var(--warning)',
  '#FFA84A': 'var(--warning)',
  '#FFB84D': 'var(--warning)',
  '#FFC94A': 'var(--warning)',
  '#FFC72C': 'var(--warning)',
  '#FF6B2B': 'var(--warning)',
  '#FF6B00': 'var(--warning)',
  // Semantic — info/cyan family
  '#40C8E0': 'var(--info)',
  '#06B6D4': 'var(--info)',
  // Pure white/black — keep as-is for use on accent backgrounds
  '#FFFFFF': '#fff',
  // Grayscale → text tokens
  '#F5F5F7': 'var(--text-primary)',
  '#F0F0F8': 'var(--text-primary)',
  '#F0F0F4': 'var(--text-primary)',
  '#F0F0F6': 'var(--text-primary)',
  '#FAFAFA': 'var(--text-primary)',
  '#F9F9F9': 'var(--text-primary)',
  '#FDFDFD': 'var(--text-primary)',
  '#F5F5F5': 'var(--text-primary)',
  '#F0F0F0': 'var(--text-primary)',
  '#E2E2E8': 'var(--text-body)',
  '#EAEAEA': 'var(--text-body)',
  // Grayscale → surfaces & borders (dark-theme defaults)
  '#3A3A4A': 'var(--border-strong)',
  '#2A2A35': 'var(--border-input)',
  '#252530': 'var(--border)',
  '#1F1F2A': 'var(--border)',
  '#1E1E2A': 'var(--border)',
  '#1A2235': 'var(--bg-card-deep)',
  '#1E2D40': 'var(--bg-card-deep)',
  '#1A1A22': 'var(--bg-input)',
  '#1A1A24': 'var(--bg-input)',
  '#16161E': 'var(--bg-card-deep)',
  '#14141E': 'var(--bg-card)',
  '#13131A': 'var(--bg-card)',
  '#12121E': 'var(--bg-card)',
  '#111118': 'var(--bg-card)',
  '#0E0E16': 'var(--bg-app)',
  '#0B0B14': 'var(--bg-app)',
}

// ── 3-char hex map ────────────────────────────────────────────
const HEX3_TO_TOKEN = {
  '#FFF': '#fff',
  '#000': '#000',
  '#EEE': 'var(--text-body)',
  '#CCC': 'var(--text-body)',
  '#AAA': 'var(--text-muted)',
  '#999': 'var(--text-muted)',
  '#888': 'var(--text-faint)',
  '#777': 'var(--text-faint)',
  '#666': 'var(--text-faint)',
  '#555': 'var(--text-dim)',
  '#444': 'var(--text-dim)',
  '#333': 'var(--border-strong)',
  '#222': 'var(--border-input)',
  '#111': 'var(--bg-card)',
}

// ── Rebuild lookup tables in upper-case for O(1) match ────────
const upper = obj => Object.fromEntries(Object.entries(obj).map(([k, v]) => [k.toUpperCase(), v]))
const HEX6 = upper(HEX_TO_TOKEN)
const HEX3 = upper(HEX3_TO_TOKEN)

// ── 8-char alpha hex (e.g. "#FF453A30") → color-mix ───────────
// pct = round(alpha / 255 * 100)
function alphaToPct(aHex) {
  const v = parseInt(aHex, 16)
  return Math.max(1, Math.round((v / 255) * 100))
}

function tokenFor6(hex6) {
  return HEX6[hex6.toUpperCase()] || null
}

// ── Per-line replacement passes ───────────────────────────────
function replaceLine(line) {
  let out = line

  // Pass A: 8-char hex → color-mix(...)
  out = out.replace(/#([0-9A-Fa-f]{6})([0-9A-Fa-f]{2})\b/g, (m, rgb, a) => {
    const tok = tokenFor6('#' + rgb)
    if (!tok) return m // no mapping → leave as-is
    if (tok === '#fff' || tok === '#000') return m
    const pct = alphaToPct(a)
    return `color-mix(in srgb, ${tok} ${pct}%, transparent)`
  })

  // Pass B: literal-literal concat: '#XXXXXX' + 'YY'  →  color-mix(...)
  // Catches patterns like   '#FF453A' + '30'   or   "#FF453A"+"30"
  out = out.replace(/(['"])(#[0-9A-Fa-f]{6})\1\s*\+\s*(['"])([0-9A-Fa-f]{2})\3/g, (m, q1, hex, q2, a) => {
    const tok = tokenFor6(hex)
    if (!tok) return m
    if (tok === '#fff' || tok === '#000') return m
    const pct = alphaToPct(a)
    return `'color-mix(in srgb, ${tok} ${pct}%, transparent)'`
  })

  // Pass C: identifier + 'NN' alpha concat (e.g.  m.c + '14',  roleColor + '40')
  //         → color-mix(in srgb, ${ident} <pct>%, transparent) — wrapped in template literal
  // Only applies when there's a quoted 2-char alpha string after a `+`.
  // Skips already-string things; needs identifier (letters/dots/brackets) before the `+`.
  out = out.replace(/([A-Za-z_$][\w$.\[\]'"]*)\s*\+\s*(['"])([0-9A-Fa-f]{2})\2/g, (m, ident, q, a) => {
    // Don't touch strings that contain `var(` already
    const pct = alphaToPct(a)
    return '`color-mix(in srgb, ${' + ident + '} ' + pct + '%, transparent)`'
  })

  // Pass D: standalone 6-char hex → var(--token)
  // Wrap in single quotes if the surrounding context expected a string.
  out = out.replace(/(['"])(#[0-9A-Fa-f]{6})\1/g, (m, q, hex) => {
    const tok = tokenFor6(hex)
    if (!tok) return m
    return `'${tok}'`
  })

  // Pass E: bare 6-char hex inside CSS-style strings (like template literals or backticks)
  // e.g.  border: `1px solid #FF453A`
  out = out.replace(/#([0-9A-Fa-f]{6})\b/g, (m, rgb) => {
    const tok = tokenFor6('#' + rgb)
    return tok || m
  })

  // Pass F: standalone 3-char hex
  out = out.replace(/(['"])(#[0-9A-Fa-f]{3})\1/g, (m, q, hex) => {
    const tok = HEX3[hex.toUpperCase()]
    if (!tok) return m
    return `'${tok}'`
  })
  out = out.replace(/#([0-9A-Fa-f]{3})\b/g, (m, h) => {
    const tok = HEX3[('#' + h).toUpperCase()]
    return tok || m
  })

  return out
}

// ── Walk src/ and rewrite each .jsx file ──────────────────────
let totalFiles = 0, totalChanged = 0, totalReplacements = 0
function walk(dir) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name)
    if (ent.isDirectory()) walk(p)
    else if (ent.isFile() && ent.name.endsWith('.jsx')) processFile(p)
  }
}

function processFile(p) {
  totalFiles++
  const src = fs.readFileSync(p, 'utf8')
  const out = src.split('\n').map(replaceLine).join('\n')
  if (out !== src) {
    fs.writeFileSync(p, out)
    totalChanged++
    // count rough replacements: lines that differ
    const diffs = out.split('\n').filter((l, i) => l !== src.split('\n')[i]).length
    totalReplacements += diffs
    console.log(`  ✓ ${path.relative(srcDir, p)}`)
  }
}

console.log('Replacing hex colors with design tokens…\n')
walk(srcDir)
console.log(`\nDone. ${totalChanged}/${totalFiles} files updated · ~${totalReplacements} lines changed.`)

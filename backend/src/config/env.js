// Centralised env loader. Picks the right .env file based on NODE_ENV so the
// same code can run against local / staging / production without edits.
//
// Load order (later files override earlier ones — dotenv won't overwrite already-set vars):
//   1. .env.${NODE_ENV}.local   ← optional per-developer overrides (gitignored)
//   2. .env.${NODE_ENV}         ← committed environment-specific config
//   3. .env.local               ← optional shared local overrides (gitignored)
//   4. .env                     ← shared defaults (committed)
//
// NODE_ENV defaults to "development" when unset.

const path   = require('path')
const fs     = require('fs')
const dotenv = require('dotenv')

const NODE_ENV = process.env.NODE_ENV || 'development'

// Anchor on process.cwd() so this works whether run from src/ or the bundled dist/.
const root = process.cwd()

// Try all env files so it works regardless of naming (.env or .env.production).
// dotenv won't overwrite already-set vars, so earlier files take priority.
const files = [
  `.env.${NODE_ENV}.local`,
  `.env.${NODE_ENV}`,
  '.env.local',
  '.env',
  '.env.production',
]

for (const f of files) {
  dotenv.config({ path: path.join(root, f) })
}

process.env.NODE_ENV = NODE_ENV

module.exports = { NODE_ENV }

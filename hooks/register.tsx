import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import { STRINGS, resolveLang } from './i18n'
import type { Lang } from './i18n'

import type { Buddy, BuddyStats, Mood, Quip, Rarity, Save, Soul } from '../types'
import {
  EGG,
  EYE_STYLES,
  HIDDEN_RATE,
  HIDDEN_SPECIES,
  INSPIRATIONS,
  RARITY_COLOR,
  RARITY_RATES,
  RARITY_STAT_RANGE,
  SHINY_COLORS,
  SHINY_RATE,
  SPECIES,
  STAT_NAMES,
  TRAITS,
  eyeLabel,
  eyeStyleOf,
  fixedPersonaOf,
  inspirationText,
  renderArt,
  speciesDesc,
  speciesLabel,
  speciesOf,
  starsOf,
  traitText,
} from './species'

/** 目前的語言：session.start 依設定決定 */
let lang: Lang = 'en'
const T = () => STRINGS[lang]

const save = atom({ plugin: 'terminal-hatchling', key: 'save' } as const, null, { shape: 'bound-1' })
const quip = atom({ plugin: 'terminal-hatchling', key: 'quip' } as const, null, { shape: 'quip-1' })
const hatchTicks = atom({ plugin: 'terminal-hatchling', key: 'hatchTicks' } as const, 0)
const petTicks = atom({ plugin: 'terminal-hatchling', key: 'petTicks' } as const, 0)
const mood = atom({ plugin: 'terminal-hatchling', key: 'mood' } as const, 'idle')
const frame = atom({ plugin: 'terminal-hatchling', key: 'frame' } as const, 0)

const STORE_KEY = 'buddy.bound.v1'
const SOUL_MODEL = 'haiku'
const SOUL_TIMEOUT_MS = 30_000
/** 人設格式的版本：改寫法時加一，舊人設會重寫 */
const SOUL_VERSION = 4
const HATCH_TICKS = 6
const TICK_MS = 500
const MIN_ANSWER_CHARS = 80
const COOLDOWN_MS = 45_000
const MOODS: Mood[] = ['idle', 'busy', 'happy', 'worried', 'sleepy']
const MOOD_EYES: Partial<Record<Mood, string>> = { happy: '^ ^', worried: '; ;', sleepy: 'u u' }
const CALL_MODEL = 'haiku'
const SLEEP_AFTER_MS = 5 * 60_000
const PET_TICKS = 6
const HEART_FRAMES = ['   ♥   ', '  ♥ ♥  ', ' ♥ ♥ ♥ ', '♥  ♥  ♥', ' ♥   ♥ ', '   ♥   ']
const ZZZ_FRAMES = ['     z ', '    z Z', '   z Z z']
const TEST_COMMAND = /\b(test|tests|pytest|jest|vitest|mocha|rspec|go test|cargo test|npm t|phpunit)\b/i
const TEST_FAILED = /\b(fail(ed|ing|ures?)?|errors?)\b|✗|✕/i
const BIG_EDIT_LINES = 80

// ---------- 由種子決定一切（FNV-1a 雜湊 + mulberry32） ----------

function hash(text: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h >>> 0
}

function seeded(seed: string): () => number {
  let a = hash(`buddy:${seed}`)
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 2 ** 32
  }
}

/** ascensions：滿級升階的次數，每次星數 +1（最多 5 星）；屬性用同一組亂數、依新星數的範圍重算 */
export function deriveBuddy(seed: string, ascensions = 0): Buddy {
  const rnd = seeded(seed)
  const pick = <T,>(list: readonly T[]): T => list[Math.floor(rnd() * list.length)] ?? list[0]!

  // 物種和星數各自獨立：任何動物都可能是 5 星
  const picked = pick(SPECIES).id
  // 隱藏物種用另一組亂數判定，其他結果完全不受影響
  const species = seeded(`${seed}:hidden`)() < HIDDEN_RATE ? HIDDEN_SPECIES[0]!.id : picked
  let r = rnd()
  let rarity: Rarity = 1
  for (const tier of [5, 4, 3, 2] as const) {
    if (r < RARITY_RATES[tier]) {
      rarity = tier
      break
    }
    r -= RARITY_RATES[tier]
  }
  rarity = Math.min(5, rarity + ascensions) as Rarity
  const isShiny = rnd() < SHINY_RATE
  const [lo, hi] = RARITY_STAT_RANGE[rarity]
  const stats = {} as BuddyStats
  for (const k of STAT_NAMES) stats[k] = lo + Math.floor(rnd() * (hi - lo + 1))
  // 一個強項、一個弱項，個性從這兩個極端長出來
  // 強項一定是最高、弱項一定是最低（各比其他三項高或低 20，受 1～100 的上下限限制）
  const peak = pick(STAT_NAMES)
  const dump = pick(STAT_NAMES.filter(k => k !== peak))
  const rest = STAT_NAMES.filter(k => k !== peak && k !== dump).map(k => stats[k])
  stats[peak] = Math.min(100, Math.max(...rest, stats[peak]) + 20)
  stats[dump] = Math.max(1, Math.min(...rest, stats[dump]) - 20)
  // 只存位置，文字依語言取（和 pick 一樣只用一次亂數，舊種子結果不變）
  const trait = Math.floor(rnd() * TRAITS.length)
  const eyeStyle = pick(EYE_STYLES).id
  return { species, rarity, isShiny, stats, trait, eyeStyle }
}

function randomSeed(): string {
  try {
    const a = new Uint32Array(4)
    crypto.getRandomValues(a)
    return Array.from(a, n => n.toString(16).padStart(8, '0')).join('')
  } catch {
    return `${Date.now().toString(16)}${Math.random().toString(16).slice(2)}`
  }
}

function isSave(v: unknown): v is Save {
  return typeof v === 'object' && v !== null && typeof (v as Save).seed === 'string' && typeof (v as Save).xp === 'number'
}

export const MAX_LEVEL = 10

/** 每多一顆星，升級需要的經驗值 ×2：1 星滿級要 243，2 星 486，3 星 972，4 星 1944 */
export function xpScale(rarity: Rarity): number {
  return 2 ** (rarity - 1)
}

export function level(xp: number, rarity: Rarity = 1): number {
  return Math.min(MAX_LEVEL, 1 + Math.floor(Math.sqrt(xp / (3 * xpScale(rarity)))))
}

function levelOf(s: Save): number {
  return level(s.xp, buddyOf(s).rarity)
}

function buddyOf(s: Save): Buddy {
  return deriveBuddy(s.seed, s.ascensions ?? 0)
}

/** 加經驗值；滿級且還沒到 5 星就升階：星數 +1、經驗值歸零 */
export function addXp(s: Save, n: number): { next: Save; promoted: boolean } {
  const xp = s.xp + n
  const rarity = buddyOf(s).rarity
  if (rarity < 5 && level(xp, rarity) >= MAX_LEVEL) {
    return { next: { ...s, xp: 0, ascensions: (s.ascensions ?? 0) + 1 }, promoted: true }
  }
  return { next: { ...s, xp }, promoted: false }
}

function levelText(s: Save): string {
  return levelOf(s) >= MAX_LEVEL ? `Lv.${T().maxLevel}` : `Lv.${levelOf(s)}`
}

function nameOf(s: Save, b: Buddy): string {
  return s.name ?? s.soul?.name ?? speciesLabel(speciesOf(b.species), lang)
}

function rarityTag(b: Buddy): string {
  return `${b.isShiny ? `✦${T().shiny} ` : ''}${starsOf(b.rarity)} ${T().rarity[b.rarity]}`
}

/** 由種子挑 4 個靈感詞，回傳在清單裡的位置（兩種語言的清單一一對應） */
export function inspirationIndexes(seed: string): number[] {
  const rnd = seeded(`${seed}:inspire`)
  const pool = INSPIRATIONS.map((_, i) => i)
  const out: number[] = []
  while (out.length < 4 && pool.length > 0) out.push(pool.splice(Math.floor(rnd() * pool.length), 1)[0]!)
  return out
}

export function inspirationsOf(seed: string): string[] {
  return inspirationIndexes(seed).map(i => inspirationText(i, lang))
}

function soulRequest(b: Buddy, seed: string): { system: string; prompt: string } {
  const sp = speciesOf(b.species)
  const t = T()
  const stats = STAT_NAMES.map(k => `${t.stat[k]} ${b.stats[k]}/100`).join(t.listSep)
  const sorted = STAT_NAMES.slice().sort((x, y) => b.stats[y] - b.stats[x])
  const high = sorted[0]!
  const low = sorted[sorted.length - 1]!
  return {
    system: t.soulSystem,
    prompt: t.soulPrompt({
      rarity: `${starsOf(b.rarity)} ${t.rarity[b.rarity]}`,
      weird: t.weirdness[b.rarity],
      shiny: b.isShiny,
      species: speciesLabel(sp, lang),
      desc: speciesDesc(sp, lang),
      stats,
      high: `${t.stat[high]} ${b.stats[high]}`,
      low: `${t.stat[low]} ${b.stats[low]}`,
      words: [...inspirationsOf(seed), traitText(b.trait, lang)].join(t.listSep),
    }),
  }
}

/** 太長時退回到上限內最後一個句號、逗號或空白，不切在字中間 */
export function trimAtBoundary(text: string, max: number): string {
  if (text.length <= max) return text
  const head = text.slice(0, max)
  const cut = Math.max(...['。', '！', '？', '. ', '! ', '? '].map(p => head.lastIndexOf(p)))
  if (cut >= max * 0.5) return head.slice(0, cut + 1).trim()
  const soft = Math.max(...['，', '、', '；', ', ', '; ', ' '].map(p => head.lastIndexOf(p)))
  return `${(soft >= max * 0.5 ? head.slice(0, soft) : head).replace(/[，、；,;\s]+$/, '')}…`
}

export function parseSoul(text: string): Omit<Soul, 'species'> | null {
  const m = text.match(/\{[\s\S]*\}/)
  if (!m) return null
  try {
    const v = JSON.parse(m[0]) as { name?: unknown; persona?: unknown }
    const name = typeof v.name === 'string' ? v.name.trim().slice(0, 12) : ''
    const persona = typeof v.persona === 'string' ? trimAtBoundary(v.persona.trim(), T().personaMax) : ''
    return name && persona ? { name, persona } : null
  } catch {
    return null
  }
}

function card(s: Save): string {
  const b = buddyOf(s)
  const sp = speciesOf(b.species)
  const t = T()
  const stats = STAT_NAMES.map(
    k => `${t.stat[k]} ${'█'.repeat(Math.round(b.stats[k] / 10)).padEnd(10, '░')} ${b.stats[k]}`,
  )
  return [
    `${nameOf(s, b)} (${speciesLabel(sp, lang)}) ${rarityTag(b)}  ${levelText(s)}`,
    `${t.cardTrait}: ${traitText(b.trait, lang)}`,
    `${t.cardEyes}: ${eyeLabel(b.eyeStyle, lang)}`,
    ...stats,
    ...(s.soul ? [`${t.cardPersona}: ${s.soul.persona}`] : []),
    `${t.cardPets(s.pets)}${s.ascensions ? ` | ${t.cardAscensions(s.ascensions)}` : ''} | ${s.seedSource === 'git' ? t.bindGit : t.bindRandom}`,
  ].join('\n')
}

function persona(s: Save, ev?: BuddyEvent): string {
  const b = buddyOf(s)
  const sp = speciesOf(b.species)
  const t = T()
  return [
    ...t.forkPersona({
      name: nameOf(s, b),
      desc: speciesDesc(sp, lang),
      rarity: `${starsOf(b.rarity)} ${t.rarity[b.rarity]}`,
      persona: s.soul?.persona ?? null,
      trait: traitText(b.trait, lang),
      sass: b.stats.sass,
      mayhem: b.stats.mayhem,
    }),
    ...(ev ? t.forkEvent(t.event[ev.kind], ev.detail) : [t.forkSkip]),
    t.formatLine,
  ].join('\n')
}

export function parseQuip(text: string): Omit<Quip, 'at'> | null {
  const line = text.trim().split('\n').pop()?.trim() ?? ''
  if (!line || line.toUpperCase().startsWith('SKIP')) return null
  const [head, ...rest] = line.split('|')
  const m = MOODS.find(x => x === (head ?? '').trim().toLowerCase())
  const body = (m ? rest.join('|') : line).trim().slice(0, T().quipMax)
  return body ? { text: body, mood: m ?? 'idle' } : null
}

// ---------- 存檔 ----------

/** 讀存檔；還沒孵過就是 null（第一次 /buddy 才孵） */
async function load($: EngineInterface): Promise<Save | null> {
  const cur = await read($, save)
  if (cur) return cur
  const stored = await $.store.get(STORE_KEY)
  if (!isSave(stored)) return null
  await update($, save, () => stored)
  return stored
}

async function commit($: EngineInterface, s: Save): Promise<void> {
  await update($, save, () => s)
  await $.store.set(STORE_KEY, s)
}

async function say($: EngineInterface, text: string, m: Mood): Promise<void> {
  const at = await $.clock.now()
  await update($, quip, () => ({ text, mood: m, at }))
  await update($, mood, () => m)
}

async function writeSoul($: EngineInterface, seed: string): Promise<void> {
  const before = await read($, save)
  const b = deriveBuddy(seed, before?.seed === seed ? (before.ascensions ?? 0) : 0)
  const prev = before?.seed === seed ? before.soul : null
  // 同一隻（物種沒變）只是換語言或改寫法：拿原本的名字和個性去改寫，保留升階累積的怪癖
  const isPreserve = !!prev && prev.species === b.species
  const req = isPreserve
    ? {
        system: T().preserveSystem,
        prompt: T().preservePrompt({ name: prev.name, species: speciesLabel(speciesOf(b.species), lang), persona: prev.persona }),
      }
    : soulRequest(b, seed)
  const r = await $.model.complete({ model: SOUL_MODEL, ...req, maxTokens: 300, timeoutMs: SOUL_TIMEOUT_MS })
  const parsed = r.isAnswered ? parseSoul(r.text) : null
  const sp = speciesOf(b.species)
  const fixed = fixedPersonaOf(sp, lang)
  // 固定個性的物種：個性一律用固定的那句；Haiku 失敗時名字用物種名
  const soul = fixed
    ? { name: parsed?.name ?? (isPreserve ? prev.name : speciesLabel(sp, lang)), persona: fixed }
    : parsed
  const cur = await read($, save)
  // 孵化期間換了種子就丟掉這份
  if (!cur || cur.seed !== seed) return
  if (!soul) {
    // 重寫失敗時保留原本的設定，不要清掉
    if (!isPreserve) await commit($, { ...cur, soul: null })
    return
  }
  // 語言沒變時名字一字不改
  const name = isPreserve && (prev.lang ?? 'zh-TW') === lang ? prev.name : soul.name
  await commit($, { ...cur, soul: { ...soul, name, species: b.species, v: SOUL_VERSION, lang } })
}

let soulPendingFor: string | null = null

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(digest), n => n.toString(16).padStart(2, '0')).join('')
}

/** 用 git 全域 email 當種子：只存雜湊，email 本身不存、不送出 */
async function gitSeed($: EngineInterface): Promise<string | null> {
  for (const argv of [['git', 'config', '--global', 'user.email'], ['git', 'config', 'user.email']]) {
    try {
      const r = await $.process.run(argv, { timeoutMs: 5000 })
      const email = r.stdout.trim().toLowerCase()
      if (r.exitCode === 0 && email.includes('@')) return `git:${await sha256Hex(`buddy-email:${email}`)}`
    } catch {
      // 沒裝 git 或跑不起來：改用下一個或隨機種子
    }
  }
  return null
}

async function hatch($: EngineInterface): Promise<Save> {
  const fromGit = await gitSeed($)
  const s: Save = {
    seed: fromGit ?? randomSeed(),
    seedSource: fromGit ? 'git' : 'random',
    soul: null,
    name: null,
    xp: 0,
    pets: 0,
    isHidden: false,
  }
  await commit($, s)
  await update($, quip, () => null)
  await update($, hatchTicks, () => HATCH_TICKS)
  hatchSoul($, s.seed)
  return s
}

function hatchSoul($: EngineInterface, seed: string): void {
  soulPendingFor = seed
  $.clock.after(0, async () => {
    try {
      await writeSoul($, seed)
    } finally {
      if (soulPendingFor === seed) soulPendingFor = null
    }
  })
}

export function isCalled(text: string, name: string): boolean {
  return name.length >= 2 && text.toLowerCase().includes(name.toLowerCase())
}

async function replyToCall($: EngineInterface, text: string): Promise<void> {
  const s = await read($, save)
  if (!s) return
  const b = buddyOf(s)
  const sp = speciesOf(b.species)
  const t = T()
  const r = await $.model.complete({
    model: CALL_MODEL,
    system: [
      ...t.callSystem({
        name: nameOf(s, b),
        desc: speciesDesc(sp, lang),
        persona: s.soul?.persona ?? null,
        trait: traitText(b.trait, lang),
      }),
      t.formatLine,
    ].join('\n'),
    prompt: t.callPrompt(text.slice(0, 500)),
    maxTokens: 200,
    timeoutMs: 20_000,
  })
  if (!r.isAnswered) return
  const q = parseQuip(r.text)
  if (q) await say($, q.text, q.mood)
}

export type BuddyEvent = { kind: 'error' | 'test-failed' | 'big-edit'; detail: string }

/** 從一次工具呼叫的結果判斷是否值得夥伴出聲 */
export function eventOf(tool: string, input: Record<string, unknown>, isError: boolean, text: string): BuddyEvent | null {
  const cmd = typeof input.command === 'string' ? input.command : ''
  if (tool === 'Bash' && TEST_COMMAND.test(cmd) && (isError || TEST_FAILED.test(text.slice(-2000)))) {
    return { kind: 'test-failed', detail: T().detailTest(cmd.slice(0, 200), text.slice(-800)) }
  }
  if (isError) return { kind: 'error', detail: T().detailError(tool, cmd.slice(0, 200), text.slice(0, 800)) }
  const body = typeof input.content === 'string' ? input.content : typeof input.new_string === 'string' ? input.new_string : ''
  const lines = body ? body.split('\n').length : 0
  if ((tool === 'Write' || tool === 'Edit') && lines >= BIG_EDIT_LINES) {
    return { kind: 'big-edit', detail: T().detailBigEdit(tool, String(input.file_path ?? ''), lines) }
  }
  return null
}

const EVENT_RANK: Record<BuddyEvent['kind'], number> = { 'big-edit': 1, 'error': 2, 'test-failed': 3 }

export function parseEvolved(text: string): string | null {
  const m = text.match(/\{[\s\S]*\}/)
  if (!m) return null
  try {
    const v = JSON.parse(m[0]) as { persona?: unknown }
    return typeof v.persona === 'string' && v.persona.trim() ? trimAtBoundary(v.persona.trim(), T().personaMax) : null
  } catch {
    return null
  }
}

/** 升階後在原本的個性上變怪；名字不變，失敗就保留原個性 */
async function evolvePersona($: EngineInterface): Promise<void> {
  const s = await read($, save)
  if (!s?.soul) return
  const b = buddyOf(s)
  // 固定個性的物種升階時不改個性
  if (fixedPersonaOf(speciesOf(b.species), lang)) return
  const t = T()
  const sorted = STAT_NAMES.slice().sort((x, y) => b.stats[y] - b.stats[x])
  const high = sorted[0]!
  const low = sorted[sorted.length - 1]!
  const r = await $.model.complete({
    model: SOUL_MODEL,
    system: t.evolveSystem,
    prompt: t.evolvePrompt({
      name: nameOf(s, b),
      species: speciesLabel(speciesOf(b.species), lang),
      persona: s.soul.persona,
      rarity: `${starsOf(b.rarity)} ${t.rarity[b.rarity]}`,
      weird: t.weirdness[b.rarity],
      high: `${t.stat[high]} ${b.stats[high]}`,
      low: `${t.stat[low]} ${b.stats[low]}`,
    }),
    maxTokens: 300,
    timeoutMs: SOUL_TIMEOUT_MS,
  })
  const persona = r.isAnswered ? parseEvolved(r.text) : null
  const cur = await read($, save)
  if (!persona || !cur?.soul || cur.seed !== s.seed) return
  await commit($, { ...cur, soul: { ...cur.soul, persona } })
}

async function announcePromotion($: EngineInterface, s: Save): Promise<void> {
  const b = buddyOf(s)
  await say($, T().promotedSay(nameOf(s, b), rarityTag(b)), 'happy')
  $.clock.after(0, () => evolvePersona($))
}

// ---------- hooks ----------

export const register: Register = (on, options) => {
  let commandName = 'buddy'
  let lastForkAt = -Infinity
  // 這一輪發生過最嚴重的事件，等 turn 結束時交給 fork 評論
  let pendingEvent: BuddyEvent | null = null
  let lastActiveAt = 0
  let isForking = false

  on('session.start', async ($, e, next) => {
    const settingsLanguage = await $.settings.read({ key: 'language' }).catch(() => undefined)
    const envLang = (await $.env.get('LC_ALL').catch(() => undefined)) || (await $.env.get('LANG').catch(() => undefined))
    lang = resolveLang((options as Record<string, unknown>).language, settingsLanguage, envLang)
    const r = await $.command.register({ name: 'buddy', description: T().commandDescription })
    commandName = r.command
    lastActiveAt = await $.clock.now()
    const s = await load($)
    // 物種表、人設寫法或語言改過時，舊人設對不上，重寫一份
    const isStale =
      !!s?.soul &&
      (s.soul.species !== buddyOf(s).species || s.soul.v !== SOUL_VERSION || (s.soul.lang ?? 'zh-TW') !== lang)
    if (s && (s.soul === undefined || s.soul === null || isStale)) hatchSoul($, s.seed)
    $.clock.every(TICK_MS, async () => {
      await update($, frame, f => (f + 1) % 10_000)
      if ((await read($, petTicks)) > 0) await update($, petTicks, n => Math.max(0, n - 1))
      const now = await $.clock.now()
      if (now - lastActiveAt > SLEEP_AFTER_MS && (await read($, mood)) !== 'sleepy') {
        await update($, mood, () => 'sleepy')
      }
      const left = await read($, hatchTicks)
      if (left <= 0) return
      // Haiku 還在寫人設時，蛋停在最後一格繼續晃
      if (left === 1 && soulPendingFor !== null) return
      await update($, hatchTicks, n => Math.max(0, n - 1))
      if (left === 1) {
        const s = await read($, save)
        if (!s) return
        const b = buddyOf(s)
        await say($, T().hatchedSay(nameOf(s, b), rarityTag(b)), 'happy')
      }
    })
    return next(e)
  })

  on('command.run', async ($, e, next) => {
    if (e.command !== commandName) return next(e)
    const sub = e.args.trim()
    const cur = await load($)

    if (sub === '') {
      if (!cur) {
        await hatch($)
        return { text: T().hatchText }
      }
      const s = { ...cur, isHidden: !cur.isHidden }
      await commit($, s)
      if (s.isHidden) return { text: T().hideText }
      lastActiveAt = await $.clock.now()
      return { text: T().back }
    }

    if (sub === 'card') {
      if (!cur) return { text: T().noBuddy }
      return { text: card(cur) }
    }

    if (sub === 'pet') {
      if (!cur) return { text: T().noBuddy }
      const { next: s, promoted } = addXp({ ...cur, pets: cur.pets + 1 }, 1)
      await commit($, s)
      const b = buddyOf(s)
      await update($, petTicks, () => PET_TICKS)
      lastActiveAt = await $.clock.now()
      if (promoted) await announcePromotion($, s)
      else await say($, T().petSay(nameOf(s, b)), 'happy')
      return { text: `${T().petted(nameOf(s, b), levelOf(s))}${promoted ? `\n${T().promotedSay(nameOf(s, b), rarityTag(b))}` : ''}` }
    }

    return { text: T().usage }
  }).catch(($, e, next) =>
    next.called || e.command !== commandName ? next(e) : { text: T().fallback },
  )

  on('prompt.submit', async ($, e, next) => {
    lastActiveAt = await $.clock.now()
    if ((await read($, mood)) === 'sleepy') await update($, mood, () => 'idle')
    const s = await read($, save)
    if (s && !s.isHidden && (await read($, hatchTicks)) === 0) {
      const name = nameOf(s, buddyOf(s))
      if (isCalled(e.text, name)) {
        // 被叫到了：回完這句，這輪結束時先不再評論
        lastForkAt = await $.clock.now()
        await update($, mood, () => 'happy')
        const text = e.text
        $.clock.after(0, () => replyToCall($, text))
      }
    }
    return next(e)
  }).catch(($, e, next) => next(e))

  on('tool.call', async ($, e, next) => {
    const r = await next(e)
    if (e.agentId !== undefined || 'deny' in r && r.deny !== undefined) return r
    const s = await read($, save)
    if (!s || s.isHidden || (await read($, hatchTicks)) > 0) return r
    const ev = eventOf(e.tool, e as unknown as Record<string, unknown>, r.isError === true, r.text ?? '')
    if (ev && (!pendingEvent || EVENT_RANK[ev.kind] >= EVENT_RANK[pendingEvent.kind])) {
      pendingEvent = ev
      if (ev.kind !== 'big-edit') await update($, mood, () => 'worried')
    }
    return r
  }).catch(($, e, next) => next(e))

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    if (e.agentId !== undefined) return result
    lastActiveAt = await $.clock.now()

    const loaded = await load($)
    if (!loaded) return result
    const { next: s, promoted } = addXp(loaded, 1)
    await commit($, s)
    if (promoted) {
      await announcePromotion($, s)
      // 升階這輪由升階訊息當主角，不再評論
      pendingEvent = null
      lastForkAt = await $.clock.now()
      return result
    }
    await update($, mood, () => (e.reason === 'answer' ? 'idle' : 'worried'))

    const ev = pendingEvent
    pendingEvent = null
    if (ev && e.reason === 'answer') await update($, mood, () => 'worried')

    const now = await $.clock.now()
    // 這輪出過事就一定評論；否則照長度與冷卻時間判斷
    const shouldFork =
      !s.isHidden &&
      !isForking &&
      e.reason === 'answer' &&
      (ev !== null || (e.answer.length >= MIN_ANSWER_CHARS && now - lastForkAt >= COOLDOWN_MS))
    if (!shouldFork) return result

    lastForkAt = now
    isForking = true
    // turn 結束後才跑旁支模型，不拖住主對話；這時對話紀錄已包含這輪發生的事。
    $.clock.after(0, async () => {
      try {
        const r = await $.model.fork({ prompt: persona(s, ev ?? undefined) })
        if (!r.isAnswered) return
        const q = parseQuip(r.text)
        if (q) await say($, q.text, q.mood)
      } finally {
        isForking = false
      }
    })
    return result
  })

  // /buddy（不帶參數或 card）的輸出畫成角色卡；文字版仍留在 text 給模型看
  on('ui.render', { component: 'CommandOutput' }, async ($, e, next) => {
    if (e.props.command !== commandName || e.props.isErrored) return next(e)
    const sub = e.props.args.trim()
    const isHatchRow = sub === '' && Object.values(STRINGS).some(x => e.props.text.startsWith(x.hatchText))
    if (!isHatchRow && sub !== 'card') return next(e)
    const s = await read($, save)
    if (!s) return next(e)

    const { Box, Text } = $.ui.resolve(e)
    const left = await read($, hatchTicks)
    if (left > 0) {
      const f = await read($, frame)
      return (
        <Box flexDirection="column" borderStyle="round" paddingX={2} paddingY={1} width={44}>
          <Text bold>{T().hatching}</Text>
          <Box flexDirection="column" marginY={1} paddingLeft={2}>
            {(EGG[Math.min(EGG.length - 1, HATCH_TICKS - left)] ?? EGG[0]!).map((l, i) => (
              <Text key={`egg${i}`} mono>
                {l}
              </Text>
            ))}
          </Box>
          <Text dimColor>{T().crack[f % 2] ?? ''}</Text>
        </Box>
      )
    }
    const b = buddyOf(s)
    const sp = speciesOf(b.species)
    const color = RARITY_COLOR[b.rarity]
    const art = renderArt(sp.art, eyeStyleOf(b.eyeStyle).eyes)
    const t = T()
    const persona =
      fixedPersonaOf(sp, lang) ?? s.soul?.persona ?? t.cardFallbackPersona(speciesDesc(sp, lang), traitText(b.trait, lang))

    return (
      <Box flexDirection="column" borderStyle="round" borderColor={color} paddingX={2} paddingY={1} width={44}>
        <Box flexDirection="row" justifyContent="space-between">
          <Text bold color={color}>
            {starsOf(b.rarity)} {t.rarity[b.rarity]}
            {b.isShiny ? ` ✦${t.shiny}` : ''}
          </Text>
          <Text color={color}>{speciesLabel(sp, lang)}</Text>
        </Box>
        <Box flexDirection="column" marginY={1} paddingLeft={2}>
          {art.map((l, i) => (
            <Text key={`c${i}`} mono color={color}>
              {l}
            </Text>
          ))}
        </Box>
        <Text bold>
          {nameOf(s, b)}
          <Text dimColor> {levelText(s)}</Text>
        </Text>
        <Box marginY={1}>
          <Text italic dimColor wrap="wrap">
            {lang === 'en' ? `"${persona}"` : `「${persona}」`}
          </Text>
        </Box>
        {STAT_NAMES.map(k => (
          <Text key={`st-${k}`} mono>
            {t.stat[k].padEnd(lang === 'en' ? 9 : 0, ' ')}{' '}
            <Text color={color}>{'█'.repeat(Math.round(b.stats[k] / 5))}</Text>
            <Text dimColor>{'░'.repeat(20 - Math.round(b.stats[k] / 5))}</Text>
            {' '}{String(b.stats[k]).padStart(3, ' ')}
          </Text>
        ))}
        <Box marginTop={1}>
          <Text dimColor>
            {eyeLabel(b.eyeStyle, lang)} · {t.cardPets(s.pets)}
          </Text>
        </Box>
      </Box>
    )
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const s = await read($, save)
    if (e.props.hasSurvey || !s || s.isHidden) return next(e)

    const { Box, Text } = $.ui.resolve(e)
    const f = await read($, frame)
    const left = await read($, hatchTicks)
    const b = buddyOf(s)

    let art: string[]
    let color: string
    let title: string
    let bubble: string
    let isDim = false
    let top = { text: ' ', color: 'white' }

    if (left > 0) {
      art = EGG[Math.min(EGG.length - 1, HATCH_TICKS - left)] ?? EGG[0]!
      color = 'white'
      title = T().hatching
      bubble = T().crack[f % 2] ?? ''
    } else {
      const m: Mood = e.props.isWorking ? 'busy' : await read($, mood)
      const base = eyeStyleOf(b.eyeStyle).eyes
      const eyes = m === 'idle' && f % 8 === 7 ? '- -' : (MOOD_EYES[m] ?? base)
      // 閒置時每隔一陣子左右晃一下
      const bob = m === 'idle' && f % 12 >= 6 && f % 12 < 8 ? ' ' : ''
      art = renderArt(speciesOf(b.species).art, eyes).map(l => bob + l)
      const pets = await read($, petTicks)
      top =
        pets > 0
          ? { text: HEART_FRAMES[(PET_TICKS - pets) % HEART_FRAMES.length] ?? '', color: 'red' }
          : m === 'sleepy'
            ? { text: ZZZ_FRAMES[f % ZZZ_FRAMES.length] ?? '', color: 'gray' }
            : { text: ' ', color: 'white' }
      color = b.isShiny ? (SHINY_COLORS[f % SHINY_COLORS.length] ?? 'white') : RARITY_COLOR[b.rarity]
      title = `${nameOf(s, b)} ${b.isShiny ? '✦' : ''}${starsOf(b.rarity)} ${levelText(s)}`
      const q = await read($, quip)
      bubble = q?.text ?? T().watching(nameOf(s, b))
      isDim = !q
    }

    return (
      <Box flexDirection="row">
        <Box flexDirection="column" marginRight={1}>
          <Text key="top" color={top.color}>
            {top.text}
          </Text>
          {art.map((l, i) => (
            <Text key={`a${i}`} color={color}>
              {l}
            </Text>
          ))}
        </Box>
        <Box flexDirection="column">
          <Text bold color={color}>
            {title}
          </Text>
          <Box borderStyle="round" paddingX={1}>
            <Text dimColor={isDim}>{bubble}</Text>
          </Box>
        </Box>
      </Box>
    )
  })
}

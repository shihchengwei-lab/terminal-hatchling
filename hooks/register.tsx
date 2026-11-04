import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Buddy, BuddyStats, Mood, Quip, Rarity, Save, Soul } from '../types'
import {
  EGG,
  EYE_STYLES,
  INSPIRATIONS,
  RARITY_COLOR,
  RARITY_LABEL,
  RARITY_RATES,
  RARITY_STAT_RANGE,
  SHINY_COLORS,
  SHINY_RATE,
  SPECIES,
  STAT_LABEL,
  STAT_NAMES,
  TRAITS,
  eyeStyleOf,
  speciesOf,
  starsOf,
  renderArt,
} from './species'

const save = atom({ plugin: 'buddy', key: 'save' } as const, null, { shape: 'bound-1' })
const quip = atom({ plugin: 'buddy', key: 'quip' } as const, null, { shape: 'quip-1' })
const hatchTicks = atom({ plugin: 'buddy', key: 'hatchTicks' } as const, 0)
const petTicks = atom({ plugin: 'buddy', key: 'petTicks' } as const, 0)
const mood = atom({ plugin: 'buddy', key: 'mood' } as const, 'idle')
const frame = atom({ plugin: 'buddy', key: 'frame' } as const, 0)

const STORE_KEY = 'buddy.bound.v1'
const SOUL_MODEL = 'haiku'
const SOUL_TIMEOUT_MS = 30_000
/** 人設格式的版本：改寫法時加一，舊人設會重寫 */
const SOUL_VERSION = 2
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

export function deriveBuddy(seed: string): Buddy {
  const rnd = seeded(seed)
  const pick = <T,>(list: readonly T[]): T => list[Math.floor(rnd() * list.length)] ?? list[0]!

  // 物種和星數各自獨立：任何動物都可能是 5 星
  const species = pick(SPECIES).id
  let r = rnd()
  let rarity: Rarity = 1
  for (const tier of [5, 4, 3, 2] as const) {
    if (r < RARITY_RATES[tier]) {
      rarity = tier
      break
    }
    r -= RARITY_RATES[tier]
  }
  const isShiny = rnd() < SHINY_RATE
  const [lo, hi] = RARITY_STAT_RANGE[rarity]
  const stats = {} as BuddyStats
  for (const k of STAT_NAMES) stats[k] = lo + Math.floor(rnd() * (hi - lo + 1))
  const peak = pick(STAT_NAMES)
  stats[peak] = Math.min(100, stats[peak] + 20)
  const trait = pick(TRAITS)
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

export function level(xp: number): number {
  return 1 + Math.floor(Math.sqrt(xp / 3))
}

function nameOf(s: Save, b: Buddy): string {
  return s.name ?? s.soul?.name ?? speciesOf(b.species).label
}

const RARITY_WEIRDNESS: Record<Rarity, string> = {
  1: '普通的小傢伙，只有一點點怪',
  2: '比一般的再怪一點',
  3: '怪得很具體，讓人記得住',
  4: '非常怪，有很鮮明的執念',
  5: '傳說級：真的很奇怪，奇怪到讓人愣一下',
}

export function inspirationsOf(seed: string): string[] {
  const rnd = seeded(`${seed}:inspire`)
  const pool = INSPIRATIONS.slice()
  const out: string[] = []
  while (out.length < 4 && pool.length > 0) out.push(pool.splice(Math.floor(rnd() * pool.length), 1)[0]!)
  return out
}

function soulRequest(b: Buddy, seed: string): { system: string; prompt: string } {
  const sp = speciesOf(b.species)
  const stats = STAT_NAMES.map(k => `${STAT_LABEL[k]} ${b.stats[k]}/100`).join('、')
  return {
    system: [
      '你負責發明「寫程式夥伴」：住在開發者終端機裡的小生物，偶爾會對他們的程式碼發表意見。',
      '根據稀有度、物種、屬性和幾個靈感詞，發明：',
      '1. 名字：一個詞，2 到 4 個中文字，好記、帶一點荒謬感，原創、不要用現有作品的角色名。',
      '2. 一句話個性：具體、好笑，包含一個會影響牠怎麼評論程式碼的怪癖。',
      '稀有度越高，越怪、越具體、越讓人記得住。',
      '用台灣繁體中文。只輸出 JSON：{"name":"…","persona":"…"}，不要其他文字。',
    ].join('\n'),
    prompt: [
      `稀有度：${starsOf(b.rarity)} ${RARITY_LABEL[b.rarity]}（${RARITY_WEIRDNESS[b.rarity]}）${b.isShiny ? '，閃光個體' : ''}`,
      `物種：${sp.label}（${sp.desc}）`,
      `屬性：${stats}`,
      `靈感詞：${inspirationsOf(seed).join('、')}、${b.trait}`,
    ].join('\n'),
  }
}

export function parseSoul(text: string): Omit<Soul, 'species'> | null {
  const m = text.match(/\{[\s\S]*\}/)
  if (!m) return null
  try {
    const v = JSON.parse(m[0]) as { name?: unknown; persona?: unknown }
    const name = typeof v.name === 'string' ? v.name.trim().slice(0, 12) : ''
    const persona = typeof v.persona === 'string' ? v.persona.trim().slice(0, 120) : ''
    return name && persona ? { name, persona } : null
  } catch {
    return null
  }
}

function card(s: Save): string {
  const b = deriveBuddy(s.seed)
  const sp = speciesOf(b.species)
  const stats = STAT_NAMES.map(
    k => `${STAT_LABEL[k]} ${'█'.repeat(Math.round(b.stats[k] / 10)).padEnd(10, '░')} ${b.stats[k]}`,
  )
  return [
    `${nameOf(s, b)}（${sp.label}）${b.isShiny ? '✦閃光 ' : ''}${starsOf(b.rarity)} ${RARITY_LABEL[b.rarity]}  Lv.${level(s.xp)}`,
    `個性：${b.trait}`,
    `眼睛：${eyeStyleOf(b.eyeStyle).label}`,
    ...stats,
    ...(s.soul ? [`人設：${s.soul.persona}`] : []),
    `被摸 ${s.pets} 次｜綁定：${s.seedSource === 'git' ? 'git email（換機器、同 email 是同一隻）' : '這台機器的隨機種子'}`,
  ].join('\n')
}

function persona(s: Save, ev?: BuddyEvent): string {
  const b = deriveBuddy(s.seed)
  const sp = speciesOf(b.species)
  return [
    '（這是一則旁支請求，與主對話無關，不要回覆主對話的使用者。）',
    `你現在扮演「${nameOf(s, b)}」：${sp.desc}，是使用者寫程式時坐在終端機角落的夥伴（${b.rarity} 星 ${RARITY_LABEL[b.rarity]}）。`,
    s.soul
      ? `人設：${s.soul.persona}`
      : `個性：${b.trait}。碎念程度 ${b.stats.chatter}/100、好奇心 ${b.stats.curiosity}/100。`,
    '你會注意主對話裡使用者可能漏看的重點（風險、待辦、沒驗證的假設），用角色口吻提醒。',
    '你沒有工具，不要想太久，立刻回答。',
    '讀完上面主對話的最後一輪，用台灣繁體中文寫一句不超過 40 字的話。',
    ...(ev
      ? [
          `這一輪${EVENT_LABEL[ev.kind]}，請優先針對這件事說（提醒、吐槽或安慰），不要輸出 SKIP。`,
          `參考細節：\n${ev.detail}`,
        ]
      : ['這輪沒什麼值得說的，就只輸出 SKIP。']),
    '只輸出一行，格式「心情|台詞」，心情只能是 idle、busy、happy、worried、sleepy 之一。',
  ].join('\n')
}

export function parseQuip(text: string): Omit<Quip, 'at'> | null {
  const line = text.trim().split('\n').pop()?.trim() ?? ''
  if (!line || line.toUpperCase().startsWith('SKIP')) return null
  const [head, ...rest] = line.split('|')
  const m = MOODS.find(x => x === (head ?? '').trim().toLowerCase())
  const body = (m ? rest.join('|') : line).trim().slice(0, 60)
  return body ? { text: body, mood: m ?? 'idle' } : null
}

const USAGE = '/buddy：第一次孵蛋，之後顯示或隱藏（隱藏時不評論）｜/buddy card：角色卡｜/buddy pet：摸摸'
const HATCH_TEXT = '一顆蛋開始孵化了'
const HIDE_TEXT = '夥伴躲起來了。隱藏時牠不會評論，也不會呼叫模型。'

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
  const b = deriveBuddy(seed)
  const req = soulRequest(b, seed)
  const r = await $.model.complete({ model: SOUL_MODEL, ...req, maxTokens: 300, timeoutMs: SOUL_TIMEOUT_MS })
  const soul = r.isAnswered ? parseSoul(r.text) : null
  const cur = await read($, save)
  // 孵化期間換了種子就丟掉這份
  if (!cur || cur.seed !== seed) return
  await commit($, { ...cur, soul: soul ? { ...soul, species: b.species, v: SOUL_VERSION } : null })
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
  const b = deriveBuddy(s.seed)
  const sp = speciesOf(b.species)
  const r = await $.model.complete({
    model: CALL_MODEL,
    system: [
      `你是「${nameOf(s, b)}」：${sp.desc}，使用者寫程式時坐在終端機角落的夥伴。`,
      s.soul ? `人設：${s.soul.persona}` : `個性：${b.trait}。`,
      '用台灣繁體中文回一句不超過 40 字的話。',
      '只輸出一行，格式「心情|台詞」，心情只能是 idle、busy、happy、worried、sleepy 之一。',
    ].join('\n'),
    prompt: `使用者在訊息裡叫了你，訊息是：\n${text.slice(0, 500)}`,
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
    return { kind: 'test-failed', detail: `指令：${cmd.slice(0, 200)}\n輸出結尾：${text.slice(-800)}` }
  }
  if (isError) return { kind: 'error', detail: `工具：${tool}${cmd ? `（${cmd.slice(0, 200)}）` : ''}\n錯誤：${text.slice(0, 800)}` }
  const body = typeof input.content === 'string' ? input.content : typeof input.new_string === 'string' ? input.new_string : ''
  const lines = body ? body.split('\n').length : 0
  if ((tool === 'Write' || tool === 'Edit') && lines >= BIG_EDIT_LINES) {
    return { kind: 'big-edit', detail: `${tool} ${String(input.file_path ?? '')}，一次寫了 ${lines} 行` }
  }
  return null
}

const EVENT_LABEL: Record<BuddyEvent['kind'], string> = {
  'error': '有工具出錯',
  'test-failed': '跑的測試失敗了',
  'big-edit': '一次改了很大一段程式碼',
}
const EVENT_RANK: Record<BuddyEvent['kind'], number> = { 'big-edit': 1, 'error': 2, 'test-failed': 3 }

// ---------- hooks ----------

export const register: Register = on => {
  let commandName = 'buddy'
  let lastForkAt = -Infinity
  // 這一輪發生過最嚴重的事件，等 turn 結束時交給 fork 評論
  let pendingEvent: BuddyEvent | null = null
  let lastActiveAt = 0
  let isForking = false

  on('session.start', async ($, e, next) => {
    const r = await $.command.register({
      name: 'buddy',
      description: '你的夥伴：第一次孵蛋，之後顯示或隱藏；/buddy card 角色卡；/buddy pet 摸摸',
    })
    commandName = r.command
    lastActiveAt = await $.clock.now()
    const s = await load($)
    // 物種表或人設寫法改過時，舊人設對不上，重寫一份
    const isStale = !!s?.soul && (s.soul.species !== deriveBuddy(s.seed).species || s.soul.v !== SOUL_VERSION)
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
        const b = deriveBuddy(s.seed)
        await say($, `${nameOf(s, b)} 孵出來了！【${b.isShiny ? '✦閃光 ' : ''}${starsOf(b.rarity)} ${RARITY_LABEL[b.rarity]}】`, 'happy')
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
        return { text: `${HATCH_TEXT}……` }
      }
      const s = { ...cur, isHidden: !cur.isHidden }
      await commit($, s)
      if (s.isHidden) return { text: HIDE_TEXT }
      lastActiveAt = await $.clock.now()
      return { text: '夥伴回來了。' }
    }

    if (sub === 'card') {
      if (!cur) return { text: '你還沒有夥伴。輸入 /buddy 孵一顆蛋。' }
      return { text: card(cur) }
    }

    if (sub === 'pet') {
      if (!cur) return { text: '你還沒有夥伴。輸入 /buddy 孵一顆蛋。' }
      const s = { ...cur, pets: cur.pets + 1, xp: cur.xp + 1 }
      await commit($, s)
      const b = deriveBuddy(s.seed)
      await say($, `${nameOf(s, b)} 開心地晃了晃。`, 'happy')
      await update($, petTicks, () => PET_TICKS)
      lastActiveAt = await $.clock.now()
      return { text: `你摸了摸 ${nameOf(s, b)}。Lv.${level(s.xp)}` }
    }

    return { text: USAGE }
  }).catch(($, e, next) =>
    next.called || e.command !== commandName ? next(e) : { text: '夥伴這次沒反應，再試一次。' },
  )

  on('prompt.submit', async ($, e, next) => {
    lastActiveAt = await $.clock.now()
    if ((await read($, mood)) === 'sleepy') await update($, mood, () => 'idle')
    const s = await read($, save)
    if (s && !s.isHidden && (await read($, hatchTicks)) === 0) {
      const name = nameOf(s, deriveBuddy(s.seed))
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
    const s = { ...loaded, xp: loaded.xp + 1 }
    await commit($, s)
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
    const isHatchRow = sub === '' && e.props.text.startsWith(HATCH_TEXT)
    if (!isHatchRow && sub !== 'card') return next(e)
    const s = await read($, save)
    if (!s) return next(e)

    const { Box, Text } = $.ui.resolve(e)
    const left = await read($, hatchTicks)
    if (left > 0) {
      const f = await read($, frame)
      return (
        <Box flexDirection="column" borderStyle="round" paddingX={2} paddingY={1} width={44}>
          <Text bold>孵化中…</Text>
          <Box flexDirection="column" marginY={1} paddingLeft={2}>
            {(EGG[Math.min(EGG.length - 1, HATCH_TICKS - left)] ?? EGG[0]!).map((l, i) => (
              <Text key={`egg${i}`} mono>
                {l}
              </Text>
            ))}
          </Box>
          <Text dimColor>{f % 2 ? '喀…' : '喀喀…'}</Text>
        </Box>
      )
    }
    const b = deriveBuddy(s.seed)
    const sp = speciesOf(b.species)
    const color = RARITY_COLOR[b.rarity]
    const art = renderArt(sp.art, eyeStyleOf(b.eyeStyle).eyes)
    const persona = s.soul?.persona ?? `${sp.desc}。個性${b.trait}。`

    return (
      <Box flexDirection="column" borderStyle="round" borderColor={color} paddingX={2} paddingY={1} width={44}>
        <Box flexDirection="row" justifyContent="space-between">
          <Text bold color={color}>
            {starsOf(b.rarity)} {RARITY_LABEL[b.rarity]}
            {b.isShiny ? ' ✦閃光' : ''}
          </Text>
          <Text color={color}>{sp.label}</Text>
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
          <Text dimColor> Lv.{level(s.xp)}</Text>
        </Text>
        <Box marginY={1}>
          <Text italic dimColor wrap="wrap">
            「{persona}」
          </Text>
        </Box>
        {STAT_NAMES.map(k => (
          <Text key={`st-${k}`} mono>
            {STAT_LABEL[k]}{' '}
            <Text color={color}>{'█'.repeat(Math.round(b.stats[k] / 5))}</Text>
            <Text dimColor>{'░'.repeat(20 - Math.round(b.stats[k] / 5))}</Text>
            {' '}{String(b.stats[k]).padStart(3, ' ')}
          </Text>
        ))}
        <Box marginTop={1}>
          <Text dimColor>
            {eyeStyleOf(b.eyeStyle).label}・被摸 {s.pets} 次
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
    const b = deriveBuddy(s.seed)

    let art: string[]
    let color: string
    let title: string
    let bubble: string
    let isDim = false
    let top = { text: ' ', color: 'white' }

    if (left > 0) {
      art = EGG[Math.min(EGG.length - 1, HATCH_TICKS - left)] ?? EGG[0]!
      color = 'white'
      title = '孵化中…'
      bubble = f % 2 ? '喀…' : '喀喀…'
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
      title = `${nameOf(s, b)} ${b.isShiny ? '✦' : ''}${starsOf(b.rarity)} Lv.${level(s.xp)}`
      const q = await read($, quip)
      bubble = q?.text ?? `（${nameOf(s, b)} 在旁邊看著）`
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

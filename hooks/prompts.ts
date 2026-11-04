// 純函式：組提示詞、解析模型輸出、組文字輸出。語言一律由參數傳入，不讀全域狀態。

import type { Buddy, BuddyEvent, Lang, Mood, Quip, Save, Soul } from '../types'
import { inspirationIndexes, buddyOf, levelOf, MAX_LEVEL } from './derive'
import { STRINGS } from './i18n'
import {
  LEGENDARY_PRINCIPLES,
  MAX_STARS,
  STAT_NAMES,
  eyeLabel,
  inspirationText,
  speciesDesc,
  speciesLabel,
  speciesOf,
  starsOf,
  traitText,
} from './species'

/** 人設格式的版本：改寫法時加一，舊人設會以原人設為底重寫 */
export const SOUL_VERSION = 4

const MOODS: Mood[] = ['idle', 'busy', 'happy', 'worried', 'sleepy']

export type ModelRequest = { system: string; prompt: string }

// ---------- 共用的小片段：每種東西只在這裡算一次 ----------

export function nameOf(s: Save, lang: Lang): string {
  return s.soul?.name ?? speciesLabel(speciesOf(buddyOf(s).species), lang)
}

export function starsText(b: Buddy, lang: Lang): string {
  return `${starsOf(b.rarity)} ${STRINGS[lang].rarity[b.rarity]}`
}

export function rarityTag(b: Buddy, lang: Lang): string {
  return `${b.isShiny ? `✦${STRINGS[lang].shiny} ` : ''}${starsText(b, lang)}`
}

export function levelText(s: Save, lang: Lang): string {
  return levelOf(s) >= MAX_LEVEL ? `Lv.${STRINGS[lang].maxLevel}` : `Lv.${levelOf(s)}`
}

function statsText(b: Buddy, lang: Lang): string {
  const t = STRINGS[lang]
  return STAT_NAMES.map(k => `${t.stat[k]} ${b.stats[k]}/100`).join(t.listSep)
}

function extremes(b: Buddy, lang: Lang): { high: string; low: string } {
  const t = STRINGS[lang]
  return {
    high: `${t.stat[b.strength]} ${b.stats[b.strength]}`,
    low: `${t.stat[b.weakness]} ${b.stats[b.weakness]}`,
  }
}

/** 夥伴的最高原則：物種自己的優先，否則傳說級依強項挑一條，其餘沒有 */
export function creedOf(b: Buddy): string | null {
  return speciesOf(b.species).creed ?? (b.rarity === MAX_STARS ? LEGENDARY_PRINCIPLES[b.strength] : null)
}

/** 有最高原則時，每個提示詞都多這一行 */
function creedLines(b: Buddy, lang: Lang): string[] {
  const creed = creedOf(b)
  return creed ? [STRINGS[lang].creedLine(creed)] : []
}

export function inspirationsOf(seed: string, lang: Lang): string[] {
  return inspirationIndexes(seed).map(i => inspirationText(i, lang))
}

// ---------- 給模型的請求 ----------

/** 第一次孵化：從零寫名字和個性 */
export function soulRequest(s: Save, lang: Lang): ModelRequest {
  const b = buddyOf(s)
  const sp = speciesOf(b.species)
  const t = STRINGS[lang]
  return {
    system: [t.soulSystem, ...creedLines(b, lang)].join('\n'),
    prompt: t.soulPrompt({
      rarity: starsText(b, lang),
      weird: t.weirdness[b.rarity],
      shiny: b.isShiny,
      species: speciesLabel(sp, lang),
      desc: speciesDesc(sp, lang),
      stats: statsText(b, lang),
      ...extremes(b, lang),
      words: [...inspirationsOf(s.seed, lang), traitText(b.trait, lang)].join(t.listSep),
    }),
  }
}

/** 換語言或改寫法：以原本的名字和個性為底改寫，保留怪癖 */
export function preserveRequest(s: Save, soul: Soul, lang: Lang): ModelRequest {
  const b = buddyOf(s)
  const t = STRINGS[lang]
  return {
    system: [t.preserveSystem, ...creedLines(b, lang)].join('\n'),
    prompt: t.preservePrompt({ name: soul.name, species: speciesLabel(speciesOf(b.species), lang), persona: soul.persona }),
  }
}

/** 升階：在原本的個性上變怪 */
export function evolveRequest(s: Save, soul: Soul, lang: Lang): ModelRequest {
  const b = buddyOf(s)
  const t = STRINGS[lang]
  return {
    system: [t.evolveSystem, ...creedLines(b, lang)].join('\n'),
    prompt: t.evolvePrompt({
      name: soul.name,
      species: speciesLabel(speciesOf(b.species), lang),
      persona: soul.persona,
      rarity: starsText(b, lang),
      weird: t.weirdness[b.rarity],
      ...extremes(b, lang),
    }),
  }
}

/** 每輪結束的評論（fork 的 prompt） */
export function forkPrompt(s: Save, ev: BuddyEvent | null, lang: Lang): string {
  const b = buddyOf(s)
  const sp = speciesOf(b.species)
  const t = STRINGS[lang]
  return [
    ...t.forkPersona({
      name: nameOf(s, lang),
      desc: speciesDesc(sp, lang),
      rarity: starsText(b, lang),
      persona: s.soul?.persona ?? null,
      trait: traitText(b.trait, lang),
      sass: b.stats.sass,
      mayhem: b.stats.mayhem,
    }),
    ...creedLines(b, lang),
    ...(ev ? t.forkEvent(t.event[ev.kind], ev.detail) : [t.forkSkip]),
    t.formatLine,
  ].join('\n')
}

/** 被叫名字時的回話 */
export function callRequest(s: Save, text: string, lang: Lang): ModelRequest {
  const b = buddyOf(s)
  const sp = speciesOf(b.species)
  const t = STRINGS[lang]
  return {
    system: [
      ...t.callSystem({
        name: nameOf(s, lang),
        desc: speciesDesc(sp, lang),
        persona: s.soul?.persona ?? null,
        trait: traitText(b.trait, lang),
      }),
      ...creedLines(b, lang),
      t.formatLine,
    ].join('\n'),
    prompt: t.callPrompt(text.slice(0, 500)),
  }
}

// ---------- 解析模型輸出（邊界） ----------

/** 太長時退回到上限內最後一個句號、逗號或空白，不切在字中間 */
export function trimAtBoundary(text: string, max: number): string {
  if (text.length <= max) return text
  const head = text.slice(0, max)
  const cut = Math.max(...['。', '！', '？', '. ', '! ', '? '].map(p => head.lastIndexOf(p)))
  if (cut >= max * 0.5) return head.slice(0, cut + 1).trim()
  const soft = Math.max(...['，', '、', '；', ', ', '; ', ' '].map(p => head.lastIndexOf(p)))
  return `${(soft >= max * 0.5 ? head.slice(0, soft) : head).replace(/[，、；,;\s]+$/, '')}…`
}

function parseJsonObject(text: string): Record<string, unknown> | null {
  const m = text.match(/\{[\s\S]*\}/)
  if (!m) return null
  try {
    const v: unknown = JSON.parse(m[0])
    return typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : null
  } catch {
    return null
  }
}

function personaField(o: Record<string, unknown> | null, lang: Lang): string {
  return typeof o?.persona === 'string' ? trimAtBoundary(o.persona.trim(), STRINGS[lang].personaMax) : ''
}

/** 孵化或改寫的回覆：名字和個性都要有 */
export function parseSoul(text: string, lang: Lang): Pick<Soul, 'name' | 'persona'> | null {
  const o = parseJsonObject(text)
  const name = typeof o?.name === 'string' ? o.name.trim().slice(0, 12) : ''
  const persona = personaField(o, lang)
  return name && persona ? { name, persona } : null
}

/** 升階的回覆：只有個性 */
export function parseEvolved(text: string, lang: Lang): string | null {
  return personaField(parseJsonObject(text), lang) || null
}

/** 評論或回話：一行「心情|台詞」，SKIP 代表不說 */
export function parseQuip(text: string, lang: Lang): Omit<Quip, 'at'> | null {
  const line = text.trim().split('\n').pop()?.trim() ?? ''
  if (!line || line.toUpperCase().startsWith('SKIP')) return null
  const [head, ...rest] = line.split('|')
  const m = MOODS.find(x => x === (head ?? '').trim().toLowerCase())
  const body = (m ? rest.join('|') : line).trim().slice(0, STRINGS[lang].quipMax)
  return body ? { text: body, mood: m ?? 'idle' } : null
}

// ---------- 工具呼叫的結果（邊界） ----------

const TEST_COMMAND = /\b(test|tests|pytest|jest|vitest|mocha|rspec|go test|cargo test|npm t|phpunit)\b/i
const TEST_FAILED = /\b(fail(ed|ing|ures?)?|errors?)\b|✗|✕/i
const BIG_EDIT_LINES = 80

export const EVENT_RANK: Record<BuddyEvent['kind'], number> = { 'big-edit': 1, 'error': 2, 'test-failed': 3 }

/** 從一次工具呼叫的結果判斷是否值得夥伴出聲 */
export function eventOf(tool: string, input: Record<string, unknown>, isError: boolean, text: string, lang: Lang): BuddyEvent | null {
  const t = STRINGS[lang]
  const cmd = typeof input.command === 'string' ? input.command : ''
  if (tool === 'Bash' && TEST_COMMAND.test(cmd) && (isError || TEST_FAILED.test(text.slice(-2000)))) {
    return { kind: 'test-failed', detail: t.detailTest(cmd.slice(0, 200), text.slice(-800)) }
  }
  if (isError) return { kind: 'error', detail: t.detailError(tool, cmd.slice(0, 200), text.slice(0, 800)) }
  const body = typeof input.content === 'string' ? input.content : typeof input.new_string === 'string' ? input.new_string : ''
  const lines = body ? body.split('\n').length : 0
  if ((tool === 'Write' || tool === 'Edit') && lines >= BIG_EDIT_LINES) {
    return { kind: 'big-edit', detail: t.detailBigEdit(tool, String(input.file_path ?? ''), lines) }
  }
  return null
}

// ---------- 文字輸出 ----------

/** /buddy card 的文字版：模型讀的、也是不畫卡片的介面顯示的 */
export function cardText(s: Save, lang: Lang): string {
  const b = buddyOf(s)
  const sp = speciesOf(b.species)
  const t = STRINGS[lang]
  const stats = STAT_NAMES.map(k => `${t.stat[k]} ${'█'.repeat(Math.round(b.stats[k] / 10)).padEnd(10, '░')} ${b.stats[k]}`)
  return [
    `${nameOf(s, lang)} (${speciesLabel(sp, lang)}) ${rarityTag(b, lang)}  ${levelText(s, lang)}`,
    `${t.cardTrait}: ${traitText(b.trait, lang)}`,
    `${t.cardEyes}: ${eyeLabel(b.eyeStyle, lang)}`,
    ...stats,
    ...(s.soul ? [`${t.cardPersona}: ${s.soul.persona}`] : []),
    `${t.cardPets(s.pets)}${s.ascensions ? ` | ${t.cardAscensions(s.ascensions)}` : ''} | ${s.seedSource === 'git' ? t.bindGit : t.bindRandom}`,
  ].join('\n')
}

/** 人設是否要重寫：物種、寫法版本或語言和現在對不上 */
export function isSoulStale(s: Save, lang: Lang): boolean {
  return s.soul === null || s.soul.species !== buddyOf(s).species || s.soul.v !== SOUL_VERSION || s.soul.lang !== lang
}

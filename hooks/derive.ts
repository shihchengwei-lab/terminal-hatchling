// 純函式：由種子與存檔算出夥伴的一切。不讀狀態、不呼叫模型、不看語言。

import type { Buddy, BuddyStats, Rarity, Save } from '../types'
import {
  EYE_STYLES,
  HIDDEN_RATE,
  HIDDEN_SPECIES,
  INSPIRATIONS,
  MAX_STARS,
  RARITY_RATES,
  RARITY_STAT_RANGE,
  SHINY_RATE,
  SPECIES,
  STAT_NAMES,
  TRAITS,
} from './species'

// ---------- 種子亂數（FNV-1a 雜湊 + mulberry32） ----------

function hash(text: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h >>> 0
}

export function seeded(seed: string): () => number {
  let a = hash(`buddy:${seed}`)
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 2 ** 32
  }
}

/**
 * 由種子算出夥伴。ascensions 是滿級升階的次數：每次星數 +1（最多 MAX_STARS），
 * 屬性用同一組亂數、依新星數的範圍重算，所以強項和弱項不變。
 * 亂數的使用順序固定，舊種子的結果不會因為改版而改變。
 */
export function deriveBuddy(seed: string, ascensions = 0): Buddy {
  const rnd = seeded(seed)
  const pick = <T,>(list: readonly T[]): T => list[Math.floor(rnd() * list.length)] ?? list[0]!

  // 物種和星數各自獨立：任何動物都可能是 5 星
  const picked = pick(SPECIES).id
  // 隱藏物種用另一組亂數判定，其他結果完全不受影響
  const species = seeded(`${seed}:hidden`)() < HIDDEN_RATE ? HIDDEN_SPECIES[0]!.id : picked
  let r = rnd()
  let born: Rarity = 1
  for (const tier of [5, 4, 3, 2] as const) {
    if (r < RARITY_RATES[tier]) {
      born = tier
      break
    }
    r -= RARITY_RATES[tier]
  }
  const rarity = Math.min(MAX_STARS, born + ascensions) as Rarity
  const isShiny = rnd() < SHINY_RATE
  const [lo, hi] = RARITY_STAT_RANGE[rarity]
  const stats = {} as BuddyStats
  for (const k of STAT_NAMES) stats[k] = lo + Math.floor(rnd() * (hi - lo + 1))
  // 強項一定是唯一最高、弱項一定是唯一最低（各比其他三項高或低 20，受 1～100 的上下限限制）
  const strength = pick(STAT_NAMES)
  const weakness = pick(STAT_NAMES.filter(k => k !== strength))
  const rest = STAT_NAMES.filter(k => k !== strength && k !== weakness).map(k => stats[k])
  stats[strength] = Math.min(100, Math.max(...rest, stats[strength]) + 20)
  stats[weakness] = Math.max(1, Math.min(...rest, stats[weakness]) - 20)
  const trait = Math.floor(rnd() * TRAITS.length)
  const eyeStyle = pick(EYE_STYLES).id
  return { species, rarity, isShiny, stats, trait, eyeStyle, strength, weakness }
}

export function buddyOf(s: Save): Buddy {
  return deriveBuddy(s.seed, s.ascensions)
}

/** 由種子挑 4 個靈感詞，回傳在清單裡的位置（兩種語言的清單一一對應） */
export function inspirationIndexes(seed: string): number[] {
  const rnd = seeded(`${seed}:inspire`)
  const pool = INSPIRATIONS.map((_, i) => i)
  const out: number[] = []
  while (out.length < 4 && pool.length > 0) out.push(pool.splice(Math.floor(rnd() * pool.length), 1)[0]!)
  return out
}

// ---------- 等級與升階 ----------

export const MAX_LEVEL = 10

/** 每多一顆星，升級需要的經驗值 ×2：1 星滿級要 243，2 星 486，3 星 972，4 星 1944 */
export function xpScale(rarity: Rarity): number {
  return 2 ** (rarity - 1)
}

export function level(xp: number, rarity: Rarity = 1): number {
  return Math.min(MAX_LEVEL, 1 + Math.floor(Math.sqrt(xp / (3 * xpScale(rarity)))))
}

export function levelOf(s: Save): number {
  return level(s.xp, buddyOf(s).rarity)
}

/** 加經驗值；滿級且還沒到最高星數就升階：星數 +1、經驗值歸零 */
export function addXp(s: Save, n: number): { next: Save; promoted: boolean } {
  const xp = s.xp + n
  const rarity = buddyOf(s).rarity
  if (rarity < MAX_STARS && level(xp, rarity) >= MAX_LEVEL) {
    return { next: { ...s, xp: 0, ascensions: s.ascensions + 1 }, promoted: true }
  }
  return { next: { ...s, xp }, promoted: false }
}

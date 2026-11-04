// 存檔的邊界：從磁碟讀進來一律經過 parseSave，寫出去一律經過 commit。

import { atom, read, update } from 'claude-code'
import type { EngineInterface } from 'claude-code'

import type { Save, Soul } from '../types'
import { MAX_STARS } from './species'

/** 存檔在本 session 的鏡像：只有這個檔案讀寫它，外面一律經過 current / load / commit */
const save = atom({ plugin: 'terminal-hatchling', key: 'save' } as const, null, { shape: 'save-2' })

const STORE_KEY = 'buddy.bound.v1'

function count(v: unknown): number {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0 ? v : 0
}

function parseSoulRecord(v: unknown, nameOverride: unknown): Soul | null {
  if (typeof v !== 'object' || v === null) return null
  const o = v as Record<string, unknown>
  if (typeof o.name !== 'string' || typeof o.persona !== 'string' || typeof o.species !== 'string') return null
  return {
    name: typeof nameOverride === 'string' && nameOverride ? nameOverride : o.name,
    persona: o.persona,
    species: o.species,
    // 舊格式沒有版本：記成 0，讀進來後會以原人設為底重寫
    v: typeof o.v === 'number' ? o.v : 0,
    lang: o.lang === 'en' || o.lang === 'zh-TW' ? o.lang : 'zh-TW',
  }
}

/** 存檔的唯一入口：任何形狀進來，出去的不是合法的 Save 就是 null（parse, don't validate） */
export function parseSave(raw: unknown): Save | null {
  if (typeof raw !== 'object' || raw === null) return null
  const o = raw as Record<string, unknown>
  if (typeof o.seed !== 'string' || o.seed === '') return null
  return {
    version: 2,
    seed: o.seed,
    seedSource: o.seedSource === 'git' || o.seedSource === 'random' ? o.seedSource : o.seed.startsWith('git:') ? 'git' : 'random',
    // 舊版的自訂名字（/buddy name）併進人設
    soul: parseSoulRecord(o.soul, o.name),
    xp: count(o.xp),
    ascensions: Math.min(MAX_STARS - 1, count(o.ascensions)),
    pets: count(o.pets),
    isHidden: o.isHidden === true,
  }
}

/** 只讀本 session 的鏡像，不碰磁碟：畫面用這個（畫面不能寫狀態） */
export async function current($: EngineInterface): Promise<Save | null> {
  return read($, save)
}

/** 讀存檔；還沒孵過就是 null（第一次 /buddy 才孵） */
export async function load($: EngineInterface): Promise<Save | null> {
  const cur = await read($, save)
  if (cur) return cur
  const stored = await $.store.get(STORE_KEY)
  const parsed = parseSave(stored)
  if (!parsed) return null
  // 舊格式讀進來就存回新格式，之後只會看到新格式
  if ((stored as { version?: unknown }).version !== 2) await $.store.set(STORE_KEY, parsed)
  await update($, save, () => parsed)
  return parsed
}

/** 存檔的唯一寫入口：先改本 session 的鏡像，再寫磁碟 */
export async function commit($: EngineInterface, s: Save): Promise<void> {
  await update($, save, () => s)
  await $.store.set(STORE_KEY, s)
}

/** 夥伴現在醒著、可以呼叫模型：有存檔而且沒被藏起來。所有模型呼叫都先過這一關 */
export async function awake($: EngineInterface): Promise<Save | null> {
  const s = await load($)
  return s && !s.isHidden ? s : null
}

// ---------- 種子 ----------

export function randomSeed(): string {
  try {
    const a = new Uint32Array(4)
    crypto.getRandomValues(a)
    return Array.from(a, n => n.toString(16).padStart(8, '0')).join('')
  } catch {
    return `${Date.now().toString(16)}${Math.random().toString(16).slice(2)}`
  }
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(digest), n => n.toString(16).padStart(2, '0')).join('')
}

/** 用 git 全域 email 當種子：只存雜湊，email 本身不存、不送出 */
export async function gitSeed($: EngineInterface): Promise<string | null> {
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

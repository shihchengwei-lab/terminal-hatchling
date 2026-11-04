export type Mood = 'idle' | 'busy' | 'happy' | 'worried' | 'sleepy'
/** 稀有度就是星數：1 星最常見，5 星最稀有，和物種無關 */
export type Rarity = 1 | 2 | 3 | 4 | 5
export type StatName = 'bugsniff' | 'calm' | 'mayhem' | 'obsession' | 'sass'
export type BuddyStats = Record<StatName, number>

/** 由種子算出來的固定部分：同一個種子永遠得到同一隻 */
export type Buddy = {
  species: string
  rarity: Rarity
  isShiny: boolean
  stats: BuddyStats
  /** 個性關鍵字在 TRAITS / TRAITS_EN 裡的位置 */
  trait: number
  /** 眼睛款式 */
  eyeStyle: string
}

export type Lang = 'en' | 'zh-TW'

/** 孵化時由 Haiku 寫的名字與人設；每個欄位都必填，沒有「有一半」的人設 */
export type Soul = {
  name: string
  persona: string
  /** 寫這份人設時的物種；和種子算出的物種不同就要重寫 */
  species: string
  /** 寫這份人設的 prompt 版本 */
  v: number
  lang: Lang
}

/**
 * 存檔。每個欄位都必填、只有一種表示法：
 * 人設還沒寫好就是 null（沒有 undefined 和 null 兩種「沒有」）。
 * 舊格式的存檔只在讀進來的那一刻由 parseSave 轉成這個形狀。
 */
export type Save = {
  version: 2
  seed: string
  seedSource: 'git' | 'random'
  soul: Soul | null
  xp: number
  /** 滿級升階的次數：0 到 4，每次星數 +1（最多到 5 星） */
  ascensions: number
  pets: number
  isHidden: boolean
}

export type Quip = { text: string; mood: Mood; at: number }

declare module 'claude-code' {
  interface PluginState {
    'terminal-hatchling': {
      save: Shaped<Save | null>
      quip: Shaped<Quip | null>
      hatchTicks: number
      petTicks: number
      mood: Mood
      frame: number
    }
  }
}

export type Mood = 'idle' | 'busy' | 'happy' | 'worried' | 'sleepy'
/** 稀有度就是星數：1 星最常見，5 星最稀有，和物種無關 */
export type Rarity = 1 | 2 | 3 | 4 | 5
export type StatName = 'focus' | 'curiosity' | 'patience' | 'chatter'
export type BuddyStats = Record<StatName, number>

/** 由種子算出來的固定部分：同一個種子永遠得到同一隻 */
export type Buddy = {
  species: string
  rarity: Rarity
  isShiny: boolean
  stats: BuddyStats
  trait: string
  /** 眼睛款式 */
  eyeStyle: string
}

/** 孵化時由 Haiku 寫一次的名字與人設 */
export type Soul = { name: string; persona: string; species: string; v?: number }

export type Save = {
  seed: string
  /** 種子來源：git 全域 email 的雜湊，或隨機 */
  seedSource?: 'git' | 'random'
  soul?: Soul | null
  name: string | null
  xp: number
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

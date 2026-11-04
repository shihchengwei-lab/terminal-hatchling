// hooks 與畫面。純計算在 derive.ts / prompts.ts，存檔邊界在 save.ts，狀態定義在 state.ts。
// 事情只往一個方向流：事件 → 寫狀態（存檔只經過 commit）→ 畫面從狀態推導。

import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { BuddyEvent, Lang, Mood, Quip, Save } from '../types'
import { addXp, buddyOf, levelOf } from './derive'
import { STRINGS, resolveLang } from './i18n'
import {
  EVENT_RANK,
  SOUL_VERSION,
  callRequest,
  cardText,
  eventOf,
  evolveRequest,
  forkPrompt,
  isSoulStale,
  levelText,
  nameOf,
  parseEvolved,
  parseQuip,
  parseSoul,
  preserveRequest,
  rarityTag,
  soulRequest,
} from './prompts'
import { awake, commit, current, gitSeed, load, randomSeed } from './save'
import {
  EGG,
  RARITY_COLOR,
  SHINY_COLORS,
  STAT_NAMES,
  eyeLabel,
  eyeStyleOf,
  renderArt,
  speciesDesc,
  speciesLabel,
  speciesOf,
  starsOf,
  traitText,
} from './species'

// 這個 mod 在 $.state 裡的值（存檔另由 save.ts 擁有）。每個事實只有這一份；畫面上的心情等都從這些值推導。
/** 夥伴最近說的話（含心情與時間） */
const quip = atom({ plugin: 'terminal-hatchling', key: 'quip' } as const, null, { shape: 'quip-1' })
/** 孵蛋動畫；沒在孵就是 null */
const hatching = atom({ plugin: 'terminal-hatchling', key: 'hatching' } as const, null, { shape: 'hatching-1' })
/** 這一輪記下、等 turn 結束時評論的事件 */
const pendingEvent = atom({ plugin: 'terminal-hatchling', key: 'pendingEvent' } as const, null, { shape: 'event-1' })
/** 最後一次有動靜的時間；打瞌睡由它推導 */
const lastActiveAt = atom({ plugin: 'terminal-hatchling', key: 'lastActiveAt' } as const, 0)
/** 摸摸的愛心還要飄幾格 */
const petTicks = atom({ plugin: 'terminal-hatchling', key: 'petTicks' } as const, 0)
/** 動畫的格數 */
const frame = atom({ plugin: 'terminal-hatchling', key: 'frame' } as const, 0)

const HAIKU = 'haiku'
const HAIKU_TIMEOUT_MS = 30_000
const HATCH_TICKS = 6
const TICK_MS = 500
const MIN_ANSWER_CHARS = 80
const COOLDOWN_MS = 45_000
const SLEEP_AFTER_MS = 5 * 60_000
/** 一句話帶來的心情維持多久 */
const QUIP_MOOD_MS = 2 * 60_000
const PET_TICKS = 6
const MOOD_EYES: Partial<Record<Mood, string>> = { happy: '^ ^', worried: '; ;', sleepy: 'u u' }
const HEART_FRAMES = ['   ♥   ', '  ♥ ♥  ', ' ♥ ♥ ♥ ', '♥  ♥  ♥', ' ♥   ♥ ', '   ♥   ']
const ZZZ_FRAMES = ['     z ', '    z Z', '   z Z z']

/** 畫面上的心情：由狀態推導，不另外存 */
export function moodOf(p: { isWorking: boolean; now: number; lastActiveAt: number; pending: BuddyEvent | null; quip: Quip | null }): Mood {
  if (p.isWorking) return 'busy'
  if (p.now - p.lastActiveAt > SLEEP_AFTER_MS) return 'sleepy'
  if (p.pending && p.pending.kind !== 'big-edit') return 'worried'
  if (p.quip && p.now - p.quip.at < QUIP_MOOD_MS) return p.quip.mood
  return 'idle'
}

export function isCalled(text: string, name: string): boolean {
  return name.length >= 2 && text.toLowerCase().includes(name.toLowerCase())
}

// ---------- 動作：每個都是「讀狀態 → 做一件事 → 寫狀態」，模型呼叫前都先過 awake ----------

async function say($: EngineInterface, q: Omit<Quip, 'at'>): Promise<void> {
  const at = await $.clock.now()
  await update($, quip, () => ({ ...q, at }))
}

async function touch($: EngineInterface): Promise<void> {
  const now = await $.clock.now()
  await update($, lastActiveAt, () => now)
}

/** 寫或改寫人設。同一隻（物種沒變）就以原人設為底改寫，保留怪癖；失敗時保留原本的 */
async function writeSoul($: EngineInterface, lang: Lang): Promise<void> {
  const s = await awake($)
  if (!s) return
  const prev = s.soul && s.soul.species === buddyOf(s).species ? s.soul : null
  const req = prev ? preserveRequest(s, prev, lang) : soulRequest(s, lang)
  const r = await $.model.complete({ model: HAIKU, ...req, maxTokens: 300, timeoutMs: HAIKU_TIMEOUT_MS })
  const soul = r.isAnswered ? parseSoul(r.text, lang) : null
  const cur = await load($)
  if (!soul || !cur || cur.seed !== s.seed) return
  // 語言沒變時名字一字不改
  const name = prev && prev.lang === lang ? prev.name : soul.name
  await commit($, { ...cur, soul: { ...soul, name, species: buddyOf(cur).species, v: SOUL_VERSION, lang } })
}

/** 人設對不上現在的物種、寫法或語言時才重寫 */
async function ensureSoul($: EngineInterface, lang: Lang): Promise<void> {
  const s = await awake($)
  if (s && isSoulStale(s, lang)) await writeSoul($, lang)
}

async function hatch($: EngineInterface, lang: Lang): Promise<void> {
  const fromGit = await gitSeed($)
  const s: Save = {
    version: 2,
    seed: fromGit ?? randomSeed(),
    seedSource: fromGit ? 'git' : 'random',
    soul: null,
    xp: 0,
    ascensions: 0,
    pets: 0,
    isHidden: false,
  }
  await commit($, s)
  await update($, quip, () => null)
  await update($, hatching, () => ({ ticksLeft: HATCH_TICKS, isWritingSoul: true }))
  $.clock.after(0, async () => {
    try {
      await writeSoul($, lang)
    } finally {
      await update($, hatching, cur => (cur ? { ...cur, isWritingSoul: false } : cur))
    }
  })
}

/** 升階後在原本的個性上變怪；名字不變，失敗就保留原個性 */
async function evolvePersona($: EngineInterface, lang: Lang): Promise<void> {
  const s = await awake($)
  if (!s?.soul) return
  const r = await $.model.complete({ model: HAIKU, ...evolveRequest(s, s.soul, lang), maxTokens: 300, timeoutMs: HAIKU_TIMEOUT_MS })
  const persona = r.isAnswered ? parseEvolved(r.text, lang) : null
  const cur = await load($)
  if (!persona || !cur?.soul || cur.seed !== s.seed) return
  await commit($, { ...cur, soul: { ...cur.soul, persona } })
}

async function announcePromotion($: EngineInterface, s: Save, lang: Lang): Promise<void> {
  await say($, { text: STRINGS[lang].promotedSay(nameOf(s, lang), rarityTag(buddyOf(s), lang)), mood: 'happy' })
  $.clock.after(0, () => evolvePersona($, lang))
}

async function replyToCall($: EngineInterface, text: string, lang: Lang): Promise<void> {
  const s = await awake($)
  if (!s) return
  const r = await $.model.complete({ model: HAIKU, ...callRequest(s, text, lang), maxTokens: 200, timeoutMs: 20_000 })
  const q = r.isAnswered ? parseQuip(r.text, lang) : null
  if (q) await say($, q)
}

async function comment($: EngineInterface, ev: BuddyEvent | null, lang: Lang): Promise<void> {
  const s = await awake($)
  if (!s) return
  const r = await $.model.fork({ prompt: forkPrompt(s, ev, lang) })
  const q = r.isAnswered ? parseQuip(r.text, lang) : null
  if (q) await say($, q)
}

/** 每 0.5 秒：動畫、愛心倒數、孵蛋倒數（人設寫完、動畫播完才揭曉） */
async function tick($: EngineInterface, lang: Lang): Promise<void> {
  await update($, frame, f => (f + 1) % 10_000)
  if ((await read($, petTicks)) > 0) await update($, petTicks, n => Math.max(0, n - 1))
  const egg = await read($, hatching)
  if (!egg) return
  if (egg.ticksLeft > 1) {
    await update($, hatching, cur => (cur ? { ...cur, ticksLeft: cur.ticksLeft - 1 } : cur))
    return
  }
  if (egg.isWritingSoul) return
  await update($, hatching, () => null)
  const s = await load($)
  if (s) await say($, { text: STRINGS[lang].hatchedSay(nameOf(s, lang), rarityTag(buddyOf(s), lang)), mood: 'happy' })
}

// ---------- hooks ----------

export const register: Register = (on, options) => {
  let lang: Lang = 'en'
  let commandName = 'buddy'
  let lastCommentAt = -Infinity
  let isCommenting = false

  on('session.start', async ($, e, next) => {
    const settingsLanguage = await $.settings.read({ key: 'language' }).catch(() => undefined)
    const envLang = (await $.env.get('LC_ALL').catch(() => undefined)) || (await $.env.get('LANG').catch(() => undefined))
    lang = resolveLang((options as Record<string, unknown>).language, settingsLanguage, envLang)
    const r = await $.command.register({ name: 'buddy', description: STRINGS[lang].commandDescription })
    commandName = r.command
    await touch($)
    $.clock.after(0, () => ensureSoul($, lang))
    $.clock.every(TICK_MS, () => tick($, lang))
    return next(e)
  })

  on('command.run', async ($, e, next) => {
    if (e.command !== commandName) return next(e)
    const t = STRINGS[lang]
    const sub = e.args.trim()
    const cur = await load($)
    await touch($)

    if (sub === '') {
      if (!cur) {
        await hatch($, lang)
        return { text: t.hatchText }
      }
      const s = { ...cur, isHidden: !cur.isHidden }
      await commit($, s)
      if (s.isHidden) return { text: t.hideText }
      // 藏著時沒重寫的人設，叫出來時補上
      $.clock.after(0, () => ensureSoul($, lang))
      return { text: t.back }
    }

    if (sub === 'card') return { text: cur ? cardText(cur, lang) : t.noBuddy }

    if (sub === 'pet') {
      if (!cur) return { text: t.noBuddy }
      const { next: s, promoted } = addXp({ ...cur, pets: cur.pets + 1 }, 1)
      await commit($, s)
      await update($, petTicks, () => PET_TICKS)
      if (promoted) await announcePromotion($, s, lang)
      else await say($, { text: t.petSay(nameOf(s, lang)), mood: 'happy' })
      const promotedLine = promoted ? `\n${t.promotedSay(nameOf(s, lang), rarityTag(buddyOf(s), lang))}` : ''
      return { text: `${t.petted(nameOf(s, lang), levelOf(s))}${promotedLine}` }
    }

    return { text: t.usage }
  }).catch(($, e, next) => (next.called || e.command !== commandName ? next(e) : { text: STRINGS[lang].fallback }))

  on('prompt.submit', async ($, e, next) => {
    await touch($)
    const s = await awake($)
    if (s && !(await read($, hatching)) && isCalled(e.text, nameOf(s, lang))) {
      // 被叫到了：回完這句，這輪結束時先不再評論
      lastCommentAt = await $.clock.now()
      const text = e.text
      $.clock.after(0, () => replyToCall($, text, lang))
    }
    return next(e)
  }).catch(($, e, next) => next(e))

  on('tool.call', async ($, e, next) => {
    const r = await next(e)
    if (e.agentId !== undefined || ('deny' in r && r.deny !== undefined)) return r
    if (!(await awake($)) || (await read($, hatching))) return r
    const ev = eventOf(e.tool, e as unknown as Record<string, unknown>, r.isError === true, r.text ?? '', lang)
    if (ev) await update($, pendingEvent, cur => (!cur || EVENT_RANK[ev.kind] >= EVENT_RANK[cur.kind] ? ev : cur))
    return r
  }).catch(($, e, next) => next(e))

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    if (e.agentId !== undefined) return result
    await touch($)
    const ev = await read($, pendingEvent)
    await update($, pendingEvent, () => null)

    // 藏起來時夥伴不在：不加經驗值、不升階、不評論
    const loaded = await awake($)
    if (!loaded) return result
    const { next: s, promoted } = addXp(loaded, 1)
    await commit($, s)
    if (promoted) {
      // 升階這輪由升階訊息當主角，不再評論
      await announcePromotion($, s, lang)
      lastCommentAt = await $.clock.now()
      return result
    }

    const now = await $.clock.now()
    // 這輪出過事就一定評論；否則照長度與冷卻時間判斷
    const shouldComment =
      !isCommenting &&
      e.reason === 'answer' &&
      (ev !== null || (e.answer.length >= MIN_ANSWER_CHARS && now - lastCommentAt >= COOLDOWN_MS))
    if (!shouldComment) return result

    lastCommentAt = now
    isCommenting = true
    // turn 結束後才跑旁支模型，不拖住主對話；這時對話紀錄已包含這輪發生的事
    $.clock.after(0, async () => {
      try {
        await comment($, ev, lang)
      } finally {
        isCommenting = false
      }
    })
    return result
  })

  // /buddy card 的輸出畫成角色卡；文字版仍留在 text 給模型看
  on('ui.render', { component: 'CommandOutput' }, async ($, e, next) => {
    if (e.props.command !== commandName || e.props.isErrored || e.props.args.trim() !== 'card') return next(e)
    const s = await current($)
    if (!s) return next(e)
    const { Box, Text } = $.ui.resolve(e)
    const t = STRINGS[lang]
    const egg = await read($, hatching)
    if (egg) {
      const f = await read($, frame)
      return (
        <Box flexDirection="column" borderStyle="round" paddingX={2} paddingY={1} width={44}>
          <Text bold>{t.hatching}</Text>
          <Box flexDirection="column" marginY={1} paddingLeft={2}>
            {(EGG[Math.min(EGG.length - 1, HATCH_TICKS - egg.ticksLeft)] ?? EGG[0]!).map((l, i) => (
              <Text key={`egg${i}`} mono>
                {l}
              </Text>
            ))}
          </Box>
          <Text dimColor>{t.crack[f % 2] ?? ''}</Text>
        </Box>
      )
    }
    const b = buddyOf(s)
    const sp = speciesOf(b.species)
    const color = RARITY_COLOR[b.rarity]
    const art = renderArt(sp.art, eyeStyleOf(b.eyeStyle).eyes)
    const persona = s.soul?.persona ?? t.cardFallbackPersona(speciesDesc(sp, lang), traitText(b.trait, lang))

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
          {nameOf(s, lang)}
          <Text dimColor> {levelText(s, lang)}</Text>
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
    const s = await current($)
    if (e.props.hasSurvey || !s || s.isHidden) return next(e)
    const { Box, Text } = $.ui.resolve(e)
    const t = STRINGS[lang]
    const f = await read($, frame)
    const egg = await read($, hatching)
    const b = buddyOf(s)

    let art: string[]
    let color: string
    let title: string
    let bubble: string
    let isDim = false
    let top = { text: ' ', color: 'white' }

    if (egg) {
      art = EGG[Math.min(EGG.length - 1, HATCH_TICKS - egg.ticksLeft)] ?? EGG[0]!
      color = 'white'
      title = t.hatching
      bubble = t.crack[f % 2] ?? ''
    } else {
      const q = await read($, quip)
      const m = moodOf({
        isWorking: e.props.isWorking,
        now: await $.clock.now(),
        lastActiveAt: await read($, lastActiveAt),
        pending: await read($, pendingEvent),
        quip: q,
      })
      const eyes = m === 'idle' && f % 8 === 7 ? '- -' : (MOOD_EYES[m] ?? eyeStyleOf(b.eyeStyle).eyes)
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
      title = `${nameOf(s, lang)} ${b.isShiny ? '✦' : ''}${starsOf(b.rarity)} ${levelText(s, lang)}`
      bubble = q?.text ?? t.watching(nameOf(s, lang))
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

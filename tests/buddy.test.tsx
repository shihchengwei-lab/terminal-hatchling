import { expect, mock, test } from 'claude-code/testing'

import { addXp, deriveBuddy, level } from '../hooks/derive'
import { creedOf, inspirationsOf, trimAtBoundary } from '../hooks/prompts'
import { moodOf } from '../hooks/register'
import { parseSave } from '../hooks/save'
import { LEGENDARY_PRINCIPLES } from '../hooks/species'

const ZH = { options: { language: 'zh-TW' } }
const EN = { options: { language: 'en' } }

const BAND = { plugin: 'terminal-hatchling', component: 'AbovePrompt', props: { hasSurvey: false, isWorking: false } } as const
const USAGE = { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }
const SOUL_REPLY = '{"name":"鍋巴","persona":"看到沒關的檔案就會偷偷蓋上鍋蓋。"}'
const SAVE_X = {
  version: 2, seed: 'x', seedSource: 'random',
  soul: { name: '阿丸', persona: '愛碎念', species: deriveBuddy('x').species, v: 4, lang: 'zh-TW' },
  xp: 0, ascensions: 0, pets: 0, isHidden: false,
}
const CARD_ROW = (text: string, args = '') => ({
  plugin: 'terminal-hatchling', component: 'CommandOutput',
  props: { command: 'buddy', args, text, isErrored: false },
}) as const

const ZZZ = /^\s*z( Z)?( z)?\s*$/

async function start($: any, on: any, entries?: Record<string, unknown>) {
  // 代替引擎：外掛不畫時由這裡畫一行 engine
  on('ui.render', ($e: any, e: any) => {
    const { Text } = $e.ui.resolve(e)
    return <Text>engine</Text>
  })
  const clock = mock.clock(on, { now: 1_000_000 })
  mock.store(on, entries)
  on('command.register', () => ({ value: { command: 'buddy' } }))
  on('session.start', (_: unknown, e: any) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  return clock
}

test('same seed always gives the same buddy; stars spread as the rates say', async () => {
  expect(deriveBuddy('alice')).toEqual(deriveBuddy('alice'))
  const counts: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
  const legend = new Set<string>()
  for (let i = 0; i < 20000; i += 1) {
    const b = deriveBuddy(`user-${i}`)
    counts[b.rarity]! += 1
    if (b.rarity === 5) legend.add(b.species)
  }
  expect(counts[1]! / 20000).toBeGreaterThan(0.55)
  expect(counts[5]! / 20000).toBeLessThan(0.02)
  expect(legend.size).toBeGreaterThan(5)
})

test('nothing shows and nothing is called until the first /buddy hatches an egg', ZH, async ($, on) => {
  const reqs: any[] = []
  on('model.complete', (_: unknown, e: any) => {
    reqs.push(e)
    return { value: { isAnswered: true, text: SOUL_REPLY, usage: USAGE } }
  })
  const clock = await start($, on)
  let ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect((await ui.find({ type: 'Text' }))?.text).toBe('engine')
  await ui.unmount()
  await clock.settle()
  expect(reqs.length).toBe(0)

  const r = await $.command.run({ command: 'buddy', args: '' })
  expect(r.text).toContain('孵化')
  // 孵化中：輸入框上方畫蛋，/buddy card 也畫蛋
  ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect((await ui.find({ type: 'Text', text: /孵化中/ }))?.text).toBe('孵化中…')
  await ui.unmount()
  const egg = await $.command.run({ command: 'buddy', args: 'card' })
  ui = await $.ui.mount({ ...CARD_ROW(egg.text, 'card'), surface: 'desktop' })
  expect((await ui.find({ type: 'Text', text: /孵化中/ }))?.text).toBe('孵化中…')
  await ui.unmount()

  await clock.advance(5000)
  expect(reqs.length).toBe(1)
  expect(reqs[0].model).toBe('haiku')
  expect(reqs[0].system).toContain('一句話個性')
  expect(reqs[0].prompt).toMatch(/靈感詞：(\S+、){4}/)
  expect(inspirationsOf('x', 'zh-TW')).toEqual(inspirationsOf('x', 'zh-TW'))
  ui = await $.ui.mount({ ...BAND, surface: 'mobile' })
  expect((await ui.find({ type: 'Text', text: /鍋巴 孵出來了/ }))?.text).toContain('鍋巴')
  await ui.unmount()
})

test('/buddy then toggles hide and show as plain text; /buddy card draws the card', ZH, async ($, on) => {
  const forks: string[] = []
  on('model.fork', (_: unknown, e: any) => {
    forks.push(e.prompt)
    return { value: { isAnswered: true, text: 'idle|嗯。', usage: USAGE } }
  })
  on('turn.complete', (_: unknown, e: any) => ({ text: e.answer }))
  const clock = await start($, on, { 'buddy.bound.v1': SAVE_X })

  const hide = await $.command.run({ command: 'buddy', args: '' })
  expect(hide.text).toContain('躲起來了')
  let ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /阿丸/ })).toBeFalsy()
  await ui.unmount()
  ui = await $.ui.mount({ ...CARD_ROW(hide.text), surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /愛碎念/ })).toBeFalsy()
  await ui.unmount()

  // 隱藏時不評論
  await $.turn.complete({ answer: '長'.repeat(200), durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' })
  await clock.settle()
  expect(forks.length).toBe(0)

  const show = await $.command.run({ command: 'buddy', args: '' })
  expect(show.text).toBe('夥伴回來了。')
  ui = await $.ui.mount({ ...CARD_ROW(show.text), surface: 'terminal' })
  expect((await ui.find({ type: 'Text' }))?.text).toBe('engine')
  await ui.unmount()

  const c = await $.command.run({ command: 'buddy', args: 'card' })
  expect(c.text).toContain('愛碎念')
  for (const surface of ['terminal', 'desktop', 'vscode', 'mobile'] as const) {
    ui = await $.ui.mount({ ...CARD_ROW(c.text, 'card'), surface })
    expect((await ui.find({ type: 'Text', text: /愛碎念/ }))?.text).toContain('「愛碎念」')
    expect((await ui.find({ type: 'Text', text: /抓蟲/ }))?.text).toMatch(/抓蟲 [█░]{20} +\d+/)
    await ui.unmount()
  }
})

test('/buddy pet floats hearts; other arguments only print the usage', ZH, async ($, on) => {
  const clock = await start($, on, { 'buddy.bound.v1': SAVE_X })
  const r = await $.command.run({ command: 'buddy', args: 'pet' })
  expect(r.text).toContain('你摸了摸 阿丸')
  let ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect((await ui.find({ type: 'Text', text: /♥/ }))?.text).toContain('♥')
  await ui.unmount()
  await clock.advance(5000)
  ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /♥/ })).toBeFalsy()
  await ui.unmount()

  for (const args of ['name 小明', 'bind abc', 'mute', 'rates']) {
    const u = await $.command.run({ command: 'buddy', args })
    expect(u.text).toContain('/buddy pet')
  }
})

test('a long idle makes it sleepy; a prompt wakes it', ZH, async ($, on) => {
  on('prompt.submit', (_: unknown, e: any) => ({ text: e.text }))
  const clock = await start($, on, { 'buddy.bound.v1': SAVE_X })
  await clock.advance(6 * 60_000)
  let ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect((await ui.find({ type: 'Text', text: ZZZ }))?.text).toMatch(/z/)
  await ui.unmount()
  await $.prompt.submit({ text: '起床囉' })
  ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: ZZZ })).toBeFalsy()
  await ui.unmount()
})

test('a long answer forks once; the cooldown holds', ZH, async ($, on) => {
  let forks = 0
  on('model.fork', () => {
    forks += 1
    return { value: { isAnswered: true, text: 'worried|測試還沒跑喔。', usage: USAGE } }
  })
  on('turn.complete', (_: unknown, e: any) => ({ text: e.answer }))
  const clock = await start($, on, { 'buddy.bound.v1': SAVE_X })
  const answer = '很長的回答。'.repeat(30)
  await $.turn.complete({ answer, durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' })
  await clock.settle()
  await $.turn.complete({ answer, durationMs: 1, isAborted: false, turnId: 't2', reason: 'answer' })
  await clock.settle()
  expect(forks).toBe(1)
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect((await ui.find({ type: 'Text', text: /測試還沒跑/ }))?.text).toBe('測試還沒跑喔。')
  await ui.unmount()
})

test('a failed test is remembered and the end-of-turn fork talks about it', ZH, async ($, on) => {
  const completes: string[] = []
  const forks: string[] = []
  on('model.complete', (_: unknown, e: any) => {
    completes.push(e.prompt)
    return { value: { isAnswered: true, text: 'idle|嗯', usage: USAGE } }
  })
  on('model.fork', (_: unknown, e: any) => {
    forks.push(e.prompt)
    return { value: { isAnswered: true, text: 'worried|測試紅了，先別急著 commit。', usage: USAGE } }
  })
  on('tool.call', (_: unknown, e: any) =>
    e.command === 'ls'
      ? { result: {}, text: 'a b' }
      : e.command === 'cat x'
        ? { isError: true, result: 'x', text: 'No such file' }
        : { isError: true, result: 'x', text: '2 failed, 10 passed' },
  )
  on('turn.complete', (_: unknown, e: any) => ({ text: e.answer }))
  const clock = await start($, on, { 'buddy.bound.v1': SAVE_X })

  await $.tool.call({ tool: 'Bash', command: 'ls' })
  await $.tool.call({ tool: 'Bash', command: 'npm test' })
  await $.tool.call({ tool: 'Bash', command: 'cat x' })
  await clock.settle()
  expect(completes.length).toBe(0)
  expect(forks.length).toBe(0)

  await $.turn.complete({ answer: '好了', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' })
  await clock.settle()
  expect(forks.length).toBe(1)
  expect(forks[0]).toContain('跑的測試失敗了')
  expect(forks[0]).toContain('2 failed')

  await $.turn.complete({ answer: '好', durationMs: 1, isAborted: false, turnId: 't2', reason: 'answer' })
  await clock.settle()
  expect(forks.length).toBe(1)
})

test('saying the name gets a reply from Haiku; other messages do not', ZH, async ($, on) => {
  const prompts: string[] = []
  on('model.complete', (_: unknown, e: any) => {
    prompts.push(e.prompt)
    return { value: { isAnswered: true, text: 'happy|叫我嗎？我在！', usage: USAGE } }
  })
  on('prompt.submit', (_: unknown, e: any) => ({ text: e.text }))
  const clock = await start($, on, { 'buddy.bound.v1': SAVE_X })
  await $.prompt.submit({ text: '幫我修這個 bug' })
  await clock.settle()
  expect(prompts.length).toBe(0)
  await $.prompt.submit({ text: '阿丸你覺得呢？' })
  await clock.settle()
  expect(prompts.length).toBe(1)
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect((await ui.find({ type: 'Text', text: /我在/ }))?.text).toBe('叫我嗎？我在！')
  await ui.unmount()
})

test('an old persona is rewritten with the current prompt', ZH, async ($, on) => {
  let calls = 0
  on('model.complete', () => {
    calls += 1
    return { value: { isAnswered: true, text: SOUL_REPLY, usage: USAGE } }
  })
  const clock = await start($, on, {
    'buddy.bound.v1': { ...SAVE_X, soul: { name: '舊名', persona: '很長的舊人設', species: 'kettle' } },
  })
  await clock.settle()
  expect(calls).toBe(1)
  const c = await $.command.run({ command: 'buddy', args: 'card' })
  expect(c.text).toContain('鍋蓋')
})

test('hatching seeds from the git global email; the same email gives the same buddy anywhere', ZH, async ($, on) => {
  const argvs: string[][] = []
  on('process.run', (_: unknown, e: any) => {
    argvs.push(e.argv)
    return { value: { exitCode: 0, stdout: 'Someone@Example.com\n', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  on('model.complete', () => ({ value: { isAnswered: true, text: SOUL_REPLY, usage: USAGE } }))
  const clock = await start($, on)
  await $.command.run({ command: 'buddy', args: '' })
  await clock.advance(5000)
  expect(argvs[0]).toEqual(['git', 'config', '--global', 'user.email'])
  const c = await $.command.run({ command: 'buddy', args: 'card' })
  expect(c.text).toContain('綁定：git email')
  expect(c.text).not.toContain('Example.com')
  expect(c.text).not.toContain('someone')
})

test('without git it falls back to a random seed', ZH, async ($, on) => {
  on('process.run', () => ({ value: { exitCode: 1, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }))
  on('model.complete', () => ({ value: { isAnswered: true, text: SOUL_REPLY, usage: USAGE } }))
  const clock = await start($, on)
  await $.command.run({ command: 'buddy', args: '' })
  await clock.advance(5000)
  const c = await $.command.run({ command: 'buddy', args: 'card' })
  expect(c.text).toContain('這台機器的隨機種子')
})

test('in English the hatch prompt, card, comments and replies are English', EN, async ($, on) => {
  const completes: any[] = []
  const forks: string[] = []
  on('model.complete', (_: unknown, e: any) => {
    completes.push(e)
    return e.system.includes('invent coding companions')
      ? { value: { isAnswered: true, text: '{"name":"Crumbs","persona":"Sweeps unused imports under the rug and denies it."}', usage: USAGE } }
      : { value: { isAnswered: true, text: 'happy|You rang? I was napping on the stack trace.', usage: USAGE } }
  })
  on('model.fork', (_: unknown, e: any) => {
    forks.push(e.prompt)
    return { value: { isAnswered: true, text: 'worried|Those tests are red; maybe hold the commit.', usage: USAGE } }
  })
  on('tool.call', () => ({ isError: true, result: 'x', text: '1 failed' }))
  on('turn.complete', (_: unknown, e: any) => ({ text: e.answer }))
  on('prompt.submit', (_: unknown, e: any) => ({ text: e.text }))
  const clock = await start($, on)

  const r = await $.command.run({ command: 'buddy', args: '' })
  expect(r.text).toBe('An egg starts to hatch...')
  await clock.advance(5000)
  expect(completes[0].system).toContain('Write in English')
  expect(completes[0].prompt).toMatch(/Inspiration words: [a-zA-Z' -]+(, [a-zA-Z' -]+){4}/)

  const c = await $.command.run({ command: 'buddy', args: 'card' })
  expect(c.text).toContain('Crumbs')
  expect(c.text).toContain('Personality: Sweeps unused imports')
  expect(c.text).toMatch(/BUG-SNIFF/)
  let ui = await $.ui.mount({ ...CARD_ROW(c.text, 'card'), surface: 'desktop' })
  expect((await ui.find({ type: 'Text', text: /Sweeps/ }))?.text).toBe('"Sweeps unused imports under the rug and denies it."')
  await ui.unmount()

  await $.tool.call({ tool: 'Bash', command: 'npm test' })
  await $.turn.complete({ answer: 'done', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' })
  await clock.settle()
  expect(forks[0]).toContain('the tests failed')
  expect(forks[0]).toContain('in English')

  await $.prompt.submit({ text: 'Crumbs, what do you think?' })
  await clock.settle()
  expect(completes[1].system).toContain('in English')
  ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect((await ui.find({ type: 'Text', text: /You rang/ }))?.text).toContain('napping')
  await ui.unmount()

  const u = await $.command.run({ command: 'buddy', args: 'what' })
  expect(u.text).toContain('/buddy pet: pet')
})

test('auto follows LANG; a persona written in another language is rewritten', async ($, on) => {
  mock.env(on, { LANG: 'zh_TW.UTF-8' })
  const systems: string[] = []
  on('model.complete', (_: unknown, e: any) => {
    systems.push(e.system)
    return { value: { isAnswered: true, text: SOUL_REPLY, usage: USAGE } }
  })
  const clock = await start($, on, {
    'buddy.bound.v1': { ...SAVE_X, soul: { ...SAVE_X.soul, lang: 'en' } },
  })
  await clock.settle()
  expect(systems.length).toBe(1)
  expect(systems[0]).toContain('台灣繁體中文')
  const c = await $.command.run({ command: 'buddy', args: 'card' })
  expect(c.text).toContain('鍋蓋')
})

test('auto with no language hint is English', async ($, on) => {
  mock.env(on, {})
  await start($, on)
  const r = await $.command.run({ command: 'buddy', args: '' })
  expect(r.text).toBe('An egg starts to hatch...')
})

test('every companion has one clear strength and one clear weakness; the hatch prompt names both', ZH, async ($, on) => {
  for (let i = 0; i < 2000; i += 1) {
    const b = deriveBuddy(`stats-${i}`)
    const values = Object.values(b.stats).sort((x, y) => y - x)
    expect(values.length).toBe(5)
    expect(values[0]! > values[1]!).toBe(true)
    expect(values[3]! > values[4]!).toBe(true)
    expect(values[0]! - values[4]!).toBeGreaterThanOrEqual(25)
  }
  const reqs: any[] = []
  on('model.complete', (_: unknown, e: any) => {
    reqs.push(e)
    return { value: { isAnswered: true, text: SOUL_REPLY, usage: USAGE } }
  })
  const clock = await start($, on)
  await $.command.run({ command: 'buddy', args: '' })
  await clock.advance(5000)
  expect(reqs[0].prompt).toMatch(/最高：(抓蟲|定力|脫序|執念|酸度) \d+；最低：(抓蟲|定力|脫序|執念|酸度) \d+/)
  expect(reqs[0].system).toContain('強項要強到變成毛病')
})

test('a long personality is cut at a word or sentence boundary, never mid-word', async () => {
  const long = "Vinnick is a fox so unshakably calm that it reads every function with the same flat, record-player patience, declares the code 'almost certainly a trap' in a tone like a calculator's display, and then refuses to say which trap, since its notes are classified."
  const t = trimAtBoundary(long, 260)
  expect(t.length).toBeLessThanOrEqual(261)
  expect(t.endsWith('…') || t.endsWith('.')).toBe(true)
  expect(t).not.toMatch(/ no…$/)
  expect(trimAtBoundary('短的。', 80)).toBe('短的。')
  const zh = '牠看到變數名稱不順眼就會整晚碎念，堅持把每個 i 改成 indexOfTheThingWeAreLookingAt，還會在註解裡偷偷寫詩，然後否認那是牠寫的，最後再把詩刪掉假裝沒發生過這件事情。'
  const tz = trimAtBoundary(zh, 40)
  expect(tz.length).toBeLessThanOrEqual(41)
  expect(tz.endsWith('…') || tz.endsWith('。')).toBe(true)
})

test('rewriting an old-format persona keeps the name', ZH, async ($, on) => {
  on('model.complete', () => ({ value: { isAnswered: true, text: SOUL_REPLY, usage: USAGE } }))
  const clock = await start($, on, { 'buddy.bound.v1': { ...SAVE_X, soul: { ...SAVE_X.soul, v: 3 } } })
  await clock.settle()
  const c = await $.command.run({ command: 'buddy', args: 'card' })
  expect(c.text).toContain('阿丸')
  expect(c.text).toContain('鍋蓋')
})

test('hitting the max level ascends one star and resets xp; 5 stars stays at max', async () => {
  expect(level(242)).toBe(9)
  expect(level(243)).toBe(10)
  expect(level(99999)).toBe(10)
  // 每多一顆星，滿級需要的經驗值 ×2
  expect(level(485, 2)).toBe(9)
  expect(level(486, 2)).toBe(10)
  expect(level(971, 3)).toBe(9)
  expect(level(972, 3)).toBe(10)
  expect(level(1943, 4)).toBe(9)
  expect(level(1944, 4)).toBe(10)
  let seed = ''
  for (let i = 0; !seed; i += 1) if (deriveBuddy(`asc-${i}`).rarity === 1) seed = `asc-${i}`
  const base = { version: 2 as const, seed, seedSource: 'random' as const, soul: null, xp: 242, ascensions: 0, pets: 0, isHidden: false }
  const { next, promoted } = addXp(base, 1)
  expect(promoted).toBe(true)
  expect(next.xp).toBe(0)
  expect(next.ascensions).toBe(1)
  const before = deriveBuddy(seed, 0)
  const after = deriveBuddy(seed, 1)
  expect(after.rarity).toBe(2)
  expect(after.species).toBe(before.species)
  expect(after.isShiny).toBe(before.isShiny)
  expect(after.eyeStyle).toBe(before.eyeStyle)
  expect(deriveBuddy(seed, 9).rarity).toBe(5)
  const top = addXp({ ...base, ascensions: 4, xp: 500 }, 1)
  expect(top.promoted).toBe(false)
  expect(top.next.xp).toBe(501)
})

test('ascending keeps the name and evolves the old personality instead of replacing it', ZH, async ($, on) => {
  const reqs: any[] = []
  on('model.complete', (_: unknown, e: any) => {
    reqs.push(e)
    return { value: { isAnswered: true, text: '{"persona":"愛碎念，現在連註解裡的錯字都要逐字唸出來。"}', usage: USAGE } }
  })
  on('turn.complete', (_: unknown, e: any) => ({ text: e.answer }))
  let seed = ''
  for (let i = 0; !seed; i += 1) if (deriveBuddy(`asc-${i}`).rarity === 1) seed = `asc-${i}`
  const clock = await start($, on, {
    'buddy.bound.v1': {
      ...SAVE_X, seed, xp: 242,
      soul: { name: '阿丸', persona: '愛碎念', species: deriveBuddy(seed).species, v: 4, lang: 'zh-TW' },
    },
  })
  await $.turn.complete({ answer: '好', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' })
  await clock.settle()
  expect(reqs.length).toBe(1)
  expect(reqs[0].system).toContain('保留牠原本的個性核心')
  expect(reqs[0].prompt).toContain('原本的個性：愛碎念')
  expect(reqs[0].prompt).toContain('★★☆☆☆')
  const c = await $.command.run({ command: 'buddy', args: 'card' })
  expect(c.text).toContain('阿丸')
  expect(c.text).toContain('★★☆☆☆ 少見')
  expect(c.text).toContain('逐字唸出來')
  expect(c.text).toContain('升階 1 次')
  expect(c.text).toContain('Lv.1')
})

test('a language change rewrites from the old personality and keeps its quirks; a new species starts over', ZH, async ($, on) => {
  const reqs: any[] = []
  on('model.complete', (_: unknown, e: any) => {
    reqs.push(e)
    return { value: { isAnswered: true, text: '{"name":"文尼克","persona":"冷靜到可疑，堅持每行都藏著陷阱，連註解錯字都逐字唸。"}', usage: USAGE } }
  })
  const clock = await start($, on, {
    'buddy.bound.v1': {
      ...SAVE_X, ascensions: 1,
      soul: { name: 'Vinnick', persona: 'Calm to the point of suspicion; now also reads typos in comments aloud.', species: deriveBuddy('x').species, v: 4, lang: 'en' },
    },
  })
  await clock.settle()
  expect(reqs.length).toBe(1)
  expect(reqs[0].system).toContain('保留牠原本的名字、個性核心和所有怪癖')
  expect(reqs[0].prompt).toContain('reads typos in comments aloud')
  const c = await $.command.run({ command: 'buddy', args: 'card' })
  expect(c.text).toContain('文尼克')
  expect(c.text).toContain('逐字唸')
})

test('a soul written for another species is replaced with a fresh one', ZH, async ($, on) => {
  const reqs: any[] = []
  on('model.complete', (_: unknown, e: any) => {
    reqs.push(e)
    return { value: { isAnswered: true, text: SOUL_REPLY, usage: USAGE } }
  })
  const clock = await start($, on, {
    'buddy.bound.v1': { ...SAVE_X, soul: { name: '舊名', persona: '茶壺人設', species: 'kettle', v: 4, lang: 'zh-TW' } },
  })
  await clock.settle()
  expect(reqs[0].system).toContain('一句話個性')
  const c = await $.command.run({ command: 'buddy', args: 'card' })
  expect(c.text).toContain('鍋巴')
})

test('if the rewrite fails the old personality stays', ZH, async ($, on) => {
  on('model.complete', () => ({ value: { isAnswered: false, reason: 'empty-reply', usage: USAGE } }))
  const clock = await start($, on, { 'buddy.bound.v1': { ...SAVE_X, soul: { ...SAVE_X.soul, v: 3 } } })
  await clock.settle()
  const c = await $.command.run({ command: 'buddy', args: 'card' })
  expect(c.text).toContain('愛碎念')
})

test('about 1% hatch as the hidden species; nothing else about them changes', ZH, async ($, on) => {
  let crows = 0
  let crowSeed = ''
  for (let i = 0; i < 20000; i += 1) {
    const b = deriveBuddy(`h-${i}`)
    if (b.species === 'crow') {
      crows += 1
      crowSeed ||= `h-${i}`
    }
  }
  expect(crows / 20000).toBeGreaterThan(0.005)
  expect(crows / 20000).toBeLessThan(0.02)
  await start($, on, { 'buddy.bound.v1': { ...SAVE_X, seed: crowSeed, soul: { name: '阿丸', persona: '藏東西', species: 'crow', v: 4, lang: 'zh-TW' } } })
  const c = await $.command.run({ command: 'buddy', args: 'card' })
  expect(c.text).toContain('烏鴉')
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect((await ui.find({ type: 'Text', text: /==>/ }))?.text).toContain('==>')
  await ui.unmount()
})

test('the hidden species: Haiku still writes its personality, but every prompt centres it on its principle', ZH, async ($, on) => {
  let crowSeed = ''
  for (let i = 0; !crowSeed; i += 1) {
    const b = deriveBuddy(`h-${i}`)
    if (b.species === 'crow' && b.rarity === 1) crowSeed = `h-${i}`
  }
  const reqs: any[] = []
  const forks: string[] = []
  on('model.complete', (_: unknown, e: any) => {
    reqs.push(e)
    return reqs.length === 1
      ? { value: { isAnswered: true, text: '{"name":"黑豆","persona":"把每個 null 都叼走藏起來，堅持型別要讓錯的狀態根本做不出來。"}', usage: USAGE } }
      : { value: { isAnswered: true, text: '{"persona":"現在連布林旗標都要叼走，換成列舉才肯還。"}', usage: USAGE } }
  })
  on('model.fork', (_: unknown, e: any) => {
    forks.push(e.prompt)
    return { value: { isAnswered: true, text: 'worried|這個欄位可以是 null？', usage: USAGE } }
  })
  on('turn.complete', (_: unknown, e: any) => ({ text: e.answer }))
  const clock = await start($, on, { 'buddy.bound.v1': { ...SAVE_X, seed: crowSeed, xp: 0, soul: null } })
  await clock.settle()
  expect(reqs[0].system).toContain('Make invalid states impossible to construct.')
  let c = await $.command.run({ command: 'buddy', args: 'card' })
  expect(c.text).toContain('黑豆')
  expect(c.text).toContain('null 都叼走')

  await $.turn.complete({ answer: '長'.repeat(200), durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' })
  await clock.settle()
  expect(forks[0]).toContain('Make invalid states impossible to construct.')

})

test('when the hidden species ascends, Haiku evolves its personality with the principle still in the prompt', ZH, async ($, on) => {
  let crowSeed = ''
  for (let i = 0; !crowSeed; i += 1) {
    const b = deriveBuddy(`h-${i}`)
    if (b.species === 'crow' && b.rarity === 1) crowSeed = `h-${i}`
  }
  const reqs: any[] = []
  on('model.complete', (_: unknown, e: any) => {
    reqs.push(e)
    return { value: { isAnswered: true, text: '{"persona":"現在連布林旗標都要叼走，換成列舉才肯還。"}', usage: USAGE } }
  })
  on('turn.complete', (_: unknown, e: any) => ({ text: e.answer }))
  const clock = await start($, on, {
    'buddy.bound.v1': { ...SAVE_X, seed: crowSeed, xp: 242, soul: { name: '黑豆', persona: '把每個 null 都叼走', species: 'crow', v: 4, lang: 'zh-TW' } },
  })
  await $.turn.complete({ answer: '好', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' })
  await clock.settle()
  expect(reqs.length).toBe(1)
  expect(reqs[0].system).toContain('保留牠原本的個性核心')
  expect(reqs[0].system).toContain('Make invalid states impossible to construct.')
  const c = await $.command.run({ command: 'buddy', args: 'card' })
  expect(c.text).toContain('黑豆')
  expect(c.text).toContain('換成列舉才肯還')
})

test('parseSave turns any old or broken shape into one valid save, or nothing', async () => {
  expect(parseSave(null)).toBe(null)
  expect(parseSave({})).toBe(null)
  expect(parseSave({ seed: '' })).toBe(null)
  // 最早的格式：沒有版本、沒有 seedSource、soul 可能 undefined、還有自訂名字
  const old = parseSave({ seed: 'git:abc', name: '小黑', xp: 7, pets: 2, isHidden: false, soul: { name: '舊名', persona: 'p', species: 'fox' } })
  expect(old).toEqual({
    version: 2, seed: 'git:abc', seedSource: 'git',
    soul: { name: '小黑', persona: 'p', species: 'fox', v: 0, lang: 'zh-TW' },
    xp: 7, ascensions: 0, pets: 2, isHidden: false,
  })
  // 壞掉的數值收斂成合法值；半套的人設當成還沒寫
  const broken = parseSave({ seed: 'r', xp: -3, pets: 1.5, ascensions: 99, isHidden: 'yes', soul: { name: 'n' } })
  expect(broken).toEqual({
    version: 2, seed: 'r', seedSource: 'random', soul: null,
    xp: 0, ascensions: 4, pets: 0, isHidden: false,
  })
  // 已經是新格式就原樣通過
  const v2 = { ...SAVE_X, seed: 'git:z', seedSource: 'git' }
  expect(parseSave(v2)).toEqual(v2)
})

test('an old save on disk is migrated once and keeps its companion', ZH, async ($, on) => {
  on('model.complete', () => ({ value: { isAnswered: true, text: SOUL_REPLY, usage: USAGE } }))
  const clock = await start($, on, {
    'buddy.bound.v1': { seed: 'x', name: null, xp: 5, pets: 1, isHidden: false, soul: { name: '阿丸', persona: '愛碎念', species: deriveBuddy('x').species, v: 4 } },
  })
  await clock.settle()
  const c = await $.command.run({ command: 'buddy', args: 'card' })
  expect(c.text).toContain('阿丸')
  expect(c.text).toContain('愛碎念')
  expect(c.text).toContain('被摸 1 次')
})

test('while hidden nothing calls a model and no xp is gained; showing it again catches up', ZH, async ($, on) => {
  const completes: any[] = []
  let forks = 0
  on('model.complete', (_: unknown, e: any) => {
    completes.push(e)
    return { value: { isAnswered: true, text: SOUL_REPLY, usage: USAGE } }
  })
  on('model.fork', () => {
    forks += 1
    return { value: { isAnswered: true, text: 'idle|嗯', usage: USAGE } }
  })
  on('tool.call', () => ({ isError: true, result: 'x', text: '1 failed' }))
  on('turn.complete', (_: unknown, e: any) => ({ text: e.answer }))
  on('prompt.submit', (_: unknown, e: any) => ({ text: e.text }))
  // 舊人設（版本 3）、藏著、經驗值差 1 就升階
  const clock = await start($, on, {
    'buddy.bound.v1': { ...SAVE_X, isHidden: true, xp: 242, soul: { ...SAVE_X.soul, v: 3 } },
  })
  await clock.settle()
  await $.prompt.submit({ text: '阿丸你在嗎' })
  await $.tool.call({ tool: 'Bash', command: 'npm test' })
  await $.turn.complete({ answer: '長'.repeat(200), durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' })
  await clock.settle()
  expect(completes.length).toBe(0)
  expect(forks).toBe(0)

  const back = await $.command.run({ command: 'buddy', args: '' })
  expect(back.text).toContain('回來了')
  await clock.settle()
  // 叫出來後才補寫人設；經驗值沒有在藏著時增加，所以沒有升階
  expect(completes.length).toBe(1)
  expect(completes[0].system).toContain('保留牠原本的名字')
  const c = await $.command.run({ command: 'buddy', args: 'card' })
  expect(c.text).not.toContain('升階')
})

test('the mood shown is derived, with one fixed priority', async () => {
  const base = { isWorking: false, now: 1_000_000, lastActiveAt: 1_000_000, pending: null, quip: null }
  expect(moodOf(base)).toBe('idle')
  expect(moodOf({ ...base, quip: { text: 'x', mood: 'happy', at: 999_000 } })).toBe('happy')
  expect(moodOf({ ...base, quip: { text: 'x', mood: 'happy', at: 0 } })).toBe('idle')
  expect(moodOf({ ...base, pending: { kind: 'error', detail: '' }, quip: { text: 'x', mood: 'happy', at: 999_000 } })).toBe('worried')
  expect(moodOf({ ...base, lastActiveAt: 0, pending: { kind: 'error', detail: '' } })).toBe('sleepy')
  expect(moodOf({ ...base, isWorking: true, lastActiveAt: 0 })).toBe('busy')
})

test('legendary companions get the principle that matches their strength; the crow keeps its own', ZH, async ($, on) => {
  const seen = new Map<string, string>()
  for (let i = 0; i < 20000 && seen.size < 5; i += 1) {
    const b = deriveBuddy(`L-${i}`)
    if (b.rarity === 5 && b.species !== 'crow') seen.set(b.strength, creedOf(b)!)
    if (b.rarity < 5 && b.species !== 'crow') expect(creedOf(b)).toBe(null)
  }
  expect(seen.get('bugsniff')).toMatch(/^Invalid states:/)
  expect(seen.get('calm')).toMatch(/^Causal direction:/)
  expect(seen.get('mayhem')).toMatch(/^Local predictability:/)
  expect(seen.get('obsession')).toMatch(/^Single source:/)
  expect(seen.get('sass')).toMatch(/^Necessary complexity:/)

  // 升階到 5 星的那一刻起，提示詞就帶上原則
  let seed = ''
  for (let i = 0; !seed; i += 1) {
    const b = deriveBuddy(`L4-${i}`)
    if (b.rarity === 4 && b.species !== 'crow') seed = `L4-${i}`
  }
  expect(creedOf(deriveBuddy(seed, 0))).toBe(null)
  expect(creedOf(deriveBuddy(seed, 1))).toBe(LEGENDARY_PRINCIPLES[deriveBuddy(seed).strength])
  const reqs: any[] = []
  on('model.complete', (_: unknown, e: any) => {
    reqs.push(e)
    return { value: { isAnswered: true, text: '{"persona":"更怪了"}', usage: USAGE } }
  })
  on('turn.complete', (_: unknown, e: any) => ({ text: e.answer }))
  const clock = await start($, on, {
    'buddy.bound.v1': { ...SAVE_X, seed, xp: 1943, soul: { name: '阿丸', persona: '原本的', species: deriveBuddy(seed).species, v: 4, lang: 'zh-TW' } },
  })
  await $.turn.complete({ answer: '好', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' })
  await clock.settle()
  expect(reqs.length).toBe(1)
  expect(reqs[0].system).toContain(creedOf(deriveBuddy(seed, 1))!)
})

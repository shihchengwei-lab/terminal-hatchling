import { expect, mock, test } from 'claude-code/testing'

import { deriveBuddy, inspirationsOf } from '../hooks/register'

const ZH = { options: { language: 'zh-TW' } }
const EN = { options: { language: 'en' } }

const BAND = { plugin: 'terminal-hatchling', component: 'AbovePrompt', props: { hasSurvey: false, isWorking: false } } as const
const USAGE = { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }
const SOUL_REPLY = '{"name":"鍋巴","persona":"看到沒關的檔案就會偷偷蓋上鍋蓋。"}'
const SAVE_X = {
  seed: 'x', soul: { name: '阿丸', persona: '愛碎念', species: deriveBuddy('x').species, v: 3 },
  name: null, xp: 0, pets: 0, isHidden: false,
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
  ui = await $.ui.mount({ ...CARD_ROW(r.text), surface: 'desktop' })
  expect((await ui.find({ type: 'Text', text: /孵化中/ }))?.text).toBe('孵化中…')
  await ui.unmount()

  await clock.advance(5000)
  expect(reqs.length).toBe(1)
  expect(reqs[0].model).toBe('haiku')
  expect(reqs[0].system).toContain('一句話個性')
  expect(reqs[0].prompt).toMatch(/靈感詞：(\S+、){4}/)
  expect(inspirationsOf('x')).toEqual(inspirationsOf('x'))
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

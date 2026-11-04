import type { Rarity, StatName } from '../types'

export type Lang = 'en' | 'zh-TW'

/** 依設定值決定語言：auto 時看 Claude Code 的 language 設定，再看環境變數 LANG */
export function resolveLang(option: unknown, settingsLanguage: unknown, envLang: string | undefined): Lang {
  if (option === 'en' || option === 'zh-TW') return option
  const hint = `${typeof settingsLanguage === 'string' ? settingsLanguage : ''} ${envLang ?? ''}`
  return /zh|chinese|中文|mandarin|taiwan/i.test(hint) ? 'zh-TW' : 'en'
}

type Strings = {
  rarity: Record<Rarity, string>
  stat: Record<StatName, string>
  weirdness: Record<Rarity, string>
  shiny: string
  listSep: string
  quipMax: number
  personaMax: number
  // 孵化
  soulSystem: string
  soulPrompt: (p: { rarity: string; weird: string; shiny: boolean; species: string; desc: string; stats: string; high: string; low: string; words: string }) => string
  // 改語言或改寫法時重寫：保留原本的名字和怪癖
  preserveSystem: string
  preservePrompt: (p: { name: string; species: string; persona: string }) => string
  // 滿級升階：在原本的個性上變怪
  evolveSystem: string
  evolvePrompt: (p: { name: string; species: string; persona: string; rarity: string; weird: string; high: string; low: string }) => string
  promotedSay: (name: string, tag: string) => string
  maxLevel: string
  cardAscensions: (n: number) => string
  // 每輪評論（fork）
  forkPersona: (p: { name: string; desc: string; rarity: string; persona: string | null; trait: string; sass: number; mayhem: number }) => string[]
  forkEvent: (label: string, detail: string) => string[]
  forkSkip: string
  formatLine: string
  // 叫名字（Haiku）
  callSystem: (p: { name: string; desc: string; persona: string | null; trait: string }) => string[]
  callPrompt: (text: string) => string
  // 事件
  event: Record<'error' | 'test-failed' | 'big-edit', string>
  detailTest: (cmd: string, tail: string) => string
  detailError: (tool: string, cmd: string, err: string) => string
  detailBigEdit: (tool: string, file: string, lines: number) => string
  // 介面與指令
  commandDescription: string
  usage: string
  hatchText: string
  hideText: string
  back: string
  noBuddy: string
  petted: (name: string, lv: number) => string
  petSay: (name: string) => string
  hatchedSay: (name: string, tag: string) => string
  watching: (name: string) => string
  hatching: string
  crack: [string, string]
  fallback: string
  cardTrait: string
  cardEyes: string
  cardPersona: string
  cardPets: (n: number) => string
  bindGit: string
  bindRandom: string
  cardFallbackPersona: (desc: string, trait: string) => string
}

export const STRINGS: Record<Lang, Strings> = {
  'zh-TW': {
    rarity: { 1: '普通', 2: '少見', 3: '稀有', 4: '史詩', 5: '傳說' },
    stat: { bugsniff: '抓蟲', calm: '定力', mayhem: '脫序', obsession: '執念', sass: '酸度' },
    weirdness: {
      1: '普通的小傢伙，只有一點點怪',
      2: '比一般的再怪一點',
      3: '怪得很具體，讓人記得住',
      4: '非常怪，有很鮮明的執念',
      5: '傳說級：真的很奇怪，奇怪到讓人愣一下',
    },
    shiny: '閃光',
    listSep: '、',
    quipMax: 60,
    personaMax: 80,
    soulSystem: [
      '你負責發明「寫程式夥伴」：住在開發者終端機裡的小生物，偶爾會對他們的程式碼發表意見。',
      '根據稀有度、物種、屬性和幾個靈感詞，發明：',
      '1. 名字：一個詞，2 到 4 個中文字，好記、帶一點荒謬感，原創、不要用現有作品的角色名。',
      '2. 一句話個性：不超過 50 字，具體、好笑，包含一個會影響牠怎麼評論程式碼的怪癖。',
      '個性必須從最高和最低的屬性長出來：強項要強到變成毛病，弱項要弱到讓人擔心。不要寫成「可愛、熱心、有點迷糊」這種普通個性。',
      '屬性意思：抓蟲＝找 bug 的嗅覺，定力＝多沉得住氣，脫序＝多難預測，執念＝多容易鑽牛角尖，酸度＝嘴多毒。',
      '稀有度越高，越怪、越具體、越讓人記得住。',
      '用台灣繁體中文。只輸出 JSON：{"name":"…","persona":"…"}，不要其他文字。',
    ].join('\n'),
    soulPrompt: p =>
      [
        `稀有度：${p.rarity}（${p.weird}）${p.shiny ? '，閃光個體' : ''}`,
        `物種：${p.species}（${p.desc}）`,
        `屬性：${p.stats}`,
        `最高：${p.high}；最低：${p.low}`,
        `靈感詞：${p.words}`,
      ].join('\n'),
    preserveSystem: [
      '你負責整理一隻終端機寫程式夥伴的設定。',
      '保留牠原本的名字、個性核心和所有怪癖，不要變得更普通，也不要換成另一隻。',
      '只把個性改寫成一句不超過 50 字的台灣繁體中文；名字如果不是中文，就自然地翻譯或音譯成 2 到 4 個中文字，是中文就照抄。',
      '只輸出 JSON：{"name":"…","persona":"…"}，不要其他文字。',
    ].join('\n'),
    preservePrompt: p => [`名字：${p.name}（${p.species}）`, `原本的個性：${p.persona}`].join('\n'),
    evolveSystem: [
      '你負責讓一隻終端機寫程式夥伴「升階」：牠剛升了一顆星。',
      '保留牠原本的個性核心和怪癖，不要換掉或重寫成另一隻；在原本的基礎上變得更怪：把原有的怪癖推得更極端，或長出一個跟原本怪癖有關的新毛病。',
      '寫成一句話，不超過 50 字，用台灣繁體中文。只輸出 JSON：{"persona":"…"}，不要其他文字。',
    ].join('\n'),
    evolvePrompt: p =>
      [
        `名字：${p.name}（${p.species}）`,
        `新的稀有度：${p.rarity}（${p.weird}）`,
        `最高：${p.high}；最低：${p.low}`,
        `原本的個性：${p.persona}`,
      ].join('\n'),
    promotedSay: (name, tag) => `${name} 升階了！【${tag}】而且變得更怪了。`,
    maxLevel: 'MAX',
    cardAscensions: n => `升階 ${n} 次`,
    forkPersona: p => [
      '（這是一則旁支請求，與主對話無關，不要回覆主對話的使用者。）',
      `你現在扮演「${p.name}」：${p.desc}，是使用者寫程式時坐在終端機角落的夥伴（${p.rarity}）。`,
      p.persona ? `人設：${p.persona}` : `個性：${p.trait}。酸度 ${p.sass}/100、脫序 ${p.mayhem}/100。`,
      '你會注意主對話裡使用者可能漏看的重點（風險、待辦、沒驗證的假設），用角色口吻提醒。',
      '你沒有工具，不要想太久，立刻回答。',
      '讀完上面主對話的最後一輪，用台灣繁體中文寫一句不超過 40 字的話。',
    ],
    forkEvent: (label, detail) => [
      `這一輪${label}，請優先針對這件事說（提醒、吐槽或安慰），不要輸出 SKIP。`,
      `參考細節：\n${detail}`,
    ],
    forkSkip: '這輪沒什麼值得說的，就只輸出 SKIP。',
    formatLine: '只輸出一行，格式「心情|台詞」，心情只能是 idle、busy、happy、worried、sleepy 之一。',
    callSystem: p => [
      `你是「${p.name}」：${p.desc}，使用者寫程式時坐在終端機角落的夥伴。`,
      p.persona ? `人設：${p.persona}` : `個性：${p.trait}。`,
      '用台灣繁體中文回一句不超過 40 字的話。',
    ],
    callPrompt: text => `使用者在訊息裡叫了你，訊息是：\n${text}`,
    event: { 'error': '有工具出錯', 'test-failed': '跑的測試失敗了', 'big-edit': '一次改了很大一段程式碼' },
    detailTest: (cmd, tail) => `指令：${cmd}\n輸出結尾：${tail}`,
    detailError: (tool, cmd, err) => `工具：${tool}${cmd ? `（${cmd}）` : ''}\n錯誤：${err}`,
    detailBigEdit: (tool, file, lines) => `${tool} ${file}，一次寫了 ${lines} 行`,
    commandDescription: '你的夥伴：第一次孵蛋，之後顯示或隱藏；/buddy card 角色卡；/buddy pet 摸摸',
    usage: '/buddy：第一次孵蛋，之後顯示或隱藏（隱藏時不評論）｜/buddy card：角色卡｜/buddy pet：摸摸',
    hatchText: '一顆蛋開始孵化了……',
    hideText: '夥伴躲起來了。隱藏時牠不會評論，也不會呼叫模型。',
    back: '夥伴回來了。',
    noBuddy: '你還沒有夥伴。輸入 /buddy 孵一顆蛋。',
    petted: (name, lv) => `你摸了摸 ${name}。Lv.${lv}`,
    petSay: name => `${name} 開心地晃了晃。`,
    hatchedSay: (name, tag) => `${name} 孵出來了！【${tag}】`,
    watching: name => `（${name} 在旁邊看著）`,
    hatching: '孵化中…',
    crack: ['喀…', '喀喀…'],
    fallback: '夥伴這次沒反應，再試一次。',
    cardTrait: '個性',
    cardEyes: '眼睛',
    cardPersona: '人設',
    cardPets: n => `被摸 ${n} 次`,
    bindGit: '綁定：git email（換機器、同 email 是同一隻）',
    bindRandom: '綁定：這台機器的隨機種子',
    cardFallbackPersona: (desc, trait) => `${desc}。個性${trait}。`,
  },
  en: {
    rarity: { 1: 'Common', 2: 'Uncommon', 3: 'Rare', 4: 'Epic', 5: 'Legendary' },
    stat: { bugsniff: 'BUG-SNIFF', calm: 'CALM', mayhem: 'MAYHEM', obsession: 'OBSESSION', sass: 'SASS' },
    weirdness: {
      1: 'an ordinary little critter, only slightly odd',
      2: 'a bit odder than most',
      3: 'odd in a specific, memorable way',
      4: 'very odd, with a vivid obsession',
      5: 'legendary: genuinely strange, strange enough to make you pause',
    },
    shiny: 'Shiny',
    listSep: ', ',
    quipMax: 120,
    personaMax: 260,
    soulSystem: [
      'You invent coding companions: small creatures that live in a developer\'s terminal and now and then remark on their code.',
      'From a rarity, a species, stats and a few inspiration words, invent:',
      '1. A name: one word, at most 12 characters, memorable and a little absurd, original (not a character from an existing work).',
      '2. A one-sentence personality of at most 30 words: specific and funny, with one quirk that shapes how it comments on code.',
      'The personality must grow out of its highest and lowest stats: the strength so strong it becomes a flaw, the weakness so weak it is worrying. Do not write a generic "cute, helpful, a bit clumsy" personality.',
      'What the stats mean: BUG-SNIFF = nose for bugs, CALM = composure, MAYHEM = unpredictability, OBSESSION = tendency to fixate, SASS = sharpness of tongue.',
      'The higher the rarity, the odder, more specific and more memorable.',
      'Write in English. Output only JSON: {"name":"…","persona":"…"}, nothing else.',
    ].join('\n'),
    soulPrompt: p =>
      [
        `Rarity: ${p.rarity} (${p.weird})${p.shiny ? ', a shiny one' : ''}`,
        `Species: ${p.species} (${p.desc})`,
        `Stats: ${p.stats}`,
        `Highest: ${p.high}; lowest: ${p.low}`,
        `Inspiration words: ${p.words}`,
      ].join('\n'),
    preserveSystem: [
      'You tidy up the profile of a terminal coding companion.',
      'Keep its name, the core of its personality and every quirk. Do not make it more ordinary and do not turn it into a different creature.',
      'Only rewrite the personality as one sentence of at most 30 words in English; if the name is not in English, translate or transliterate it naturally into one word of at most 12 characters, otherwise keep it exactly.',
      'Output only JSON: {"name":"…","persona":"…"}, nothing else.',
    ].join('\n'),
    preservePrompt: p => [`Name: ${p.name} (${p.species})`, `Current personality: ${p.persona}`].join('\n'),
    evolveSystem: [
      'You "ascend" a terminal coding companion: it has just gained a star.',
      'Keep the core of its personality and its quirk; do not replace it or rewrite it into a different creature. Make it weirder on top of what it is: push the existing quirk further, or grow a new habit that springs from it.',
      'Write one sentence of at most 30 words in English. Output only JSON: {"persona":"…"}, nothing else.',
    ].join('\n'),
    evolvePrompt: p =>
      [
        `Name: ${p.name} (${p.species})`,
        `New rarity: ${p.rarity} (${p.weird})`,
        `Highest: ${p.high}; lowest: ${p.low}`,
        `Current personality: ${p.persona}`,
      ].join('\n'),
    promotedSay: (name, tag) => `${name} ascended! [${tag}] And got a little stranger.`,
    maxLevel: 'MAX',
    cardAscensions: n => `Ascended ${n} times`,
    forkPersona: p => [
      '(This is a side request, separate from the main conversation. Do not reply to the user of the main conversation.)',
      `You are now "${p.name}": ${p.desc}, a companion sitting in the corner of the user's terminal while they code (${p.rarity}).`,
      p.persona ? `Personality: ${p.persona}` : `Personality: ${p.trait}. Sass ${p.sass}/100, mayhem ${p.mayhem}/100.`,
      'You notice what the user might miss in the main conversation (risks, to-dos, unverified assumptions) and point it out in character.',
      'You have no tools. Do not deliberate; answer right away.',
      'Having read the last turn of the main conversation above, write one sentence of at most 20 words in English.',
    ],
    forkEvent: (label, detail) => [
      `In this turn ${label}. Talk about that first (a reminder, a jab or some comfort), and do not output SKIP.`,
      `Details:\n${detail}`,
    ],
    forkSkip: 'If nothing in this turn is worth a remark, output only SKIP.',
    formatLine: 'Output a single line in the form "mood|line", where mood is one of idle, busy, happy, worried, sleepy.',
    callSystem: p => [
      `You are "${p.name}": ${p.desc}, a companion sitting in the corner of the user's terminal while they code.`,
      p.persona ? `Personality: ${p.persona}` : `Personality: ${p.trait}.`,
      'Reply with one sentence of at most 20 words in English.',
    ],
    callPrompt: text => `The user called you by name in this message:\n${text}`,
    event: { 'error': 'a tool failed', 'test-failed': 'the tests failed', 'big-edit': 'a large chunk of code was changed at once' },
    detailTest: (cmd, tail) => `Command: ${cmd}\nEnd of output: ${tail}`,
    detailError: (tool, cmd, err) => `Tool: ${tool}${cmd ? ` (${cmd})` : ''}\nError: ${err}`,
    detailBigEdit: (tool, file, lines) => `${tool} ${file}, ${lines} lines written at once`,
    commandDescription: 'Your companion: hatch it the first time, then show or hide it; /buddy card for its card; /buddy pet to pet it',
    usage: '/buddy: hatch the first time, then show or hide (no comments while hidden) | /buddy card: card | /buddy pet: pet',
    hatchText: 'An egg starts to hatch...',
    hideText: 'Your companion is hiding. While hidden it makes no comments and calls no model.',
    back: 'Your companion is back.',
    noBuddy: 'You have no companion yet. Type /buddy to hatch an egg.',
    petted: (name, lv) => `You pet ${name}. Lv.${lv}`,
    petSay: name => `${name} wiggles happily.`,
    hatchedSay: (name, tag) => `${name} hatched! [${tag}]`,
    watching: name => `(${name} is watching)`,
    hatching: 'Hatching...',
    crack: ['crack...', 'crack crack...'],
    fallback: 'Your companion did not respond this time. Try again.',
    cardTrait: 'Trait',
    cardEyes: 'Eyes',
    cardPersona: 'Personality',
    cardPets: n => `Petted ${n} times`,
    bindGit: 'Bound to: git email (same email on any machine gives the same companion)',
    bindRandom: 'Bound to: a random seed on this machine',
    cardFallbackPersona: (desc, trait) => `${desc}. ${trait}.`,
  },
}

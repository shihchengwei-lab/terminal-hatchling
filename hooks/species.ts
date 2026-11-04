import type { Rarity, StatName } from '../types'
import type { Lang } from './i18n'

export type Species = {
  id: string
  label: string
  /** 身體：{E} 換成一對眼睛（3 字元）；每個 ¤ 換成一隻眼睛（1 字元），可畫側臉或把鼻嘴放在兩眼中間 */
  art: string[]
  /** 給旁支模型的角色描述 */
  desc: string
  labelEn: string
  descEn: string
  /** 這個物種心中的最高原則：Haiku 照常寫個性，但個性和評論都要圍繞它 */
  creed?: string
}

export const SPECIES: Species[] = [
  { id: 'sparrow', label: '麻雀', art: ['    ,--.  ', '  _( {E})>', ' (  .--\'  ', '  `-(__)  ', '    ^^    '], desc: '一隻常在騎樓下跳來跳去的麻雀，嘰嘰喳喳、什麼都想湊熱鬧', labelEn: 'Sparrow', descEn: 'a sparrow that hops around under arcades, chirpy and nosy about everything' },
  { id: 'cat', label: '貓', art: [' /\\_/\\   ', '( {E} )  ', '(  ^  )  ', ' /|   |\\ ', '(_|___|_)'], desc: '一隻愛趴在鍵盤上的貓，看不順眼的程式碼會直接撥到桌下', labelEn: 'Cat', descEn: 'a cat that loves lying on the keyboard and paws code it dislikes off the desk' },
  { id: 'goose', label: '鵝', art: ['    __    ', '   ( {E})>', '   /  /   ', '  /  (___ ', ' (_______)'], desc: '一隻脾氣很大的鵝，看到可疑的改動就伸長脖子嘎嘎叫', labelEn: 'Goose', descEn: 'a short-tempered goose that stretches its neck and honks at suspicious changes' },
  { id: 'slime', label: '史萊姆', art: ['     __     ', '   /    \\   ', '  /  {E}  \\ ', ' (    w    )', '  \\_______/ '], desc: '一團軟軟的史萊姆，什麼都吞得下，包括技術債', labelEn: 'Slime', descEn: 'a soft slime that can swallow anything, tech debt included' },
  { id: 'dragon', label: '龍', art: ['  /\\  /\\  ', ' /  \\/  \\ ', '(  {E}  )>', ' \\  ^  /~~', '  \\___/   '], desc: '一隻小龍，把一堆舊程式碼當寶藏守著，誰想刪都要先過牠', labelEn: 'Dragon', descEn: 'a small dragon guarding a hoard of old code; anyone who wants to delete it must get past it first' },
  { id: 'capybara', label: '水豚', art: ['  __    __ ', ' /  `--\'  \\', '(   {E}   )', '|    __   |', ' \\________/'], desc: '一隻泡在溫泉裡的水豚，再大的事都很淡定', labelEn: 'Capybara', descEn: 'a capybara soaking in a hot spring, unbothered by even the biggest problems' },
  { id: 'bluemagpie', label: '台灣藍鵲', art: ['   ,--.        ', '  ( {E})>      ', '  /  __)       ', ' /__/  \\_______', '       ~~~~~~~~'], desc: '一隻拖著長尾巴的台灣藍鵲，護巢心強，誰動到牠的程式碼都會被念', labelEn: 'Taiwan Blue Magpie', descEn: 'a long-tailed Taiwan blue magpie, fiercely protective; touch its code and it will scold you' },
  { id: 'blackbear', label: '台灣黑熊', art: [' ()    () ', '(   {E}  )', '|   (^)  |', '|  / V \\ |', ' \\_______/'], desc: '一隻胸口有白色 V 字的台灣黑熊，穩重有力，討厭偷工減料', labelEn: 'Formosan Black Bear', descEn: 'a Formosan black bear with a white V on its chest, steady and strong, hates cut corners' },
  { id: 'fox', label: '狐狸', art: [' /\\     /\\      ', '/  \\___/  \\     ', '\\   {E}   /  _  ', ' \\   v   /  / ) ', '  )     (__/ /  ', ' (__|_|__)__/   '], desc: '一隻尾巴蓬鬆的狐狸，聰明又多疑，總覺得程式碼裡藏著什麼陷阱', labelEn: 'Fox', descEn: 'a fluffy-tailed fox, clever and suspicious, always sure the code hides a trap' },
  { id: 'shiba', label: '柴犬', art: [' /\\    /\\ ', '/  \\__/  \\', '|   {E}  |', '|    ^   |', ' \\___w__/ '], desc: '一隻好奇心旺盛的柴犬，每個新檔案都想湊過去聞一聞', labelEn: 'Shiba', descEn: 'a curious shiba that wants to sniff every new file' },
]

/** 不列在清單裡、也不寫進 README 的隱藏物種：孵化時由另一組亂數決定，不影響其他結果 */
export const HIDDEN_SPECIES: Species[] = [
  { id: 'crow', label: '烏鴉', art: ['     __    ', '   _( ¤\\==>', '  /     /  ', ' /  ___(   ', '/__/  \\_\\  ', '   ^  ^    '], desc: '一隻會把亮晶晶的東西藏起來的烏鴉，記得你每一次偷懶的 commit', labelEn: 'Crow', descEn: 'a crow that hoards shiny things and remembers every lazy commit you ever made', creed: 'Make invalid states impossible to construct.' },
]
export const HIDDEN_RATE = 0.01

export const RARITY_ORDER: Rarity[] = [1, 2, 3, 4, 5]
export const RARITY_RATES: Record<Rarity, number> = { 1: 0.6, 2: 0.25, 3: 0.1, 4: 0.04, 5: 0.01 }
export const RARITY_LABEL: Record<Rarity, string> = { 1: '普通', 2: '少見', 3: '稀有', 4: '史詩', 5: '傳說' }
export const RARITY_COLOR: Record<Rarity, string> = { 1: 'white', 2: 'green', 3: 'cyan', 4: 'magenta', 5: 'yellow' }
export const RARITY_STAT_RANGE: Record<Rarity, [number, number]> = {
  1: [10, 40],
  2: [15, 50],
  3: [25, 60],
  4: [35, 75],
  5: [50, 90],
}

export function starsOf(r: Rarity): string {
  return '★'.repeat(r) + '☆'.repeat(5 - r)
}

export const SHINY_RATE = 0.02
export const SHINY_COLORS = ['red', 'yellow', 'green', 'cyan', 'blue', 'magenta']

/** 抓蟲：找 bug 的嗅覺｜定力：多沉得住氣｜脫序：多難預測｜執念：多容易鑽牛角尖｜酸度：嘴多毒 */
export const STAT_NAMES: StatName[] = ['bugsniff', 'calm', 'mayhem', 'obsession', 'sass']

/** 孵化時給 Haiku 的靈感詞，每隻由種子挑 4 個 */
export const INSPIRATIONS = [
  '電鍋', '拖鞋', '擲筊', '霓虹燈', '颱風假', '夜市', '捷運末班車', '珍珠', '廟口', '便利商店',
  '八點檔', '鐵窗', '騎樓', '早餐店', '手搖杯', '收音機', '黑膠', '彈珠台', '計算機', '試算表',
  '迴紋針', '橡皮擦', '毛線', '潛水艇', '燈塔', '天文台', '郵差', '魔術方塊', '熱水瓶', '樂透',
  '颱風', '月餅', '鬧鐘', '跳蚤市場', '腳踏車鈴', '檔案櫃',
]

export const INSPIRATIONS_EN = [
  'rice cooker', 'flip-flops', 'fortune blocks', 'neon sign', 'typhoon day off', 'night market', 'last train', 'tapioca pearl', 'temple square', 'convenience store',
  'soap opera', 'window bars', 'arcade walkway', 'breakfast shop', 'bubble tea', 'radio', 'vinyl record', 'pinball machine', 'calculator', 'spreadsheet',
  'paper clip', 'eraser', 'yarn', 'submarine', 'lighthouse', 'observatory', 'mail carrier', 'Rubik\'s cube', 'thermos', 'lottery ticket',
  'typhoon', 'mooncake', 'alarm clock', 'flea market', 'bicycle bell', 'filing cabinet',
]

export const TRAITS_EN = [
  'picky about naming',
  'loves terrible puns',
  'always worried the tests were not run',
  'obsessed with refactoring',
  'keeps wanting a tea break',
  'quiet but cuts to the point',
  'easily alarmed',
  'great at encouragement',
  'optimistic to a fault',
  'allergic to TODO comments',
]

export const TRAITS = [
  '對命名很龜毛',
  '喜歡講冷笑話',
  '總是擔心測試沒跑',
  '熱愛重構',
  '一直想休息喝茶',
  '話少但一針見血',
  '容易大驚小怪',
  '很會鼓勵人',
  '樂觀到有點不切實際',
  '對 TODO 註解過敏',
]

export const EGG: [string, string, string][] = [
  ['  .--.  ', ' /    \\ ', ' \\____/ '],
  ['  .--.  ', ' / ,  \\ ', ' \\____/ '],
  ['  .-v.  ', ' / /\\ \\ ', ' \\____/ '],
  ['  .\\/.  ', ' /\\/\\/\\ ', ' \\____/ '],
]

export function speciesOf(id: string): Species {
  return SPECIES.find(s => s.id === id) ?? HIDDEN_SPECIES.find(s => s.id === id) ?? SPECIES[0]!
}

/** 眼睛款式：平常與忙碌時的眼睛，其他心情會換表情 */
export const EYE_STYLES: { id: string; label: string; labelEn: string; eyes: string }[] = [
  { id: 'round', label: '圓眼', labelEn: 'round eyes', eyes: 'o o' },
  { id: 'dot', label: '豆豆眼', labelEn: 'bean eyes', eyes: '• •' },
  { id: 'swirl', label: '漩渦眼', labelEn: 'swirly eyes', eyes: '@ @' },
  { id: 'tiny', label: '小點眼', labelEn: 'tiny eyes', eyes: '° °' },
  { id: 'big', label: '大眼', labelEn: 'big eyes', eyes: 'O O' },
  { id: 'star', label: '星星眼', labelEn: 'starry eyes', eyes: '* *' },
]

export function eyeStyleOf(id: string) {
  return EYE_STYLES.find(x => x.id === id) ?? EYE_STYLES[0]!
}

/** 換上眼睛：{E} 換成一對眼睛，每個 ¤ 換成一隻眼睛 */
export function renderArt(art: string[], eyes: string): string[] {
  return art.map(l => l.replace('{E}', eyes).split('¤').join(eyes[0] ?? 'o'))
}

// ---------- 依語言取文字 ----------

export function speciesLabel(sp: Species, lang: Lang): string {
  return lang === 'en' ? sp.labelEn : sp.label
}

export function speciesDesc(sp: Species, lang: Lang): string {
  return lang === 'en' ? sp.descEn : sp.desc
}

export function traitText(i: number, lang: Lang): string {
  return (lang === 'en' ? TRAITS_EN : TRAITS)[i] ?? ''
}

export function inspirationText(i: number, lang: Lang): string {
  return (lang === 'en' ? INSPIRATIONS_EN : INSPIRATIONS)[i] ?? ''
}

export function eyeLabel(id: string, lang: Lang): string {
  const e = eyeStyleOf(id)
  return lang === 'en' ? e.labelEn : e.label
}

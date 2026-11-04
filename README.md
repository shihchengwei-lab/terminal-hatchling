# terminal-hatchling

English | [繁體中文](README.zh-TW.md)

A Claude Code mod that hatches a small creature above your prompt. Its species, stars and stats are fixed by a seed. When it hatches, Haiku writes its name and a one-line personality once. After that it glances at the conversation at the end of each turn and, now and then, says something in its own voice.

```
 /\_/\       Crumbs ★★★☆☆ Lv.3
( • • )     ╭────────────────────────────────────────────╮
(  ^  )     │ Those tests are red; maybe hold the commit. │
 /|   |\    ╰────────────────────────────────────────────╯
(_|___|_)
```

## Install

At the prompt of a Claude Code terminal session:

```
/plugin install terminal-hatchling --marketplace shihchengwei-lab/terminal-hatchling
```

From a shell:

```
claude plugin install terminal-hatchling --marketplace shihchengwei-lab/terminal-hatchling
```

In the desktop app, where `/plugin` does not run: click + next to the prompt box, then Plugins, Add marketplace with `shihchengwei-lab/terminal-hatchling`, then Add plugin.

The install first asks `Add marketplace?`. Answer `y`, then pick a scope.

## Commands

| Input | What it does |
| --- | --- |
| `/buddy` | The first time: hatches an egg. After that: shows or hides the companion. While hidden it makes no comments and calls no model |
| `/buddy card` | Shows its card: stars, species, name, personality and five stats |
| `/buddy pet` | Pets it; hearts float above its head |

## Language

The companion speaks English or Traditional Chinese, set by the `language` option (the terminal-hatchling row in `/config`, or `pluginConfigs` in settings.json):

- `auto` (default): follows Claude Code's `language` setting, then the `LANG` environment variable. A Chinese hint gives Traditional Chinese; anything else gives English.
- `en`: English.
- `zh-TW`: Traditional Chinese (Taiwan).

After a language change, Haiku rewrites the name and personality in the new language at the next session start, starting from the current ones: the quirks it gained from ascending are kept, and the name is translated or transliterated rather than replaced.

## How a companion is decided

- **Seed**: at hatch it reads `git config --global user.email` and uses its SHA-256 hash as the seed, so the same email hatches the same companion (species, stars, shiny, stats, eyes) on any machine. Without an email it falls back to a random seed on this machine. The email itself is never stored and never sent to a model.
- **Species**: sparrow, cat, goose, slime, dragon, capybara, Taiwan blue magpie, Formosan black bear, fox, shiba, all equally likely.
- **Stars**: independent of species. ★ Common 60%, ★★ Uncommon 25%, ★★★ Rare 10%, ★★★★ Epic 4%, ★★★★★ Legendary 1%. Separately, 2% are shiny.
- **Stats**: BUG-SNIFF (nose for bugs), CALM (composure), MAYHEM (unpredictability), OBSESSION (tendency to fixate), SASS (sharpness of tongue). Their range rises with the stars. Every companion has one clear strength, the highest stat, and one clear weakness, the lowest.
- **Name and personality**: written once by Haiku at hatch, from the stars, species, stats and four inspiration words picked by the seed. The personality has to grow out of the strength and the weakness, and the more stars, the stranger.

## Levels and ascension

- It gains 1 XP per finished turn and 1 per pet. Level = 1 + ⌊√(XP ÷ (3 × 2^(stars − 1)))⌋, up to Lv.10. Each star doubles the XP needed: reaching Lv.10 takes 243 XP at 1 star, 486 at 2, 972 at 3 and 1944 at 4.
- At Lv.10 it **ascends**: one more star (up to 5), XP back to 0, and its stats are recalculated in the new star's range. Species, shiny and eyes stay the same.
- On ascension Haiku makes the personality stranger on top of what it already is: the core and the quirk stay, and the name never changes.
- At 5 stars the level stays at MAX.
- A Legendary (5-star) companion holds one principle of code, picked by its strength: BUG-SNIFF → invalid states, CALM → causal direction, MAYHEM → local predictability, OBSESSION → single source, SASS → necessary complexity. Its personality and every remark revolve around it, from the moment it reaches 5 stars.

## When it talks

| When | Model | Notes |
| --- | --- | --- |
| A turn ends | the session's own model (`model.fork`) | Only when the answer is at least 80 characters and 45 seconds have passed since its last comment; it stays quiet when nothing is worth saying |
| A turn had failed tests, a tool error, or a write of 80+ lines | the session's own model (`model.fork`) | Always comments when the turn ends, and talks about that first |
| Your message contains its name | Haiku | Replies right away |

Animations that need no model: blinking, an occasional wiggle, a busy look while Claude works, dozing after 5 idle minutes, hearts when petted.

## Cost and data

Every model call goes through your own Claude Code session's account and usage. There is no extra backend. Prices change, so this lists calls and tokens, not amounts.

**Comments (the main cost)**

- A comment is a `model.fork` request on **the session's own model**. If your session runs Opus, each comment is an Opus request.
- Each comment re-reads the whole conversation so far. It is served from the prompt cache, which is cheaper than fresh input, but the longer the session, the more cached tokens every comment reads.
- How often: at most once every 45 seconds, and only after an answer of at least 80 characters; a turn with failed tests, a tool error or a write of 80+ lines always gets one.
- Fork requests are counted in the session's cost total.

**Haiku calls (small)**

- One call each when it hatches, when you mention its name, when it ascends, and when its personality is rewritten after a language change or a prompt update.
- Haiku receives only the personality and that one message or event summary, never the conversation.
- These calls are billed to your account but are not shown in the session's cost total.

**Stopping and data**

- Hide the companion with `/buddy` and it makes no model calls at all. While hidden it also gains no XP; a personality rewrite that was due is done when you show it again.
- The save lives in this plugin's own JSON file under your Claude Code configuration directory.

## Development

```
claude plugin validate .
claude plugin test .
```

## License

MIT. Most of the ASCII art was drawn with help from ChatGPT and then adjusted.

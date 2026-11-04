# terminal-hatchling

[English](README.md) | 繁體中文

一個 Claude Code mod：在終端機輸入框上方孵出一隻小動物夥伴。牠的物種、星數、屬性由種子固定決定，孵化時由 Haiku 寫一次名字和個性，之後會在每輪對話結束時看一眼對話，用自己的口吻冒一句話。

```
  /\_/\      阿丸 ★★★☆☆ Lv.3
 ( • • )    ╭──────────────────────────╮
 (  ^  )    │ 測試紅了，先別急著 commit。 │
  /|   |\   ╰──────────────────────────╯
 (_|___|_)
```

## 安裝

在 Claude Code 終端機的輸入框：

```
/plugin install terminal-hatchling --marketplace shihchengwei-lab/terminal-hatchling
```

從 shell：

```
claude plugin install terminal-hatchling --marketplace shihchengwei-lab/terminal-hatchling
```

桌面版 app（`/plugin` 不能用的地方）：點輸入框旁的 +，選 Plugins，用 `shihchengwei-lab/terminal-hatchling` 新增 marketplace，再新增 plugin。

安裝時會先問 `Add marketplace?`，回答 `y`，再選安裝範圍。

## 指令

| 輸入 | 作用 |
| --- | --- |
| `/buddy` | 第一次：孵蛋。之後：切換顯示或隱藏。隱藏時夥伴不評論，也不呼叫任何模型 |
| `/buddy card` | 顯示角色卡：星數、物種、名字、個性、四項屬性 |
| `/buddy pet` | 摸摸，頭上會飄愛心 |

## 語言

夥伴說中文或英文，由設定 `language` 決定（`/config` 裡的 terminal-hatchling 項目，或 settings.json 的 `pluginConfigs`）：

- `auto`（預設）：先看 Claude Code 的 `language` 設定，再看環境變數 `LANG`；有中文提示就說繁體中文，否則說英文。
- `en`：英文。
- `zh-TW`：台灣繁體中文。

換語言後，下次開 session 時 Haiku 會用新語言重寫名字和個性（自己取的名字會保留）。

## 夥伴怎麼決定

- **種子**：孵蛋時讀 `git config --global user.email`，取 SHA-256 雜湊當種子，同一個 email 在任何機器都孵出同一隻（物種、星數、閃光、屬性、眼睛）。讀不到 email 時改用這台機器的隨機種子。email 本身不存檔、不送給任何模型。
- **物種**：麻雀、貓、鵝、史萊姆、龍、水豚、台灣藍鵲、台灣黑熊、狐狸、柴犬，機率相同。
- **星數**：和物種無關。★ 普通 60%、★★ 少見 25%、★★★ 稀有 10%、★★★★ 史詩 4%、★★★★★ 傳說 1%。另有 2% 閃光。
- **名字和個性**：孵化時由 Haiku 寫一次，參考星數、物種、屬性和 4 個由種子挑出的靈感詞。星數越高越怪。

## 什麼時候會說話

| 時機 | 模型 | 說明 |
| --- | --- | --- |
| 一輪對話結束 | session 的主模型（`model.fork`） | 回答至少 80 字、距上次至少 45 秒才評論，沒什麼好說就不出聲 |
| 這輪測試失敗、工具出錯、一次寫入 80 行以上 | session 的主模型（`model.fork`） | 等這輪結束一定評論，並優先講這件事 |
| 你的訊息裡提到牠的名字 | Haiku | 馬上回一句 |

不靠模型的動畫：眨眼、偶爾晃一下、Claude 工作中變成忙碌樣、5 分鐘沒動靜就打瞌睡、被摸時飄愛心。

## 費用與資料

- 所有模型呼叫都走你自己 Claude Code session 的帳號與用量，沒有額外的後端服務。
- 評論用的 `model.fork` 讀的是這個 session 本身的對話紀錄（從 prompt cache 讀取）；Haiku 只收到人設和那一則訊息或事件摘要。
- 不想花費時，`/buddy` 把夥伴藏起來即可。
- 存檔在 Claude Code 設定資料夾底下這個 plugin 自己的 JSON 檔。

## 開發

```
claude plugin validate .
claude plugin test .
```

## 授權

MIT。ASCII 造型多數由 ChatGPT 協助繪製後調整。

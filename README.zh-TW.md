# terminal-hatchling

[English](README.md) | 繁體中文

一個 Claude Code mod：在終端機輸入框上方孵出一隻小動物夥伴。牠的物種、星數、屬性由種子固定決定，孵化時由 Haiku 寫一次名字和個性，之後會在每輪對話結束時看一眼對話，用自己的口吻冒一句話。

```
 /\     /\        Vinnick ★☆☆☆☆ Lv.2
/  \___/  \       ╭──────────────────────────────────╮
\   @ @   /  _    │ 重構很漂亮。冷靜提醒：你改了存檔 │
 \   v   /  / )   │ 格式，但沒有測試讀過舊存檔。     │
  )     (__/ /    │ 陷阱就在這。                     │
 (__|_|__)__/     ╰──────────────────────────────────╯
```

Vinnick 孵化時 Haiku 寫的個性：

> An unflappable fox who calmly insists every line hides a trap, mildly rejects any variable name it finds unserious, and has never once surprised anyone, which it finds suspicious.
>
> （一隻處變不驚的狐狸，冷靜地堅持每一行都藏著陷阱，對牠覺得不夠正經的變數名稱溫和地表示反對；牠從來沒讓任何人意外過，這點牠自己覺得很可疑。）

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
| `/buddy card` | 顯示角色卡：星數、物種、名字、個性、五項屬性 |
| `/buddy pet` | 摸摸，頭上會飄愛心 |

## 語言

夥伴說中文或英文，由設定 `language` 決定（`/config` 裡的 terminal-hatchling 項目，或 settings.json 的 `pluginConfigs`）：

- `auto`（預設）：先看 Claude Code 的 `language` 設定，再看環境變數 `LANG`；有中文提示就說繁體中文，否則說英文。
- `en`：英文。
- `zh-TW`：台灣繁體中文。

換語言後，下次開 session 時 Haiku 會以現有的名字和個性為底，用新語言改寫：升階累積的怪癖會保留，名字會翻譯或音譯，不會換成新名字。

## 夥伴怎麼決定

- **種子**：孵蛋時讀 `git config --global user.email`，取 SHA-256 雜湊當種子，同一個 email 在任何機器都孵出同一隻（物種、星數、閃光、屬性、眼睛）。讀不到 email 時改用這台機器的隨機種子。email 本身不存檔、不送給任何模型。
- **物種**：麻雀、貓、鵝、史萊姆、龍、水豚、台灣藍鵲、台灣黑熊、狐狸、柴犬，機率相同。
- **星數**：和物種無關。★ 普通 60%、★★ 少見 25%、★★★ 稀有 10%、★★★★ 史詩 4%、★★★★★ 傳說 1%。另有 2% 閃光。
- **屬性**：抓蟲（找 bug 的嗅覺）、定力（多沉得住氣）、脫序（多難預測）、執念（多容易鑽牛角尖）、酸度（嘴多毒）。數值範圍隨星數提高。每隻都有一個明顯的強項（最高）和一個明顯的弱項（最低）。
- **名字和個性**：孵化時由 Haiku 寫一次，參考星數、物種、屬性和 4 個由種子挑出的靈感詞。個性必須從強項和弱項長出來，星數越高越怪。

## 等級與升階

- 每完成一輪對話 +1 經驗值，被摸一次 +1。等級 = 1 + ⌊√(經驗值 ÷ (3 × 2^(星數 − 1)))⌋，最高 Lv.10。每多一顆星，需要的經驗值 ×2：滿級在 1 星要 243、2 星 486、3 星 972、4 星 1944。
- 到 Lv.10 會**升階**：星數 +1（最多 5 星），經驗值歸零，屬性依新星數的範圍重算。物種、閃光、眼睛不變。
- 升階時 Haiku 會在原本的個性上變得更怪：保留核心和怪癖，名字不變。
- 到 5 星後，等級停在 MAX。

## 什麼時候會說話

| 時機 | 模型 | 說明 |
| --- | --- | --- |
| 一輪對話結束 | session 的主模型（`model.fork`） | 回答至少 80 字、距上次至少 45 秒才評論，沒什麼好說就不出聲 |
| 這輪測試失敗、工具出錯、一次寫入 80 行以上 | session 的主模型（`model.fork`） | 等這輪結束一定評論，並優先講這件事 |
| 你的訊息裡提到牠的名字 | Haiku | 馬上回一句 |

不靠模型的動畫：眨眼、偶爾晃一下、Claude 工作中變成忙碌樣、5 分鐘沒動靜就打瞌睡、被摸時飄愛心。

## 費用與資料

所有模型呼叫都走你自己 Claude Code session 的帳號與用量，沒有額外的後端服務。價格會變動，所以這裡只列次數和 token，不寫金額。

**評論（花費的大頭）**

- 每次評論是一次 `model.fork` 請求，用的是 **session 本身的模型**。如果你的 session 用 Opus，每次評論就是一次 Opus 請求。
- 每次評論都會重讀到目前為止的整段對話。這部分從 prompt cache 讀取，比一般輸入便宜，但 session 越長，每次評論讀的快取 token 越多。
- 頻率：平常最多每 45 秒一次，而且回答要 80 字以上；那一輪有測試失敗、工具出錯或一次寫入 80 行以上時，一定評論。
- fork 的費用會算進 session 的花費統計。

**Haiku 呼叫（小額）**

- 孵化、你提到牠的名字、升階、換語言或人設寫法更新而重寫個性時，各呼叫一次。
- Haiku 只收到人設和那一則訊息或事件摘要，不會收到對話紀錄。
- 這些呼叫從你的帳號扣，但不會出現在 session 的花費統計裡。

**停止花費與資料**

- 用 `/buddy` 把夥伴藏起來，就完全不呼叫任何模型。藏著時也不加經驗值；該重寫的個性會在叫出來時補上。
- 存檔在 Claude Code 設定資料夾底下這個 plugin 自己的 JSON 檔。

## 開發

```
claude plugin validate .
claude plugin test .
```

## 授權

MIT。ASCII 造型多數由 ChatGPT 協助繪製後調整。

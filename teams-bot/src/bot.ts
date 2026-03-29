import {
  ActivityHandler, TurnContext, MessageFactory
} from 'botbuilder'
import fetch from 'node-fetch'
import FormData from 'form-data'
import * as https from 'https'
import axios from 'axios'

const API_URL    = process.env.WINDROSE_API_URL  || 'http://localhost:5000'
const API_KEY    = process.env.WINDROSE_API_KEY  || 'windrose-bulk-dev'
const PORTAL_URL = process.env.PORTAL_URL        || 'https://windroselogs.sundrift.tech'
const BOT_APP_ID       = process.env.MICROSOFT_APP_ID       || process.env.BOT_APP_ID       || ''
const BOT_APP_PASSWORD = process.env.MICROSOFT_APP_PASSWORD || process.env.BOT_APP_PASSWORD || ''
const TENANT_ID        = process.env.MICROSOFT_APP_TENANT_ID || process.env.BOT_TENANT_ID   || 'd30356c9-cd3f-4e51-8703-e7b784e6a7e2'

// ── Graph API token cache ─────────────────────────────────────────────────────
let graphToken: string | null = null
let graphTokenExpiry = 0

async function getGraphToken(): Promise<string> {
  if (graphToken && Date.now() < graphTokenExpiry - 60000) return graphToken
  console.log('[GRAPH] Fetching new token...')
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), 10000)
  try {
    const res = await fetch(`https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: BOT_APP_ID,
        client_secret: BOT_APP_PASSWORD,
        scope: 'https://graph.microsoft.com/.default',
        grant_type: 'client_credentials',
      }).toString(),
      signal: ctrl.signal,
      compress: false,
    } as any)
    if (!res.ok) throw new Error(`Graph token failed: ${res.status}`)
    const data = await res.json() as any
    graphToken = data.access_token
    graphTokenExpiry = Date.now() + data.expires_in * 1000
    console.log('[GRAPH] Token acquired, expires in', data.expires_in, 's')
    return graphToken!
  } finally { clearTimeout(t) }
}

async function graphGet(path: string) {
  const token = await getGraphToken()
  console.log(`[GRAPH] GET ${path.slice(0, 60)}`)
  return new Promise<any>((resolve, reject) => {
    const req = https.request({
      hostname: 'graph.microsoft.com',
      path: `/v1.0${path}`,
      method: 'GET',
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      timeout: 15000,
    }, res => {
      let body = ''
      res.on('data', (chunk: string) => body += chunk)
      res.on('end', () => {
        console.log(`[GRAPH] Response ${res.statusCode} (${body.length} bytes)`)
        if (res.statusCode && res.statusCode >= 400) {
          reject(new Error(`Graph GET ${path} → ${res.statusCode}: ${body.slice(0, 100)}`))
        } else {
          try { resolve(JSON.parse(body)) }
          catch (e) { reject(new Error(`JSON parse error: ${body.slice(0, 100)}`)) }
        }
      })
    })
    req.on('error', (e: Error) => reject(e))
    req.on('timeout', () => { req.destroy(); reject(new Error(`Graph GET timeout: ${path}`)) })
    req.end()  // ← CRITICAL: must call end() to send the request
  })
}

async function graphPost(path: string, body: any) {
  const token = await getGraphToken()
  const bodyStr = JSON.stringify(body)
  return new Promise<any>((resolve, reject) => {
    const req = https.request({
      hostname: 'graph.microsoft.com',
      path: `/v1.0${path}`,
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(bodyStr),
      },
      timeout: 15000,
    }, res => {
      let data = ''
      res.on('data', (chunk: string) => data += chunk)
      res.on('end', () => {
        if (res.statusCode && res.statusCode >= 400) {
          reject(new Error(`Graph POST ${path} → ${res.statusCode}: ${data.slice(0, 200)}`))
        } else {
          try { resolve(JSON.parse(data)) } catch { resolve({}) }
        }
      })
    })
    req.on('error', (e: Error) => reject(e))
    req.on('timeout', () => { req.destroy(); reject(new Error(`Graph POST timeout: ${path}`)) })
    req.write(bodyStr)
    req.end()
  })
}
async function apiGet(path: string) {
  const res = await fetch(`${API_URL}${path}`, { headers: { 'X-Api-Key': API_KEY } })
  if (!res.ok) throw new Error(`API ${path} → ${res.status}`)
  return res.json() as Promise<any>
}

async function uploadLog(content: Buffer, fileName: string, uploaderName: string) {
  const form = new FormData()
  form.append('file', content, { filename: fileName, contentType: 'application/octet-stream' })
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), 60000)
  try {
    const upRes = await fetch(`${API_URL}/api/bulk/upload`, {
      method: 'POST',
      headers: { 'X-Api-Key': API_KEY, 'X-Uploader-Name': uploaderName, ...form.getHeaders() },
      body: form, signal: ctrl.signal,
    })
    if (!upRes.ok) throw new Error(`Upload failed: ${upRes.status}`)
    return upRes.json() as Promise<any>
  } finally { clearTimeout(t) }
}

async function waitForFileStats(fileId: string, maxWaitMs = 60000): Promise<any | null> {
  const start = Date.now()
  while (Date.now() - start < maxWaitMs) {
    try {
      const res = await apiGet(`/api/bot/file/${fileId}`)
      if (res.file?.status === 'done' || res.file?.status === 'error') {
        console.log(`[POLL] File ${fileId} done, events: ${res.file.eventsFound}`)
        return res
      }
    } catch (e: any) { console.error(`[POLL] Stats poll error: ${e.message}`) }
    await new Promise(r => setTimeout(r, 3000))
  }
  return null
}

function formatFileStats(fileName: string, senderName: string, res: any): string {
  const file = res.file
  const eventCounts: {eventType: string, count: number}[] = res.eventCounts ?? []
  const topSigs: any[] = res.topSignatures ?? []

  const r5 = eventCounts.find((e: any) => e.eventType === 'R5Check')?.count ?? 0
  const ml = eventCounts.find((e: any) => e.eventType === 'MemoryLeak')?.count ?? 0

  const lines: string[] = [
    `✅ **${fileName}** от **${senderName}**`,
    `🔴 R5Check: **${r5}**   💧 Memory Leak: **${ml}**`,
  ]

  if (r5 > 0 && topSigs.length > 0) {
    lines.push(``, `**R5Check ошибки (${r5}):**`)
    topSigs.forEach((s, i) => {
      const unique = s.totalCount === 1 ? ' 🌟 уникальная' : ''
      lines.push(``)
      lines.push(`**${i + 1}.** ${unique} — встречается **${s.fileCount}x** в файле`)
      lines.push(`Condition: \`${(s.conditionText ?? '?').slice(0, 100)}\``)
      if (s.sampleMessage) lines.push(`Message: ${s.sampleMessage.slice(0, 150)}`)
      if (s.whereText)     lines.push(`Where: \`${s.whereText.slice(0, 120)}\``)
      if (s.sourceFile)    lines.push(`File: ${s.sourceFile.slice(0, 80)}`)
    })
  } else if (r5 === 0 && ml === 0) {
    lines.push(`✨ Критических ошибок не найдено`)
  }

  lines.push(``, `🔗 [Открыть в портале](${PORTAL_URL}/files/${file.id})`)
  return lines.join('<br>')
}

// ── Graph polling state ───────────────────────────────────────────────────────
const watchedChats = new Map<string, {
  lastCheck: Date
  serviceUrl: string
  conversationId: string
  tenantId: string
  botId: string
  isChannel: boolean
}>()

async function pollChatFiles(chatId: string, since: Date, uploaderName = 'Teams (auto)'): Promise<{text: string, replyToId: string}[]> {
  const results: {text: string, replyToId: string}[] = []
  try {
    const sinceStr = since.toISOString()
    const data = await graphGet(
      `/chats/${chatId}/messages?$top=50`
    )
    for (const msg of (data.value ?? [])) {
      // Only process messages newer than since
      if (new Date(msg.createdDateTime) <= since) continue
      if (!msg.attachments?.length) continue
      for (const att of msg.attachments) {
        const name: string = att.name ?? ''
        if (!name.toLowerCase().endsWith('.log') && !name.toLowerCase().endsWith('.zip')) continue
        const downloadUrl = att.contentUrl
        if (!downloadUrl) continue
        console.log(`[POLL] Found file: ${name} in chat ${chatId}`)
        try {
          console.log(`[POLL] Processing: ${name} | contentUrl: ${att.contentUrl?.slice(0,80)}`)
          let buf: Buffer | null = null

          // Use shares API for ANY SharePoint URL (personal OneDrive or team site)
          const spUrl = att.contentUrl || ''
          if (!spUrl.includes('sharepoint.com')) {
            console.error(`[POLL] Not a SharePoint URL: ${spUrl.slice(0, 80)}`); continue
          }

          const encoded = 'u!' + Buffer.from(spUrl).toString('base64')
            .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
          console.log(`[POLL] Trying shares API for: ${name}`)

          const driveRes = await graphGet(`/shares/${encoded}/driveItem`)
          const dlUrl = driveRes['@microsoft.graph.downloadUrl']
          if (!dlUrl) {
            console.error(`[POLL] No downloadUrl in response: ${JSON.stringify(driveRes).slice(0, 100)}`); continue
          }

          console.log(`[POLL] Downloading: ${name}`)
          const dlReq = await new Promise<any>((resolve, reject) => {
            const u = new URL(dlUrl)
            const req = https.request({ hostname: u.hostname, path: u.pathname + u.search,
              method: 'GET', timeout: 30000
            }, res => {
              const chunks: Buffer[] = []
              res.on('data', (c: Buffer) => chunks.push(c))
              res.on('end', () => resolve({ status: res.statusCode, buf: Buffer.concat(chunks) }))
            })
            req.on('error', reject)
            req.on('timeout', () => { req.destroy(); reject(new Error('download timeout')) })
            req.end()
          })
          if (dlReq.status !== 200) {
            console.error(`[POLL] Download failed: ${dlReq.status}`); continue
          }
          buf = dlReq.buf
          console.log(`[POLL] Downloaded ${name}: ${buf!.length} bytes`)

          if (!buf) { console.error(`[POLL] Download failed for ${name}`); continue }
          const senderName = msg.from?.user?.displayName ?? uploaderName
          const upRes = await uploadLog(buf, name, senderName)
          const files = upRes.files ?? [upRes]
          for (const f of files) {
            if (f.skipped) {
              console.log(`[POLL] Skipped (duplicate): ${f.fileName}`)
            } else {
              // Wait for parsing and get file stats
              const stats = await waitForFileStats(f.fileId)
              const statsText = stats
                ? formatFileStats(f.fileName, senderName, stats)
                : `✅ \`${f.fileName}\` от **${senderName}** — принят, парсинг запущен`
              results.push({ text: statsText, replyToId: msg.id })
            }
          }
        } catch (e: any) {
          console.error(`[POLL] Error processing ${name}: ${e.message}`)
        }
      }
    }
  } catch (e: any) {
    console.error(`[POLL] Error polling chat ${chatId}: ${e.message}`)
  }
  return results
}

// ── Formatters ────────────────────────────────────────────────────────────────
function fmtSig(s: any, i: number): string {
  const date = new Date(s.lastSeen || s.firstSeen).toLocaleDateString('ru-RU')
  const count = s.totalCount ? ` · ${s.totalCount}x` : ''
  const file  = s.sourceFile ? ` · ${s.sourceFile}` : ''
  return `${i + 1}. \`${s.conditionText}\`${count}${file} · ${date}`
}

function fmtStats(s: any): string {
  return [
    `📊 **Windrose Logs — Статистика**`, ``,
    `🗂 Файлов: **${s.doneFiles}** (из ${s.totalFiles})`,
    `🔴 R5Check событий: **${s.r5Total}**`,
    `💧 Memory Leak событий: **${s.mlTotal}**`,
    `🔷 Уникальных сигнатур: **${s.signatures}**`,
    `⭐ Встречается только 1 раз: **${s.unique}**`, ``,
    `🔗 [Открыть портал](${PORTAL_URL})`,
  ].join('\n')
}

const HELP = `**Windrose Logs Bot**

📥 **Загрузить лог:** прикрепи *.log* или *.zip* файл в чат

📊 **Команды:**
• \`!r5\` или \`!stats\` — общая статистика
• \`!r5 all\` — все R5Check сигнатуры
• \`!r5 popular\` — топ-5 самых частых
• \`!r5 unique\` — только уникальные (1 раз)

❓ \`!help\` — это сообщение`

// ── Bot ───────────────────────────────────────────────────────────────────────
export class WindroseBot extends ActivityHandler {
  private adapter: any

  constructor(adapter?: any) {
    super()
    this.adapter = adapter
    this.onMessage(async (ctx, next) => { await this.handleMessage(ctx); await next() })
    this.onConversationUpdate(async (ctx, next) => {
      const added = ctx.activity.membersAdded ?? []
      const botId = ctx.activity.recipient?.id
      if (added.some((m: any) => m.id === botId)) {
        const rawId = ctx.activity.conversation?.id ?? ''
        const baseId = rawId.split(';')[0]
        const isChannel = baseId.includes('thread.tacv2')
        if (baseId && !watchedChats.has(baseId)) {
          watchedChats.set(baseId, {
            lastCheck: new Date(),
            serviceUrl: ctx.activity.serviceUrl,
            conversationId: baseId,
            tenantId: (ctx.activity.channelData as any)?.tenant?.id ?? TENANT_ID,
            botId: ctx.activity.recipient?.id ?? '',
            isChannel,
          })
          console.log(`[WATCH] Now watching: ${baseId} (isChannel=${isChannel})`)
          this.startPolling()
        }
      }
      await next()
    })
  }

  private pollingStarted = false
  private startPolling() {
    if (this.pollingStarted) return
    this.pollingStarted = true
    console.log('[POLL] Starting Graph API polling (every 2 min)')
    // Run immediately first, then every 2 min
    this.runPoll()
    setInterval(() => this.runPoll(), 2 * 60 * 1000)
  }

  private async runPoll() {
    console.log(`[POLL] Running poll, chats: ${watchedChats.size}`)
    for (const [chatId, state] of watchedChats.entries()) {
      const since = state.lastCheck
      state.lastCheck = new Date()
      const results = await pollChatFiles(chatId, since)
      if (results.length > 0) {
        console.log(`[POLL] Found ${results.length} new files in chat ${chatId}`)
        if (this.adapter) {
          for (const result of results) {
            try {
              let ref: any
              if (state.isChannel) {
                // КАНАЛ: reply в тред к конкретному сообщению
                // Формат conversationId: {channelId};messageid={messageId}
                ref = {
                  serviceUrl: state.serviceUrl,
                  conversation: {
                    id: `${state.conversationId};messageid=${result.replyToId}`,
                    isGroup: true,
                    tenantId: state.tenantId,
                  },
                  bot: { id: state.botId, name: 'Windrose Logs' },
                  channelId: 'msteams',
                }
                console.log(`[POLL] Channel reply ref: ${JSON.stringify(ref).slice(0, 120)}`)
              } else {
                // ГРУППОВОЙ ЧАТ: просто сообщение в чат (треды не поддерживаются)
                ref = {
                  serviceUrl: state.serviceUrl,
                  conversation: {
                    id: state.conversationId,
                    isGroup: true,
                    tenantId: state.tenantId,
                  },
                  bot: { id: state.botId, name: 'Windrose Logs' },
                  channelId: 'msteams',
                }
              }
              await (this.adapter as any).continueConversation(ref, async (ctx: TurnContext) => {
                const activity: any = {
                  type: 'message',
                  textFormat: 'html',
                  text: result.text,
                }
                await ctx.sendActivity(activity)
              })
              console.log(`[POLL] Sent (isChannel=${state.isChannel}) for msg ${result.replyToId}`)
            } catch (e: any) { console.error(`[POLL] Send error: ${e.message}`) }
          }
        }
      }
    }
  }

  private async handleMessage(ctx: TurnContext) {
    const activity = ctx.activity
    const uploaderName = activity.from?.name ?? activity.from?.id ?? 'Teams user'
    const rawText = (activity.text ?? '')
      .replace(/<at[^>]*>.*?<\/at>/gi, '').replace(/&nbsp;/gi, ' ').trim()
    const text = rawText.toLowerCase()

    // Register chat for polling
    const rawConvId = activity.conversation?.id ?? ''
    // For channels, strip ;messageid=xxx to get the base channel ID
    const baseConvId = rawConvId.split(';')[0]
    if (baseConvId && !watchedChats.has(baseConvId)) {
      const isChannel = baseConvId.includes('thread.tacv2')
      watchedChats.set(baseConvId, {
        lastCheck: new Date(),
        serviceUrl: activity.serviceUrl,
        conversationId: baseConvId,
        tenantId: (activity.channelData as any)?.tenant?.id ?? TENANT_ID,
        botId: activity.recipient?.id ?? '',
        isChannel,
      })
      console.log(`[WATCH] Registered: ${baseConvId} (isChannel=${isChannel})`)
      this.startPolling()
    }

    console.log(`[MSG] from="${uploaderName}" text="${text}" attachments=${activity.attachments?.length ?? 0}`)

    // Log attachments for debugging
    if (activity.attachments?.length) {
      activity.attachments.forEach((a, i) => {
        console.log(`[ATT${i}] name="${a.name}" type="${a.contentType}" url="${(a.contentUrl||'').slice(0,60)}"`)
        if (a.content) console.log(`[ATT${i}] content=${JSON.stringify(a.content).slice(0,150)}`)
      })
    }

    // ── File attachments (via bot message) ────────────────────────────────────
    const logFiles = (activity.attachments ?? []).filter(a => {
      const name = (a.name ?? '').toLowerCase()
      return (name.endsWith('.log') || name.endsWith('.zip')) &&
        (a.contentType === 'application/vnd.microsoft.teams.file.download.info' ||
         !!a.contentUrl || a.contentType?.startsWith('application/'))
    })

    if (logFiles.length > 0) {
      await ctx.sendActivity(MessageFactory.text(`⏳ Загружаю ${logFiles.length} файл(а)...`))
      const uploadedAt = new Date()
      const results: string[] = []
      for (const att of logFiles) {
        try {
          const downloadUrl = (att.content as any)?.downloadUrl ?? att.contentUrl
          if (!downloadUrl) { results.push(`❌ \`${att.name}\` — нет URL`); continue }
          const dlCtrl = new AbortController()
          const dlTimer = setTimeout(() => dlCtrl.abort(), 30000)
          let dlRes: any
          try { dlRes = await fetch(downloadUrl, { signal: dlCtrl.signal }) }
          finally { clearTimeout(dlTimer) }
          if (!dlRes.ok) throw new Error(`Download ${dlRes.status}`)
          const buf = Buffer.from(await dlRes.arrayBuffer())
          const upRes = await uploadLog(buf, att.name!, uploaderName)
          const files = upRes.files ?? [upRes]
          for (const f of files) {
            if (f.skipped) results.push(`⏭ \`${f.fileName}\` — уже в системе`)
            else results.push(`✅ \`${f.fileName}\` — принят, парсинг запущен`)
          }
        } catch (e: any) {
          results.push(`❌ \`${att.name}\` — ошибка: ${e.message}`)
        }
      }
      await ctx.sendActivity(MessageFactory.text(results.join('\n')))
      setTimeout(() => this.pollNewUnique(ctx, uploadedAt), 5000)
      return
    }

    // ── Commands ──────────────────────────────────────────────────────────────
    if (text === '!help' || text === 'help') {
      await ctx.sendActivity(MessageFactory.text(HELP)); return
    }
    if (text === '!stats' || text === '!r5') {
      try { await ctx.sendActivity(MessageFactory.text(fmtStats(await apiGet('/api/bot/stats')))) }
      catch (e: any) { await ctx.sendActivity(MessageFactory.text(`❌ ${e.message}`)) }
      return
    }
    if (text === '!r5 all') {
      try {
        const sigs = await apiGet('/api/bot/r5/all')
        if (!sigs.length) { await ctx.sendActivity(MessageFactory.text('Сигнатур нет')); return }
        const lines = sigs.slice(0, 20).map(fmtSig)
        const more = sigs.length > 20 ? `\n_...и ещё ${sigs.length - 20}. [Все](${PORTAL_URL}/r5checks)_` : ''
        await ctx.sendActivity(MessageFactory.text(`**R5Check** (${sigs.length})\n\n${lines.join('\n')}${more}`))
      } catch (e: any) { await ctx.sendActivity(MessageFactory.text(`❌ ${e.message}`)) }
      return
    }
    if (text === '!r5 popular') {
      try {
        const sigs = await apiGet('/api/bot/r5/popular?top=5')
        if (!sigs.length) { await ctx.sendActivity(MessageFactory.text('Нет данных')); return }
        await ctx.sendActivity(MessageFactory.text(`**Топ-5 частых**\n\n${sigs.map(fmtSig).join('\n')}\n\n🔗 [Портал](${PORTAL_URL}/r5checks)`))
      } catch (e: any) { await ctx.sendActivity(MessageFactory.text(`❌ ${e.message}`)) }
      return
    }
    if (text === '!r5 unique') {
      try {
        const sigs = await apiGet('/api/bot/r5/unique')
        if (!sigs.length) { await ctx.sendActivity(MessageFactory.text('Уникальных нет')); return }
        const lines = sigs.slice(0, 15).map(fmtSig)
        const more = sigs.length > 15 ? `\n_...и ещё ${sigs.length - 15}_` : ''
        await ctx.sendActivity(MessageFactory.text(`**Уникальные** (${sigs.length})\n\n${lines.join('\n')}${more}`))
      } catch (e: any) { await ctx.sendActivity(MessageFactory.text(`❌ ${e.message}`)) }
      return
    }
    if (text.startsWith('!')) {
      await ctx.sendActivity(MessageFactory.text(`Неизвестная команда. Напиши \`!help\``))
    }
  }

  private async pollNewUnique(ctx: TurnContext, since: Date) {
    let attempts = 0
    const check = async () => {
      if (++attempts > 20) return
      try {
        const sigs = await apiGet(`/api/bot/r5/new-unique?since=${since.toISOString()}`)
        if (!sigs.length) { setTimeout(check, 6000); return }
        const msg = [`🚨 **Найдена уникальная ошибка!**`, '', ...sigs.map((s: any, i: number) => fmtSig(s, i)), '', `🔗 [Портал](${PORTAL_URL}/r5checks)`].join('\n')
        await ctx.sendActivity(MessageFactory.text(msg))
      } catch { setTimeout(check, 6000) }
    }
    setTimeout(check, 6000)
  }
}

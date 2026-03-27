import {
  ActivityHandler, TurnContext, MessageFactory
} from 'botbuilder'
import fetch from 'node-fetch'
import FormData from 'form-data'
import * as https from 'https'

const API_URL    = process.env.WINDROSE_API_URL  || 'http://localhost:5000'
const API_KEY    = process.env.WINDROSE_API_KEY  || 'windrose-bulk-dev'
const PORTAL_URL = process.env.PORTAL_URL        || 'https://windroselogs.sundrift.tech'

// ── API helpers ──────────────────────────────────────────────────────────────
async function apiGet(path: string) {
  const res = await fetch(`${API_URL}${path}`, { headers: { 'X-Api-Key': API_KEY } })
  if (!res.ok) throw new Error(`API ${path} → ${res.status}`)
  return res.json() as Promise<any>
}

async function uploadLog(content: Buffer, fileName: string, uploaderName: string) {
  const form = new FormData()
  form.append('file', content, { filename: fileName, contentType: 'application/octet-stream' })
  const res = await fetch(`${API_URL}/api/bulk/upload`, {
    method: 'POST',
    headers: { 'X-Api-Key': API_KEY, 'X-Uploader-Name': uploaderName, ...form.getHeaders() },
    body: form,
  })
  if (!res.ok) throw new Error(`Upload failed: ${res.status}`)
  return res.json() as Promise<any>
}

async function downloadFile(url: string, token: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { Authorization: `Bearer ${token}` } }, res => {
      const chunks: Buffer[] = []
      res.on('data', (c: Buffer) => chunks.push(c))
      res.on('end', () => resolve(Buffer.concat(chunks)))
      res.on('error', reject)
    })
    req.on('error', reject)
  })
}

// ── Text formatters ──────────────────────────────────────────────────────────
function fmtSig(s: any, i: number): string {
  const date = new Date(s.lastSeen || s.firstSeen).toLocaleDateString('ru-RU')
  const count = s.totalCount ? ` · ${s.totalCount}x` : ''
  const file  = s.sourceFile ? ` · ${s.sourceFile}` : ''
  return `${i + 1}. \`${s.conditionText}\`${count}${file} · ${date}`
}

function fmtStats(s: any): string {
  return [
    `📊 **Windrose Logs — Статистика**`,
    ``,
    `🗂 Файлов: **${s.doneFiles}** (из ${s.totalFiles})`,
    `🔴 R5Check событий: **${s.r5Total}**`,
    `💧 Memory Leak событий: **${s.mlTotal}**`,
    `🔷 Уникальных сигнатур: **${s.signatures}**`,
    `⭐ Встречается только 1 раз: **${s.unique}**`,
    ``,
    `🔗 [Открыть портал](${PORTAL_URL})`,
  ].join('\n')
}

const HELP = `**Windrose Logs Bot**

📥 **Загрузить лог:** прикрепи *.log* или *.zip* файл в чат

📊 **Команды статистики:**
• \`!r5\` или \`!stats\` — общая статистика
• \`!r5 all\` — все R5Check сигнатуры
• \`!r5 popular\` — топ-5 самых частых
• \`!r5 unique\` — только уникальные (1 раз)
• \`!r5 last\` — взять последний лог с твоего ПК

❓ \`!help\` — это сообщение`

// ── Bot ──────────────────────────────────────────────────────────────────────
export class WindroseBot extends ActivityHandler {
  constructor() {
    super()
    this.onMessage(async (ctx, next) => {
      await this.handleMessage(ctx)
      await next()
    })
  }

  private async handleMessage(ctx: TurnContext) {
    const activity  = ctx.activity
    const uploaderName = activity.from?.name ?? activity.from?.id ?? 'Teams user'

    // Strip @mention HTML tags: "<at>Windrose Logs</at> !stats" → "!stats"
    const rawText = (activity.text ?? '')
      .replace(/<at[^>]*>.*?<\/at>/gi, '')
      .replace(/&nbsp;/gi, ' ')
      .trim()
    const text = rawText.toLowerCase()

    console.log(`[MSG] from="${uploaderName}" rawText="${rawText}" text="${text}" attachments=${activity.attachments?.length ?? 0}`)

    // Log full attachment details
    if (activity.attachments?.length) {
      activity.attachments.forEach((a, i) => {
        console.log(`[ATT${i}] name="${a.name}" contentType="${a.contentType}" contentUrl="${a.contentUrl?.slice(0,80)}" keys=${Object.keys(a).join(',')}`)
        if (a.content) console.log(`[ATT${i}] content=${JSON.stringify(a.content).slice(0,200)}`)
      })
    }

    // ── File attachment ──────────────────────────────────────────────────────
    const attachments = activity.attachments ?? []
    const logFiles = attachments.filter(a =>
      a.name?.endsWith('.log') || a.name?.endsWith('.zip')
    )

    if (logFiles.length > 0) {
      await ctx.sendActivity(MessageFactory.text(`⏳ Загружаю ${logFiles.length} файл(а)...`))
      const uploadedAt = new Date()
      const results: string[] = []

      for (const att of logFiles) {
        try {
          const token = (activity.channelData?.tenant as any)?.id
            ? await this.getTeamsToken(ctx)
            : null
          let buf: Buffer
          if (token && att.contentUrl) {
            buf = await downloadFile(att.contentUrl, token)
          } else if (att.contentUrl) {
            const r = await fetch(att.contentUrl)
            buf = Buffer.from(await r.arrayBuffer())
          } else continue

          const res = await uploadLog(buf, att.name!, uploaderName)
          const files = res.files ?? [res]
          for (const f of files) {
            if (f.skipped) results.push(`⏭ \`${f.fileName}\` — уже в системе`)
            else results.push(`✅ \`${f.fileName}\` — принят, парсинг запущен`)
          }
        } catch (e: any) {
          results.push(`❌ \`${att.name}\` — ошибка: ${e.message}`)
        }
      }

      await ctx.sendActivity(MessageFactory.text(results.join('\n')))

      // Poll for new unique signatures
      setTimeout(() => this.pollNewUnique(ctx, uploadedAt), 5000)
      return
    }

    // ── Commands ─────────────────────────────────────────────────────────────
    if (text === '!help' || text === 'help') {
      await ctx.sendActivity(MessageFactory.text(HELP))
      return
    }

    if (text === '!stats' || text === '!r5') {
      try {
        const s = await apiGet('/api/bot/stats')
        await ctx.sendActivity(MessageFactory.text(fmtStats(s)))
      } catch (e: any) {
        await ctx.sendActivity(MessageFactory.text(`❌ Ошибка: ${e.message}`))
      }
      return
    }

    if (text === '!r5 all') {
      try {
        const sigs = await apiGet('/api/bot/r5/all')
        if (!sigs.length) { await ctx.sendActivity(MessageFactory.text('Сигнатур нет')); return }
        const lines = sigs.slice(0, 20).map(fmtSig)
        const suffix = sigs.length > 20 ? `\n_...и ещё ${sigs.length - 20}. [Смотреть все](${PORTAL_URL}/r5checks)_` : ''
        await ctx.sendActivity(MessageFactory.text(`**R5Check — все сигнатуры** (${sigs.length})\n\n${lines.join('\n')}${suffix}`))
      } catch (e: any) {
        await ctx.sendActivity(MessageFactory.text(`❌ ${e.message}`))
      }
      return
    }

    if (text === '!r5 popular') {
      try {
        const sigs = await apiGet('/api/bot/r5/popular?top=5')
        if (!sigs.length) { await ctx.sendActivity(MessageFactory.text('Нет данных')); return }
        const lines = sigs.map(fmtSig)
        await ctx.sendActivity(MessageFactory.text(`**R5Check — топ-5 частых**\n\n${lines.join('\n')}\n\n🔗 [Открыть портал](${PORTAL_URL}/r5checks)`))
      } catch (e: any) {
        await ctx.sendActivity(MessageFactory.text(`❌ ${e.message}`))
      }
      return
    }

    if (text === '!r5 unique') {
      try {
        const sigs = await apiGet('/api/bot/r5/unique')
        if (!sigs.length) { await ctx.sendActivity(MessageFactory.text('Уникальных нет — все ошибки повторяются')); return }
        const lines = sigs.slice(0, 15).map(fmtSig)
        const suffix = sigs.length > 15 ? `\n_...и ещё ${sigs.length - 15}. [Смотреть все](${PORTAL_URL}/r5checks)_` : ''
        await ctx.sendActivity(MessageFactory.text(`**R5Check — уникальные** (встречались 1 раз, ${sigs.length} шт.)\n\n${lines.join('\n')}${suffix}`))
      } catch (e: any) {
        await ctx.sendActivity(MessageFactory.text(`❌ ${e.message}`))
      }
      return
    }

    if (text === '!r5 last') {
      await ctx.sendActivity(MessageFactory.text(
        `📎 Чтобы загрузить последний лог с твоего ПК — прикрепи файл *.log* к сообщению.\n\n` +
        `Teams не позволяет боту напрямую читать файлы с твоего компьютера, но ты можешь быстро прикрепить нужный файл через скрепку 📎`
      ))
      return
    }

    // Unknown command
    if (text.startsWith('!')) {
      await ctx.sendActivity(MessageFactory.text(`Неизвестная команда. Напиши \`!help\` чтобы увидеть список команд.`))
    }
  }

  // ── Poll for new unique signatures after upload ──────────────────────────
  private async pollNewUnique(ctx: TurnContext, since: Date) {
    let attempts = 0
    const check = async () => {
      attempts++
      if (attempts > 20) return // stop after ~2 min
      try {
        const sigs = await apiGet(`/api/bot/r5/new-unique?since=${since.toISOString()}`)
        if (sigs.length === 0) {
          setTimeout(check, 6000)
          return
        }
        // Found new unique signatures!
        const lines = sigs.map((s: any, i: number) => fmtSig(s, i))
        const msg = [
          `🚨 **Найдена уникальная ошибка!**`,
          ``,
          ...lines,
          ``,
          `🔗 [Посмотреть в портале](${PORTAL_URL}/r5checks)`,
        ].join('\n')
        await ctx.sendActivity(MessageFactory.text(msg))
      } catch {
        setTimeout(check, 6000)
      }
    }
    setTimeout(check, 6000)
  }

  // ── Get Teams token for downloading files ────────────────────────────────
  private async getTeamsToken(ctx: TurnContext): Promise<string | null> {
    try {
      // In Teams, files attached by users are accessible via contentUrl directly
      // with the bot's token — return null to use direct fetch
      return null
    } catch {
      return null
    }
  }
}

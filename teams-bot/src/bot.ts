import {
  ActivityHandler, TurnContext, MessageFactory
} from 'botbuilder'
import fetch from 'node-fetch'
import FormData from 'form-data'

const API_URL    = process.env.WINDROSE_API_URL  || 'http://localhost:5000'
const API_KEY    = process.env.WINDROSE_API_KEY  || 'windrose-bulk-dev'
const PORTAL_URL = process.env.PORTAL_URL        || 'https://windroselogs.sundrift.tech'

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
    const res = await fetch(`${API_URL}/api/bulk/upload`, {
      method: 'POST',
      headers: { 'X-Api-Key': API_KEY, 'X-Uploader-Name': uploaderName, ...form.getHeaders() },
      body: form, signal: ctrl.signal,
    })
    if (!res.ok) throw new Error(`Upload failed: ${res.status}`)
    return res.json() as Promise<any>
  } finally { clearTimeout(t) }
}

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

export class WindroseBot extends ActivityHandler {
  constructor() {
    super()
    this.onMessage(async (ctx, next) => { await this.handleMessage(ctx); await next() })
  }

  private async handleMessage(ctx: TurnContext) {
    const activity = ctx.activity
    const uploaderName = activity.from?.name ?? activity.from?.id ?? 'Teams user'
    const rawText = (activity.text ?? '')
      .replace(/<at[^>]*>.*?<\/at>/gi, '').replace(/&nbsp;/gi, ' ').trim()
    const text = rawText.toLowerCase()

    console.log(`[MSG] from="${uploaderName}" text="${text}" attachments=${activity.attachments?.length ?? 0}`)

    // ── File attachments (Teams sends as SharePoint links) ───────────────────
    const logFiles = (activity.attachments ?? []).filter(a =>
      a.contentType === 'application/vnd.microsoft.teams.file.download.info' &&
      (a.name?.endsWith('.log') || a.name?.endsWith('.zip'))
    )

    if (logFiles.length > 0) {
      await ctx.sendActivity(MessageFactory.text(`⏳ Загружаю ${logFiles.length} файл(а)...`))
      const uploadedAt = new Date()
      const results: string[] = []

      for (const att of logFiles) {
        try {
          const downloadUrl = (att.content as any)?.downloadUrl ?? att.contentUrl
          if (!downloadUrl) { results.push(`❌ \`${att.name}\` — нет URL`); continue }

          console.log(`[DL] ${att.name} from ${downloadUrl.slice(0, 80)}`)
          const dlCtrl = new AbortController()
          const dlTimer = setTimeout(() => dlCtrl.abort(), 30000)
          let dlRes: any
          try { dlRes = await fetch(downloadUrl, { signal: dlCtrl.signal }) }
          finally { clearTimeout(dlTimer) }
          if (!dlRes.ok) throw new Error(`Download ${dlRes.status}`)
          const buf = Buffer.from(await dlRes.arrayBuffer())
          console.log(`[DL] ${att.name}: ${buf.length} bytes`)

          console.log(`[UP] Uploading ${att.name}...`)
          const upRes = await uploadLog(buf, att.name!, uploaderName)
          console.log(`[UP] Done: ${JSON.stringify(upRes).slice(0, 100)}`)

          const files = upRes.files ?? [upRes]
          for (const f of files) {
            if (f.skipped) results.push(`⏭ \`${f.fileName}\` — уже в системе`)
            else results.push(`✅ \`${f.fileName}\` — принят, парсинг запущен`)
          }
        } catch (e: any) {
          console.error(`[ERR] ${att.name}: ${e.message}`)
          results.push(`❌ \`${att.name}\` — ошибка: ${e.message}`)
        }
      }

      await ctx.sendActivity(MessageFactory.text(results.join('\n')))
      setTimeout(() => this.pollNewUnique(ctx, uploadedAt), 5000)
      return
    }

    // ── Commands ─────────────────────────────────────────────────────────────
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

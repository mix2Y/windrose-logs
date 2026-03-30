import * as restify from 'restify'
import { BotFrameworkAdapter } from 'botbuilder'
import * as dotenv from 'dotenv'
import { WindroseBot, loadWatchedChats } from './bot'

dotenv.config()

const adapter = new BotFrameworkAdapter({
  appId:             process.env.MICROSOFT_APP_ID,
  appPassword:       process.env.MICROSOFT_APP_PASSWORD,
  channelAuthTenant: process.env.MICROSOFT_APP_TENANT_ID,  // required for Single Tenant
})

adapter.onTurnError = async (ctx, err) => {
  console.error('[BotError]', err)
  console.error('[BotError] Activity:', JSON.stringify(ctx.activity, null, 2))
  try { await ctx.sendActivity('Произошла ошибка. Попробуй ещё раз.') } catch { /**/ }
}

const bot = new WindroseBot(adapter)
const server = restify.createServer({ name: 'WindroseBot' })
server.use(restify.plugins.bodyParser())

server.post('/api/messages', async (req, res) => {
  const body = req.body || {}
  console.log(`[IN] ${new Date().toISOString()} type=${body.type} text="${body.text?.slice?.(0,80)}" keys=${Object.keys(body).join(',')}`)
  await adapter.processActivity(req, res, async ctx => {
    await bot.run(ctx)
  })
})

const PORT = process.env.PORT || 3978
server.listen(PORT, async () => {
  console.log(`\n✅ Windrose Bot running on port ${PORT}`)
  console.log(`   API: ${process.env.WINDROSE_API_URL}`)
  console.log(`   Portal: ${process.env.PORTAL_URL}`)
  // Load persisted chats and start polling (retry until API is ready)
  const tryLoad = async (attempts = 0) => {
    try {
      await loadWatchedChats()
      bot.startPollingIfNeeded()
    } catch {
      if (attempts < 10) setTimeout(() => tryLoad(attempts + 1), 3000)
    }
  }
  setTimeout(() => tryLoad(), 5000)
})

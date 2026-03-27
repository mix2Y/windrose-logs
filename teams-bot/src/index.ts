import * as restify from 'restify'
import { BotFrameworkAdapter } from 'botbuilder'
import * as dotenv from 'dotenv'
import { WindroseBot } from './bot'

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

const bot = new WindroseBot()
const server = restify.createServer({ name: 'WindroseBot' })
server.use(restify.plugins.bodyParser())

server.post('/api/messages', async (req, res) => {
  console.log(`[IN] ${new Date().toISOString()} type=${req.body?.type} text="${req.body?.text?.slice(0,80)}"`)
  await adapter.processActivity(req, res, async ctx => {
    await bot.run(ctx)
  })
})

const PORT = process.env.PORT || 3978
server.listen(PORT, () => {
  console.log(`\n✅ Windrose Bot running on port ${PORT}`)
  console.log(`   API: ${process.env.WINDROSE_API_URL}`)
  console.log(`   Portal: ${process.env.PORTAL_URL}`)
})

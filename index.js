const PORT = process.env.port || 8080
const path = require('path').resolve()
const express = require('express')
const cookieParser = require('cookie-parser')
const { get, post } = require('superagent')
const { client_id, client_secret, redirect_uri, scope } = require('./config.json')
const knex = require('knex')
const jwt = require('jsonwebtoken')
const randStr = require('crypto-random-string')
const { renderFile: render } = require('ejs')

const TOKEN_KEY = randStr({ length: 30 })
const OAUTH_URL =
'https://discord.com/api/oauth2/authorize?client_id=' + client_id +
'&redirect_uri=' + encodeURIComponent(redirect_uri)
+ '&response_type=code&scope=' + encodeURI(scope)

const db = knex({ client: 'mysql', connection: { host: 'localhost', port: 3306, user: 'seoafixed', database: 'seoafixed' } })
const app = express()

app.use(cookieParser())
app.use('/src', express.static(path + '/src'))

app.get('/', (_, res) => res.redirect('/step1'))
app.get('/step1', (_, res) => res.sendFile(path + '/page/index.html'))
app.get('/howto', (_, res) => res.sendFile(path + '/page/howto.html'))
app.get('/invite', (_, res) => res.redirect('https://discord.com/oauth2/authorize?client_id=' + client_id + '&permissions=0&scope=bot%20applications.commands'))
app.get('/step2', async (req, res) => {
  if (req.query.error) return res.redirect('/step1')
  if (!req.query.code) return res.redirect(OAUTH_URL)

  const tokenRes = await post('https://discord.com/api/v8/oauth2/token')
    .set('content-type', 'application/x-www-form-urlencoded')
    .send({ client_id, client_secret, grant_type: 'authorization_code', code: req.query.code, redirect_uri, scope })
    .catch(console.log)

  if (!tokenRes) return res.redirect('/step1')
  const { access_token, token_type } = tokenRes.body

  const userRes = await get('https://discord.com/api/v8/users/@me')
    .set('authorization', token_type + ' ' + access_token)
  const { id } = userRes.body

  const guildRes = await get('https://discord.com/api/v8/users/@me/guilds')
    .set('authorization', token_type + ' ' + access_token)
  const guilds = guildRes.body.filter((guild) => guild.owner)

  const [exists] =  await db.select('*').from('obt_whitelist').where('ownerid', id)
  
  res.cookie('token', jwt.sign({ id }, TOKEN_KEY))
  const str = await render(path + '/page/callback.ejs', { exists: !!exists, guilds })

  res.send(str)
})

app.get('/step3', async (req, res) => {
  if (!req.cookies.token) return res.redirect('/step1')
  if (!req.query.guild) return res.redirect('/step2')

  let id
  try {
    id = jwt.verify(req.cookies.token, TOKEN_KEY).id
  } catch (_) {
    return res.redirect('/step1')
  }

  await db.insert({ serverid: req.query.guild, ownerid: id }).into('obt_whitelist')
  res.sendFile(path + '/page/finish.html')
})

app.listen(PORT, () => console.log('Server is now on http://localhost:' + PORT))

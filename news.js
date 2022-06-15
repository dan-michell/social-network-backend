import { Application } from 'https://deno.land/x/abc@v1.3.3/mod.ts'
import { DB } from 'https://deno.land/x/sqlite/mod.ts'
import { abcCors } from 'https://deno.land/x/cors/mod.ts'
import { DOMParser } from 'https://deno.land/x/deno_dom/deno-dom-wasm.ts'
import * as bcrypt from 'https://deno.land/x/bcrypt/mod.ts'
import { v4 } from 'https://deno.land/std@0.140.0/uuid/mod.ts'

const db = new DB('./stories.db')
const app = new Application()
const PORT = 8080

app
  .use(abcCors({ origin: 'http://localhost:3000', credentials: true }))
  .get('/stories', getStories)
  .post('/stories/:id/votes', updateVotes)
  .post('/stories/:id/comment', addComment)
  .get('/stories/:id/comment', getComments)
  .get('/submit', async (server) => {})
  .post('/stories', addStory)
  .delete('/stories/:id', deleteStory)
  .post('/login', async () => {})
  .get('/sessions', getUser)
  .post('/sessions', handleLogin)
  .delete('/sessions', handleLogout)
  .get('/signup', async () => {})
  .post('/users', handleRegistration)
  .start({ port: PORT })

async function getStories(server) {
  const { value, order } = server.queryParams
  if (
    (value === 'total_votes' || value === 'created_at') &&
    (order === 'ASC' || order === 'DESC')
  ) {
    let stories = db.queryEntries(
      `SELECT stories.*, comment, SUM(CASE direction WHEN 'up' THEN 1 WHEN 'down' THEN -1 ELSE 0 END) AS total_votes FROM stories LEFT JOIN votes ON stories.id = votes.story_id LEFT JOIN comments ON stories.id = comments.story_id GROUP BY stories.id ORDER BY ${value} ${order};`
    )
    return server.json(stories, 200)
  }
  return server.json({ error: 'Unable to fetch stories' }, 400)
}

async function updateVotes(server) {
  const { id } = server.params
  const { direction } = await server.body
  const sessionId = server.cookies.sessionId
  const user = getCurrentUser(sessionId)
  const story = db.queryEntries('SELECT * FROM stories WHERE id = ?', [id])

  if (user.length > 0 && user[0].id !== story[0].user_id) {
    db.query(
      "INSERT INTO votes(direction, story_id, user_id, created_at, updated_at) VALUES (?, ?, ?, datetime('now'), datetime('now'))",
      [direction, id, user[0].id]
    )
    return server.json({ response: 'Vote successfully added' }, 200)
  } else if (user.length === 0) {
    return server.json({ response: 'Not logged in' }, 400)
  } else {
    return server.json({ response: "Can't upvote own post" }, 200)
  }
}

async function addStory(server) {
  const { title, url } = await server.body
  const sessionId = server.cookies.sessionId
  const user = getCurrentUser(sessionId)

  if ((await isValidUrl(url)) && user.length > 0) {
    let finalTitle
    if (!title) finalTitle = await getTitleFromWebpage(url)
    else finalTitle = title
    db.query(
      "INSERT INTO stories(title, url, user_id, created_at, updated_at) VALUES (?, ?, ?, datetime('now'), datetime('now'));",
      [finalTitle, url, user[0].id]
    )
    return server.json({ response: 'Story successfully added' }, 200)
  }
  return server.json({ response: 'Story add failed (not logged in)' }, 400)
}

async function deleteStory(server) {
  const { id } = server.params
  const sessionId = server.cookies.sessionId
  const user = getCurrentUser(sessionId)
  const story = db.queryEntries('SELECT * FROM stories WHERE id = ?', [id])
  if (user.length > 0 && user[0].id === story[0].user_id) {
    db.query('DELETE FROM votes WHERE story_id = ?', [id])
    db.query('DELETE FROM stories WHERE id = ?', [id])
    return server.json({ response: `Story with ID ${id} deleted!` }, 200)
  } else if (user.length === 0) {
    return server.json({ response: 'Not logged in' }, 400)
  } else {
    return server.json({ response: "Can't delete other's posts" }, 200)
  }
}

async function handleRegistration(server) {
  const { email, password, passwordConformation } = await server.body
  if (validateCredentials(email, password, passwordConformation)) {
    const salt = await bcrypt.genSalt(8)
    const passwordEncrypted = await hashPassword(password, salt)
    db.query(
      "INSERT INTO users (email, encrypted_password, salt, created_at, updated_at) VALUES (?, ?, ?, datetime('now'), datetime('now'))",
      [email, passwordEncrypted, salt]
    )
    return server.json({ response: 'Registration successful!' }, 200)
  }
  return server.json(
    {
      response:
        'Registration unsuccessful, check passwords match and email is valid.'
    },
    200
  )
}

async function handleLogin(server) {
  const { email, password } = await server.body
  const isAuthorisedInfo = await loginAuthentication(email, password)
  if (isAuthorisedInfo[0]) {
    const userId = isAuthorisedInfo[1][0].id
    const sessionId = await createSessionId(userId)
    server.setCookie({
      name: 'sessionId',
      value: sessionId
    })
    return server.json({
      response: 'Login success!'
    })
  }
  return server.json({ response: 'Login failed, check details and try again.' })
}

async function handleLogout(server) {
  const sessionId = server.cookies.sessionId
  const user = getCurrentUser(sessionId)
  if (user.length > 0) {
    const userId = user[0].id
    db.query('DELETE FROM sessions WHERE user_id = ?', [userId])
    return server.json({ response: 'Successfully logged out' }, 200)
  }
  return server.json({ response: 'Not logged in' }, 200)
}

async function getUser(server) {
  const sessionId = server.cookies.sessionId
  const user = getCurrentUser(sessionId)
  if (user.length > 0) {
    return server.json(user)
  } else {
    return server.json({ error: 'No user found' })
  }
}

async function getComments(server) {
  const { id } = server.params
  let comments = db.queryEntries(
    'SELECT comments.*, email FROM comments JOIN users ON comments.user_id = users.id WHERE story_id = ?',
    [id]
  )
  return server.json(comments, 200)
}

async function addComment(server) {
  const { id } = server.params
  const { comment } = await server.body
  const sessionId = server.cookies.sessionId
  const user = getCurrentUser(sessionId)

  if (user.length > 0) {
    db.query(
      "INSERT INTO comments(story_id, user_id, comment, created_at, updated_at) VALUES (?, ?, ?, datetime('now'), datetime('now'));",
      [id, user[0].id, comment]
    )
    return server.json({ response: 'Story successfully added' }, 200)
  }
  return server.json({ response: 'Story add failed (not logged in)' }, 400)
}

async function isValidUrl(url) {
  try {
    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`Error! Status: ${response.status}`)
    }
    await response.body.cancel()
    return true
  } catch (e) {
    console.log(e)
    return false
  }
}

async function getTitleFromWebpage(url) {
  const response = await fetch(url)
  const html = await response.text()
  const parser = new DOMParser()
  const document = parser.parseFromString(html, 'text/html')
  return document.querySelector('title').textContent
}

function validateCredentials(email, password, passwordConformation) {
  const duplicateEmailCheck = db.queryEntries(
    'SELECT * FROM users WHERE email = ?',
    [email]
  )
  if (
    duplicateEmailCheck.length < 1 &&
    password === passwordConformation &&
    password.length > 0
  ) {
    return true
  }
  return false
}

async function loginAuthentication(email, password) {
  const existingUserCheck = db.queryEntries(
    'SELECT * FROM users WHERE email = ?',
    [email]
  )
  if (existingUserCheck.length > 0) {
    const userSalt = existingUserCheck[0].salt
    const userHashedPassword = existingUserCheck[0].encrypted_password
    const passwordEncrypted = await hashPassword(password, userSalt)
    if (passwordEncrypted === userHashedPassword) {
      return [true, existingUserCheck]
    }
  }
  return [false]
}

async function createSessionId(userId) {
  const sessionId = crypto.randomUUID()
  db.query(
    "INSERT INTO sessions (uuid, user_id, created_at) VALUES (?, ?, datetime('now'))",
    [sessionId, userId]
  )
  return sessionId
}

async function hashPassword(password, salt) {
  const hashedPassword = await bcrypt.hash(password, salt)
  return hashedPassword
}

function getCurrentUser(sessionId) {
  const query =
    "SELECT * FROM users JOIN sessions ON users.id = sessions.user_id WHERE sessions.created_at < date('now', '+7 day') AND sessions.uuid = ?"
  const user = db.queryEntries(query, [sessionId])
  return user
}

console.log(`Server running on http://localhost:${PORT}`)

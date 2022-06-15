import { DB } from 'https://deno.land/x/sqlite/mod.ts'

try {
  await Deno.remove('./stories.db')
} catch {
  // nothing to remove
}

const db = new DB('./stories.db')

await db.query(
  `CREATE TABLE stories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    url TEXT NOT NULL,
    user_id INTEGER,
    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL
  )`
)

await db.query(
  `CREATE TABLE votes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    direction TEXT NOT NULL DEFAULT 'up',
    story_id INTEGER,
    user_id INTEGER,
    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL,
    FOREIGN KEY(story_id) REFERENCES stories(id)
  )`
)

await db.query(
  `CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    encrypted_password TEXT NOT NULL,
    salt TEXT,
    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL
  )`
)

await db.query(
  `CREATE TABLE sessions (
    uuid TEXT PRIMARY KEY,
    created_at DATETIME NOT NULL,
    user_id INTEGER
  )`
)

await db.query(
  `CREATE TABLE comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    story_id INTEGER,
    user_id INTEGER,
    comment TEXT NOT NULL,
    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL,
    FOREIGN KEY(story_id) REFERENCES stories(id)
  )`
)

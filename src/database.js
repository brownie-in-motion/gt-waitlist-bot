const Sqlite = require('better-sqlite3')

class Database {
  queries = [
    {
      name: 'getConfig',
      query: 'SELECT value FROM config WHERE key = ?;',
      method: 'get',
    },
    {
      name: 'setConfig',
      query: `
        INSERT INTO config (key, value) VALUES (@key, @value)
          ON CONFLICT (key) DO UPDATE SET value = @value;
      `,
      method: 'run',
    },
    {
      name: 'getAllCourses',
      query: `SELECT crns.crn, available FROM (
          SELECT DISTINCT crn FROM watches
        ) as crns
        LEFT JOIN courses ON crns.crn = courses.crn;
      `,
      method: 'all',
    },
    {
      name: 'getUserCourses',
      query: 'SELECT crn FROM watches WHERE user = ?;',
      method: 'all',
    },
    {
      name: 'getCourseWatchers',
      query: 'SELECT user FROM watches WHERE crn = ?;',
      method: 'all',
    },
    {
      name: 'addWatch',
      query: 'INSERT INTO watches (user, crn) VALUES (?, ?);',
      method: 'run',
    },
    {
      name: 'removeWatch',
      query: 'DELETE FROM watches WHERE user = ? AND crn = ?;',
      method: 'run',
    },
    {
      name: 'getStatus',
      query: 'SELECT available FROM courses WHERE crn = ?;',
      method: 'get',
    },
    {
      name: 'setStatus',
      query: `INSERT INTO courses (crn, available) VALUES (@crn, @available)
        ON CONFLICT (crn) DO UPDATE SET available = @available;
      `,
      method: 'run',
    },
    {
      name: 'removeCourse',
      query: 'DELETE FROM courses WHERE crn = ?',
      method: 'run',
    },
  ]

  constructor(filename) {
    this.db = new Sqlite(filename)
    this.db.pragma('journal_mode = WAL')
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS config (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      ) STRICT, WITHOUT ROWID;
      CREATE TABLE IF NOT EXISTS watches (
        id INTEGER PRIMARY KEY,
        user TEXT NOT NULL,
        crn TEXT NOT NULL,
        UNIQUE(user, crn)
      ) STRICT;
      CREATE TABLE IF NOT EXISTS courses (
        crn TEXT PRIMARY KEY,
        available INTEGER NOT NULL
      ) STRICT;
    `)

    this.queries.forEach(({ name, query, method }) => {
      const statement = this.db.prepare(query)
      this[name] = statement[method].bind(statement)
    })
  }
}

module.exports = new Database('data/db.sqlite3')

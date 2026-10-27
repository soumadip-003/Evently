
const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'events.db'));

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    event_date TEXT NOT NULL,
    schedule TEXT NOT NULL,
    venue TEXT NOT NULL,
    capacity INTEGER NOT NULL CHECK (capacity > 0),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS registrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    email TEXT NOT NULL COLLATE NOCASE,
    organization TEXT NOT NULL,
    interests TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'registered'
      CHECK (status IN ('registered', 'attended', 'cancelled')),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
    UNIQUE (event_id, email)
  );

  CREATE TABLE IF NOT EXISTS organizers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL COLLATE NOCASE UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS payment_orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id INTEGER NOT NULL,
    razorpay_order_id TEXT NOT NULL UNIQUE,
    razorpay_payment_id TEXT UNIQUE,
    amount_paise INTEGER NOT NULL CHECK (amount_paise > 0),
    currency TEXT NOT NULL DEFAULT 'INR',
    attendee_name TEXT NOT NULL,
    attendee_email TEXT NOT NULL COLLATE NOCASE,
    organization TEXT NOT NULL,
    interests TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'created'
      CHECK (status IN ('created', 'paid', 'failed')),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    verified_at TEXT,
    FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE RESTRICT
  );
`);

const existingColumns = new Set(
  db.prepare('PRAGMA table_info(events)').all().map(column => column.name)
);

const migrations = [
  [
    'organizer_id',
    'ALTER TABLE events ADD COLUMN organizer_id INTEGER REFERENCES organizers(id) ON DELETE SET NULL'
  ],
  [
    'image_url',
    "ALTER TABLE events ADD COLUMN image_url TEXT NOT NULL DEFAULT ''"
  ],
  [
    'category',
    "ALTER TABLE events ADD COLUMN category TEXT NOT NULL DEFAULT 'General'"
  ],
  [
    'price',
    'ALTER TABLE events ADD COLUMN price REAL NOT NULL DEFAULT 0 CHECK (price >= 0)'
  ],
  [
    'currency',
    "ALTER TABLE events ADD COLUMN currency TEXT NOT NULL DEFAULT 'INR'"
  ],
  [
    'status',
    "ALTER TABLE events ADD COLUMN status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('draft', 'published'))"
  ]
];

db.transaction(() => {
  for (const [columnName, sql] of migrations) {
    if (!existingColumns.has(columnName)) {
      db.exec(sql);
      existingColumns.add(columnName);
      console.log(`Added events column: ${columnName}`);
    }
  }
})();

const eventCount = db.prepare(
  'SELECT COUNT(*) AS count FROM events'
).get().count;

if (eventCount === 0) {
  const insertEvent = db.prepare(`
    INSERT INTO events
      (title, description, event_date, schedule, venue, capacity)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const seedEvents = db.transaction(() => {
    insertEvent.run(
      'Web Development Workshop',
      'Learn the fundamentals of modern web development through practical sessions.',
      '2026-11-15',
      '10:00 AM - 1:00 PM',
      'Main Auditorium',
      100
    );

    insertEvent.run(
      'AI & Machine Learning Seminar',
      'Explore artificial intelligence, machine learning and real-world applications.',
      '2026-11-20',
      '11:00 AM - 2:00 PM',
      'Innovation Lab',
      80
    );

    insertEvent.run(
      'Startup & Innovation Meetup',
      'Connect with aspiring entrepreneurs and discuss innovative ideas.',
      '2026-11-25',
      '2:00 PM - 5:00 PM',
      'Conference Hall',
      60
    );
  });

  seedEvents();
}

console.log('SQLite database connected successfully.');

module.exports = db;

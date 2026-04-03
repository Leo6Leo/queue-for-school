import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_FILE = path.join(__dirname, 'queue.sqlite');

export type DBQueueType = 'marking' | 'question';
export type DBRole = 'student' | 'ta';

export interface RoomRecordInput {
  name: string;
  password: string | null;
  isActive?: boolean;
}

export interface UserRecordInput {
  userId: string;
  displayName?: string | null;
  email?: string | null;
  lastRoom?: string | null;
  role?: DBRole;
}

export interface QueueEventInput {
  roomName: string;
  userId?: string | null;
  entryId?: string | null;
  queueType?: DBQueueType | null;
  eventType: string;
  status?: string | null;
  payload?: unknown;
}

export interface AttachmentRecordInput {
  id: string;
  roomName: string;
  userId: string;
  queueType: DBQueueType;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  storageKey: string;
}

export interface AuthOtpInput {
  email: string;
  role: DBRole;
  otpHash: string;
  expiresAt: string;
}

export interface AuthSessionInput {
  id: string;
  userId: string;
  email: string;
  displayName: string | null;
  role: DBRole;
  tokenHash: string;
  expiresAt: string;
}

interface AttachmentRow {
  id: string;
  room_name: string;
  user_id: string;
  queue_type: string;
  file_name: string;
  content_type: string;
  size_bytes: number;
  storage_key: string;
  created_at: string;
}

interface CountRow {
  event_type: string;
  count: number;
}

interface EventRow {
  id: number;
  room_name: string;
  user_id: string | null;
  entry_id: string | null;
  queue_type: string | null;
  event_type: string;
  status: string | null;
  payload_json: string | null;
  created_at: string;
}

interface UserRow {
  user_id: string;
  display_name: string | null;
  email: string | null;
  last_room: string | null;
  role: string | null;
  last_seen_at: string;
}

interface AuthOtpRow {
  id: number;
  email: string;
  role: string;
  otp_hash: string;
  expires_at: string;
  consumed_at: string | null;
  created_at: string;
}

interface AuthSessionRow {
  id: string;
  user_id: string;
  email: string;
  display_name: string | null;
  role: string;
  token_hash: string;
  expires_at: string;
  revoked_at: string | null;
  created_at: string;
  last_used_at: string;
}

const db = new Database(DB_FILE);
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS rooms (
    name TEXT PRIMARY KEY,
    password TEXT,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS users (
    user_id TEXT PRIMARY KEY,
    display_name TEXT,
    email TEXT,
    last_room TEXT,
    role TEXT,
    last_seen_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_users_email
    ON users(email);

  CREATE TABLE IF NOT EXISTS queue_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    room_name TEXT NOT NULL,
    user_id TEXT,
    entry_id TEXT,
    queue_type TEXT,
    event_type TEXT NOT NULL,
    status TEXT,
    payload_json TEXT,
    created_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_queue_events_room_created
    ON queue_events(room_name, created_at DESC);

  CREATE INDEX IF NOT EXISTS idx_queue_events_user_created
    ON queue_events(user_id, created_at DESC);

  CREATE TABLE IF NOT EXISTS attachments (
    id TEXT PRIMARY KEY,
    room_name TEXT NOT NULL,
    user_id TEXT NOT NULL,
    queue_type TEXT NOT NULL,
    file_name TEXT NOT NULL,
    content_type TEXT NOT NULL,
    size_bytes INTEGER NOT NULL,
    storage_key TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_attachments_room_created
    ON attachments(room_name, created_at DESC);

  CREATE TABLE IF NOT EXISTS auth_otps (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL,
    role TEXT NOT NULL,
    otp_hash TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    consumed_at TEXT,
    created_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_auth_otps_email_created
    ON auth_otps(email, created_at DESC);

  CREATE TABLE IF NOT EXISTS auth_sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    email TEXT NOT NULL,
    display_name TEXT,
    role TEXT NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at TEXT NOT NULL,
    revoked_at TEXT,
    created_at TEXT NOT NULL,
    last_used_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_auth_sessions_user
    ON auth_sessions(user_id, created_at DESC);
`);

const upsertRoomStatement = db.prepare(`
  INSERT INTO rooms (name, password, is_active, created_at, updated_at)
  VALUES (@name, @password, @is_active, @timestamp, @timestamp)
  ON CONFLICT(name) DO UPDATE SET
    password = excluded.password,
    is_active = excluded.is_active,
    updated_at = excluded.updated_at
`);

const upsertUserStatement = db.prepare(`
  INSERT INTO users (user_id, display_name, email, last_room, role, last_seen_at)
  VALUES (@user_id, @display_name, @email, @last_room, @role, @last_seen_at)
  ON CONFLICT(user_id) DO UPDATE SET
    display_name = COALESCE(excluded.display_name, users.display_name),
    email = COALESCE(excluded.email, users.email),
    last_room = COALESCE(excluded.last_room, users.last_room),
    role = COALESCE(excluded.role, users.role),
    last_seen_at = excluded.last_seen_at
`);

const findUserByEmailStatement = db.prepare(`
  SELECT user_id, display_name, email, last_room, role, last_seen_at
  FROM users
  WHERE lower(email) = lower(?)
  LIMIT 1
`);

const insertQueueEventStatement = db.prepare(`
  INSERT INTO queue_events (
    room_name,
    user_id,
    entry_id,
    queue_type,
    event_type,
    status,
    payload_json,
    created_at
  )
  VALUES (
    @room_name,
    @user_id,
    @entry_id,
    @queue_type,
    @event_type,
    @status,
    @payload_json,
    @created_at
  )
`);

const markRoomInactiveStatement = db.prepare(`
  UPDATE rooms
  SET is_active = 0, updated_at = @updated_at
  WHERE name = @name
`);

const insertAttachmentStatement = db.prepare(`
  INSERT INTO attachments (
    id,
    room_name,
    user_id,
    queue_type,
    file_name,
    content_type,
    size_bytes,
    storage_key,
    created_at
  )
  VALUES (
    @id,
    @room_name,
    @user_id,
    @queue_type,
    @file_name,
    @content_type,
    @size_bytes,
    @storage_key,
    @created_at
  )
`);

const getAttachmentStatement = db.prepare(`
  SELECT id, room_name, user_id, queue_type, file_name, content_type, size_bytes, storage_key, created_at
  FROM attachments
  WHERE id = ?
`);

const countEventsStatement = db.prepare(`
  SELECT event_type, COUNT(*) AS count
  FROM queue_events
  WHERE room_name = ?
  GROUP BY event_type
`);

const recentEventsStatement = db.prepare(`
  SELECT id, room_name, user_id, entry_id, queue_type, event_type, status, payload_json, created_at
  FROM queue_events
  WHERE room_name = ?
  ORDER BY created_at DESC
  LIMIT ?
`);

const invalidateOtpsStatement = db.prepare(`
  UPDATE auth_otps
  SET consumed_at = @consumed_at
  WHERE lower(email) = lower(@email)
    AND consumed_at IS NULL
`);

const insertOtpStatement = db.prepare(`
  INSERT INTO auth_otps (
    email,
    role,
    otp_hash,
    expires_at,
    created_at
  )
  VALUES (
    @email,
    @role,
    @otp_hash,
    @expires_at,
    @created_at
  )
`);

const getMatchingOtpStatement = db.prepare(`
  SELECT id, email, role, otp_hash, expires_at, consumed_at, created_at
  FROM auth_otps
  WHERE lower(email) = lower(?)
    AND otp_hash = ?
    AND consumed_at IS NULL
  ORDER BY created_at DESC
  LIMIT 1
`);

const consumeOtpStatement = db.prepare(`
  UPDATE auth_otps
  SET consumed_at = @consumed_at
  WHERE id = @id
`);

const insertSessionStatement = db.prepare(`
  INSERT INTO auth_sessions (
    id,
    user_id,
    email,
    display_name,
    role,
    token_hash,
    expires_at,
    created_at,
    last_used_at
  )
  VALUES (
    @id,
    @user_id,
    @email,
    @display_name,
    @role,
    @token_hash,
    @expires_at,
    @created_at,
    @last_used_at
  )
`);

const getSessionByTokenHashStatement = db.prepare(`
  SELECT id, user_id, email, display_name, role, token_hash, expires_at, revoked_at, created_at, last_used_at
  FROM auth_sessions
  WHERE token_hash = ?
    AND revoked_at IS NULL
    AND expires_at > ?
  LIMIT 1
`);

const touchSessionStatement = db.prepare(`
  UPDATE auth_sessions
  SET last_used_at = @last_used_at
  WHERE token_hash = @token_hash
`);

const revokeSessionStatement = db.prepare(`
  UPDATE auth_sessions
  SET revoked_at = @revoked_at
  WHERE token_hash = @token_hash
    AND revoked_at IS NULL
`);

export const upsertRoomRecord = (input: RoomRecordInput): void => {
  const timestamp = new Date().toISOString();
  upsertRoomStatement.run({
    name: input.name,
    password: input.password,
    is_active: input.isActive === false ? 0 : 1,
    timestamp,
  });
};

export const markRoomInactive = (name: string): void => {
  markRoomInactiveStatement.run({
    name,
    updated_at: new Date().toISOString(),
  });
};

export const syncRoomRecords = (
  rooms: Iterable<[string, { password: string | null }]>,
): void => {
  for (const [name, room] of rooms) {
    upsertRoomRecord({
      name,
      password: room.password,
      isActive: true,
    });
  }
};

export const upsertUserRecord = (input: UserRecordInput): void => {
  upsertUserStatement.run({
    user_id: input.userId,
    display_name: input.displayName ?? null,
    email: input.email ?? null,
    last_room: input.lastRoom ?? null,
    role: input.role ?? null,
    last_seen_at: new Date().toISOString(),
  });
};

export const findUserByEmail = (email: string) => {
  const row = findUserByEmailStatement.get(email) as UserRow | undefined;
  if (!row) {
    return null;
  }

  return {
    userId: row.user_id,
    displayName: row.display_name,
    email: row.email,
    lastRoom: row.last_room,
    role: (row.role ?? null) as DBRole | null,
    lastSeenAt: row.last_seen_at,
  };
};

export const recordQueueEvent = (input: QueueEventInput): void => {
  insertQueueEventStatement.run({
    room_name: input.roomName,
    user_id: input.userId ?? null,
    entry_id: input.entryId ?? null,
    queue_type: input.queueType ?? null,
    event_type: input.eventType,
    status: input.status ?? null,
    payload_json: input.payload === undefined ? null : JSON.stringify(input.payload),
    created_at: new Date().toISOString(),
  });
};

export const getRoomAnalytics = (roomName: string, limit = 20) => {
  const counts = countEventsStatement.all(roomName) as CountRow[];
  const recentEvents = (recentEventsStatement.all(roomName, limit) as EventRow[]).map((row) => ({
    id: row.id,
    roomName: row.room_name,
    userId: row.user_id,
    entryId: row.entry_id,
    queueType: row.queue_type,
    eventType: row.event_type,
    status: row.status,
    payload: row.payload_json ? JSON.parse(row.payload_json) : null,
    createdAt: row.created_at,
  }));

  return {
    roomName,
    counts: Object.fromEntries(counts.map((row) => [row.event_type, row.count])),
    recentEvents,
  };
};

export const createAttachmentRecord = (input: AttachmentRecordInput): void => {
  insertAttachmentStatement.run({
    id: input.id,
    room_name: input.roomName,
    user_id: input.userId,
    queue_type: input.queueType,
    file_name: input.fileName,
    content_type: input.contentType,
    size_bytes: input.sizeBytes,
    storage_key: input.storageKey,
    created_at: new Date().toISOString(),
  });
};

export const getAttachmentRecord = (id: string) => {
  const row = getAttachmentStatement.get(id) as AttachmentRow | undefined;
  if (!row) return null;

  return {
    id: row.id,
    roomName: row.room_name,
    userId: row.user_id,
    queueType: row.queue_type as DBQueueType,
    fileName: row.file_name,
    contentType: row.content_type,
    sizeBytes: row.size_bytes,
    storageKey: row.storage_key,
    createdAt: row.created_at,
  };
};

export const createOtpRecord = (input: AuthOtpInput): void => {
  const consumedAt = new Date().toISOString();
  invalidateOtpsStatement.run({
    email: input.email,
    consumed_at: consumedAt,
  });

  insertOtpStatement.run({
    email: input.email,
    role: input.role,
    otp_hash: input.otpHash,
    expires_at: input.expiresAt,
    created_at: consumedAt,
  });
};

export const consumeOtpRecord = (email: string, otpHash: string) => {
  const row = getMatchingOtpStatement.get(email, otpHash) as AuthOtpRow | undefined;
  if (!row) {
    return null;
  }

  if (new Date(row.expires_at).getTime() <= Date.now()) {
    return null;
  }

  consumeOtpStatement.run({
    id: row.id,
    consumed_at: new Date().toISOString(),
  });

  return {
    id: row.id,
    email: row.email,
    role: row.role as DBRole,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
  };
};

export const createAuthSession = (input: AuthSessionInput): void => {
  const timestamp = new Date().toISOString();
  insertSessionStatement.run({
    id: input.id,
    user_id: input.userId,
    email: input.email,
    display_name: input.displayName,
    role: input.role,
    token_hash: input.tokenHash,
    expires_at: input.expiresAt,
    created_at: timestamp,
    last_used_at: timestamp,
  });
};

export const getAuthSessionByTokenHash = (tokenHash: string) => {
  const row = getSessionByTokenHashStatement.get(
    tokenHash,
    new Date().toISOString(),
  ) as AuthSessionRow | undefined;

  if (!row) {
    return null;
  }

  touchSessionStatement.run({
    token_hash: tokenHash,
    last_used_at: new Date().toISOString(),
  });

  return {
    id: row.id,
    userId: row.user_id,
    email: row.email,
    displayName: row.display_name,
    role: row.role as DBRole,
    tokenHash: row.token_hash,
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at,
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at,
  };
};

export const revokeAuthSession = (tokenHash: string): void => {
  revokeSessionStatement.run({
    token_hash: tokenHash,
    revoked_at: new Date().toISOString(),
  });
};

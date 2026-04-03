import cors from 'cors';
import { createHash, randomBytes } from 'crypto';
import express, { type Request, type Response } from 'express';
import fs from 'fs';
import multer from 'multer';
import path from 'path';
import { createServer } from 'http';
import { fileURLToPath } from 'url';
import { Server, type Socket } from 'socket.io';
import { v4 as uuidv4 } from 'uuid';
import {
  createAttachmentRecord,
  createAuthSession,
  createOtpRecord,
  consumeOtpRecord,
  findUserByEmail,
  getAuthSessionByTokenHash,
  getAttachmentRecord,
  getRoomAnalytics,
  markRoomInactive,
  recordQueueEvent,
  revokeAuthSession,
  syncRoomRecords,
  upsertRoomRecord,
  upsertUserRecord,
  type DBRole,
} from './db.js';
import { buildOtpEmail } from './emailTemplates/otpEmail.js';
import { buildTurnReadyEmail } from './emailTemplates/turnReadyEmail.js';
import { getMailerMode, sendEmail } from './mailer.js';
import { getStorageMode, loadAttachment, storeAttachment } from './storage.js';

type QueueType = 'marking' | 'question';
type QueueSelection = QueueType | 'combined';
type EntryStatus = 'waiting' | 'called' | 'assisting';

interface Follower {
  userId: string;
  name: string;
}

interface AttachmentMeta {
  id: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  downloadUrl: string;
}

interface BaseQueueEntry {
  id: string;
  name: string;
  email: string | null;
  joinedAt: string;
  userId: string;
  status: EntryStatus;
}

interface MarkingEntry extends BaseQueueEntry {
  studentId: string;
  attachment: AttachmentMeta | null;
}

interface QuestionEntry extends BaseQueueEntry {
  description: string | null;
  followers: Follower[];
  attachment: AttachmentMeta | null;
}

type QueueEntry = MarkingEntry | QuestionEntry;

interface RoomData {
  marking: MarkingEntry[];
  question: QuestionEntry[];
  password: string | null;
}

interface RoomSummary {
  name: string;
  markingCount: number;
  questionCount: number;
  hasPassword: boolean;
}

interface JoinedQueuePayload {
  queueType: QueueType;
  position: number;
  entryId: string;
}

interface RestoreEntryInfo {
  entryId: string;
  position: number;
  status: EntryStatus;
}

interface JoinMarkingPayload {
  name?: string;
  studentId?: string;
  email?: string | null;
  userId?: string;
  room?: string;
  attachment?: AttachmentMeta | null;
}

interface JoinQuestionPayload {
  name?: string;
  email?: string | null;
  description?: string | null;
  attachment?: AttachmentMeta | null;
  userId?: string;
  room?: string;
}

interface LeaveQueuePayload {
  queueType?: QueueType;
  entryId?: string;
  userId?: string;
  room?: string;
}

interface FollowQuestionPayload {
  entryId?: string;
  userId?: string;
  name?: string;
  room?: string;
}

interface PushBackPayload {
  queueType?: QueueType;
  entryId?: string;
  userId?: string;
  room?: string;
}

interface TAQueuePayload {
  queueType?: QueueSelection;
  room?: string;
}

interface TASpecificPayload extends TAQueuePayload {
  entryId?: string;
}

interface RegisterUserPayload {
  room?: string;
}

interface AuthenticatedSession {
  id: string;
  userId: string;
  email: string;
  displayName: string | null;
  role: DBRole;
  expiresAt: string;
}

interface AuthRequestOtpBody {
  email?: string;
  role?: DBRole;
}

interface AuthVerifyOtpBody {
  email?: string;
  code?: string;
  displayName?: string | null;
}

interface ClaimRoomBody {
  room?: string;
  masterPassword?: string;
  newPassword?: string | null;
}

interface RoomAuthBody {
  room?: string;
  password?: string;
}

interface UserRoomEntry {
  room: string;
  queueType: QueueType;
  entry: QueueEntry;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_FILE = path.join(__dirname, 'queue_data.json');
const DIST_PATH = path.join(__dirname, '..', 'dist');
const MASTER_PASSWORD = process.env.TA_PASSWORD ?? 'ece297ta';
const PORT = Number(process.env.PORT ?? 3001);
const OTP_EXPIRY_MINUTES = Number(process.env.OTP_EXPIRY_MINUTES ?? 10);
const SESSION_EXPIRY_DAYS = Number(process.env.SESSION_EXPIRY_DAYS ?? 14);
const COURSE_NAME = process.env.COURSE_NAME ?? 'ECE1724 Queue';
const APP_BASE_URL = process.env.APP_BASE_URL ?? `http://localhost:${PORT}`;
const TA_EMAIL_ALLOWLIST = (process.env.TA_EMAIL_ALLOWLIST ?? '')
  .split(',')
  .map((email) => email.trim().toLowerCase())
  .filter(Boolean);

const app = express();
app.use(cors());
app.use(express.json());
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024,
  },
});

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

let rooms = new Map<string, RoomData>();
let isSaving = false;
let saveScheduled = false;

const userSockets = new Map<string, Set<string>>();

const touchRoomRecord = (roomName: string, password: string | null = null, isActive = true): void => {
  upsertRoomRecord({
    name: roomName,
    password,
    isActive,
  });
};

const createEmptyRoom = (): RoomData => ({
  marking: [],
  question: [],
  password: null,
});

const isQueueType = (value: unknown): value is QueueType =>
  value === 'marking' || value === 'question';

const isQueueSelection = (value: unknown): value is QueueSelection =>
  value === 'marking' || value === 'question' || value === 'combined';

const isWaitingLike = (status: EntryStatus): boolean =>
  status === 'waiting' || status === 'called';

const normalizeFollower = (value: unknown): Follower | null => {
  if (!value || typeof value !== 'object') return null;
  const userId = typeof (value as { userId?: unknown }).userId === 'string'
    ? (value as { userId: string }).userId
    : null;
  const name = typeof (value as { name?: unknown }).name === 'string'
    ? (value as { name: string }).name
    : null;

  if (!userId || !name) return null;
  return { userId, name };
};

const normalizeMarkingEntry = (value: unknown): MarkingEntry | null => {
  if (!value || typeof value !== 'object') return null;
  const entry = value as Partial<MarkingEntry>;

  if (
    typeof entry.id !== 'string' ||
    typeof entry.name !== 'string' ||
    typeof entry.studentId !== 'string' ||
    typeof entry.joinedAt !== 'string' ||
    typeof entry.userId !== 'string'
  ) {
    return null;
  }

  const status: EntryStatus =
    entry.status === 'called' || entry.status === 'assisting' ? entry.status : 'waiting';

  const attachmentValue = (entry as { attachment?: unknown }).attachment;
  const attachment =
    attachmentValue &&
    typeof attachmentValue === 'object' &&
    typeof (attachmentValue as AttachmentMeta).id === 'string' &&
    typeof (attachmentValue as AttachmentMeta).fileName === 'string' &&
    typeof (attachmentValue as AttachmentMeta).contentType === 'string' &&
    typeof (attachmentValue as AttachmentMeta).sizeBytes === 'number' &&
    typeof (attachmentValue as AttachmentMeta).downloadUrl === 'string'
      ? (attachmentValue as AttachmentMeta)
      : null;

  return {
    id: entry.id,
    name: entry.name,
    studentId: entry.studentId,
    email: typeof entry.email === 'string' ? entry.email : null,
    joinedAt: entry.joinedAt,
    userId: entry.userId,
    status,
    attachment,
  };
};

const normalizeQuestionEntry = (value: unknown): QuestionEntry | null => {
  if (!value || typeof value !== 'object') return null;
  const entry = value as Partial<QuestionEntry>;

  if (
    typeof entry.id !== 'string' ||
    typeof entry.name !== 'string' ||
    typeof entry.joinedAt !== 'string' ||
    typeof entry.userId !== 'string'
  ) {
    return null;
  }

  const status: EntryStatus =
    entry.status === 'called' || entry.status === 'assisting' ? entry.status : 'waiting';

  const attachmentValue = (entry as { attachment?: unknown }).attachment;
  const attachment =
    attachmentValue &&
    typeof attachmentValue === 'object' &&
    typeof (attachmentValue as AttachmentMeta).id === 'string' &&
    typeof (attachmentValue as AttachmentMeta).fileName === 'string' &&
    typeof (attachmentValue as AttachmentMeta).contentType === 'string' &&
    typeof (attachmentValue as AttachmentMeta).sizeBytes === 'number' &&
    typeof (attachmentValue as AttachmentMeta).downloadUrl === 'string'
      ? (attachmentValue as AttachmentMeta)
      : null;

  return {
    id: entry.id,
    name: entry.name,
    email: typeof entry.email === 'string' ? entry.email : null,
    description: typeof entry.description === 'string' ? entry.description : null,
    joinedAt: entry.joinedAt,
    userId: entry.userId,
    status,
    followers: Array.isArray(entry.followers)
      ? entry.followers.map(normalizeFollower).filter((follower): follower is Follower => follower !== null)
      : [],
    attachment,
  };
};

const normalizeRoom = (value: unknown): RoomData => {
  if (!value || typeof value !== 'object') return createEmptyRoom();

  const room = value as Partial<RoomData>;
  return {
    marking: Array.isArray(room.marking)
      ? room.marking.map(normalizeMarkingEntry).filter((entry): entry is MarkingEntry => entry !== null)
      : [],
    question: Array.isArray(room.question)
      ? room.question.map(normalizeQuestionEntry).filter((entry): entry is QuestionEntry => entry !== null)
      : [],
    password: typeof room.password === 'string' ? room.password : null,
  };
};

const saveQueues = (): void => {
  if (isSaving) {
    saveScheduled = true;
    return;
  }

  isSaving = true;
  const serialized = Object.fromEntries(rooms);
  const tempFile = `${DATA_FILE}.tmp`;

  fs.writeFile(tempFile, JSON.stringify(serialized, null, 2), (writeError) => {
    if (writeError) {
      console.error('Error writing temp queue data:', writeError);
      isSaving = false;
      return;
    }

    fs.rename(tempFile, DATA_FILE, (renameError) => {
      isSaving = false;

      if (renameError) {
        console.error('Error renaming queue data file:', renameError);
      }

      if (saveScheduled) {
        saveScheduled = false;
        saveQueues();
      }
    });
  });
};

const loadQueues = (): void => {
  try {
    if (!fs.existsSync(DATA_FILE)) return;

    const data = fs.readFileSync(DATA_FILE, 'utf8');
    const parsed = JSON.parse(data) as Record<string, unknown>;
    rooms = new Map(
      Object.entries(parsed).map(([roomName, roomData]) => [roomName, normalizeRoom(roomData)]),
    );
    console.log('Queue data loaded from disk.');
  } catch (error) {
    console.error('Error loading queue data:', error);
  }
};

const getRoom = (roomName: string): RoomData => {
  if (!rooms.has(roomName)) {
    rooms.set(roomName, createEmptyRoom());
    touchRoomRecord(roomName);
  }

  return rooms.get(roomName)!;
};

const registerUserSocket = (userId: string, socketId: string): void => {
  if (!userSockets.has(userId)) {
    userSockets.set(userId, new Set());
  }

  userSockets.get(userId)!.add(socketId);
};

const unregisterUserSocket = (userId: string, socketId: string): void => {
  const sockets = userSockets.get(userId);
  if (!sockets) return;

  sockets.delete(socketId);
  if (sockets.size === 0) {
    userSockets.delete(userId);
  }
};

const emitToUser = (userId: string, event: string, data: unknown): void => {
  const sockets = userSockets.get(userId);
  if (!sockets) return;

  sockets.forEach((socketId) => {
    io.to(socketId).emit(event, data);
  });
};

const findUserInAnyRoom = (userId: string): UserRoomEntry | null => {
  for (const [roomName, roomData] of rooms.entries()) {
    const markingEntry = roomData.marking.find((entry) => entry.userId === userId);
    if (markingEntry) {
      return { room: roomName, queueType: 'marking', entry: markingEntry };
    }

    const questionEntry = roomData.question.find((entry) => entry.userId === userId);
    if (questionEntry) {
      return { room: roomName, queueType: 'question', entry: questionEntry };
    }
  }

  return null;
};

const removeUserFromRoom = (userId: string, roomName: string): boolean => {
  const room = rooms.get(roomName);
  if (!room) return false;

  let removed = false;

  const markingIndex = room.marking.findIndex((entry) => entry.userId === userId);
  if (markingIndex !== -1) {
    room.marking.splice(markingIndex, 1);
    removed = true;
  }

  const questionIndex = room.question.findIndex((entry) => entry.userId === userId);
  if (questionIndex !== -1) {
    room.question.splice(questionIndex, 1);
    removed = true;
  }

  room.question.forEach((entry) => {
    const followerIndex = entry.followers.findIndex((follower) => follower.userId === userId);
    if (followerIndex !== -1) {
      entry.followers.splice(followerIndex, 1);
      removed = true;
    }
  });

  return removed;
};

const buildRoomList = (): RoomSummary[] =>
  Array.from(rooms.entries()).map(([name, data]) => ({
    name,
    markingCount: data.marking.length,
    questionCount: data.question.length,
    hasPassword: Boolean(data.password),
  }));

const broadcastRoomsList = (): void => {
  io.emit('rooms-list-update', buildRoomList());
};

const withPositions = <T extends QueueEntry>(queue: T[]): Array<T & { position: number }> => {
  let waitingCount = 0;

  return queue.map((entry) => {
    if (isWaitingLike(entry.status)) {
      waitingCount += 1;
      return { ...entry, position: waitingCount };
    }

    return { ...entry, position: 0 };
  });
};

const getActivePosition = (queue: QueueEntry[], entry: QueueEntry): number => {
  if (!isWaitingLike(entry.status)) return 0;
  return queue.filter((item) => isWaitingLike(item.status)).indexOf(entry) + 1;
};

const broadcastQueues = (roomName: string): void => {
  const room = rooms.get(roomName);
  if (!room) return;

  io.to(roomName).emit('queues-update', {
    marking: withPositions(room.marking),
    question: withPositions(room.question),
  });

  broadcastRoomsList();
};

const notifyUpcoming = (queueType: QueueType, position: number, userId: string): void => {
  if (queueType === 'question') return;
  if (position !== 1 && position !== 2) return;

  emitToUser(userId, 'turn-approaching', {
    queueType,
    position,
    message:
      position === 1
        ? "You're next! Please stay on the page."
        : 'Be prepared. Only one person is ahead of you.',
  });
};

const notifyNextStudents = (roomName: string, queueType: QueueType): void => {
  const room = rooms.get(roomName);
  if (!room) return;

  room[queueType]
    .filter((entry) => entry.status === 'waiting')
    .slice(0, 3)
    .forEach((entry, index) => {
      notifyUpcoming(queueType, index + 1, entry.userId);
    });
};

const pushBackInQueue = <T extends QueueEntry>(queue: T[], entryId: string): number | null => {
  const index = queue.findIndex((entry) => entry.id === entryId);
  if (index === -1 || queue[index]?.status !== 'waiting') return null;

  const item = queue[index];
  const newIndex = Math.min(index + 1, queue.length - 1);
  if (newIndex === index) return null;

  queue.splice(index, 1);
  queue.splice(newIndex, 0, item);

  if (newIndex > 0) {
    const previousEntry = queue[newIndex - 1];
    item.joinedAt = new Date(new Date(previousEntry.joinedAt).getTime() + 1000).toISOString();
  }

  return newIndex + 1;
};

const findEntry = (room: RoomData, queueType: QueueSelection, entryId: string): {
  entry: QueueEntry | null;
  realType: QueueType | null;
} => {
  if (queueType === 'combined') {
    const markingEntry = room.marking.find((entry) => entry.id === entryId);
    if (markingEntry) return { entry: markingEntry, realType: 'marking' };

    const questionEntry = room.question.find((entry) => entry.id === entryId);
    if (questionEntry) return { entry: questionEntry, realType: 'question' };

    return { entry: null, realType: null };
  }

  const entry = room[queueType].find((item) => item.id === entryId) ?? null;
  return { entry, realType: entry ? queueType : null };
};

const requireString = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() ? value.trim() : null;

const optionalString = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() ? value.trim() : null;

const getQueryString = (value: unknown): string | null => {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (Array.isArray(value) && typeof value[0] === 'string' && value[0].trim()) return value[0].trim();
  return null;
};

const normalizeEmail = (email: string): string => email.trim().toLowerCase();

const isUofTEmail = (email: string): boolean => {
  const normalized = normalizeEmail(email);
  return normalized.endsWith('@utoronto.ca') || normalized.endsWith('@mail.utoronto.ca');
};

const hashValue = (value: string): string =>
  createHash('sha256').update(value).digest('hex');

const generateOtpCode = (): string =>
  `${Math.floor(100000 + Math.random() * 900000)}`;

const generateSessionToken = (): string =>
  randomBytes(32).toString('hex');

const formatDisplayNameFromEmail = (email: string): string =>
  email
    .split('@')[0]
    .split(/[._-]+/)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ');

const getBearerToken = (req: Request): string | null => {
  const authorization = req.header('authorization');
  if (!authorization?.startsWith('Bearer ')) {
    return null;
  }

  const token = authorization.slice('Bearer '.length).trim();
  return token || null;
};

const toPublicSession = (session: AuthenticatedSession) => ({
  user: {
    userId: session.userId,
    email: session.email,
    displayName: session.displayName,
    role: session.role,
  },
  expiresAt: session.expiresAt,
});

const getRequestSession = (req: Request): AuthenticatedSession | null => {
  const token = getBearerToken(req);
  if (!token) {
    return null;
  }

  const session = getAuthSessionByTokenHash(hashValue(token));
  if (!session) {
    return null;
  }

  return {
    id: session.id,
    userId: session.userId,
    email: session.email,
    displayName: session.displayName,
    role: session.role,
    expiresAt: session.expiresAt,
  };
};

const requireRequestSession = (
  req: Request,
  res: Response,
  allowedRoles?: DBRole[],
): AuthenticatedSession | null => {
  const session = getRequestSession(req);
  if (!session) {
    res.status(401).json({ error: 'Authentication required' });
    return null;
  }

  if (allowedRoles && !allowedRoles.includes(session.role)) {
    res.status(403).json({ error: 'Insufficient permissions' });
    return null;
  }

  return session;
};

const getSocketSession = (socket: Socket): AuthenticatedSession | null =>
  (socket.data.authSession as AuthenticatedSession | undefined) ?? null;

const requireSocketSession = (
  socket: Socket,
  allowedRoles?: DBRole[],
): AuthenticatedSession | null => {
  const session = getSocketSession(socket);
  if (!session) {
    socket.emit('error', { message: 'Authentication required.' });
    return null;
  }

  if (allowedRoles && !allowedRoles.includes(session.role)) {
    socket.emit('error', { message: 'You do not have permission for this action.' });
    return null;
  }

  return session;
};

const resolveRoleForEmail = (email: string, requestedRole: DBRole): DBRole => {
  if (requestedRole === 'ta') {
    if (TA_EMAIL_ALLOWLIST.includes(normalizeEmail(email))) {
      return 'ta';
    }

    throw new Error('TA access is not enabled for this email.');
  }

  return 'student';
};

const sendTurnReadyEmail = async (
  roomName: string,
  queueType: QueueType,
  entry: QueueEntry,
): Promise<void> => {
  if (!entry.email) {
    return;
  }

  const emailContent = buildTurnReadyEmail({
    studentName: entry.name,
    courseName: COURSE_NAME,
    roomName,
    queueType,
    actionUrl: `${APP_BASE_URL}/?ta=${encodeURIComponent(roomName)}#student`,
  });

  try {
    await sendEmail({
      to: entry.email,
      subject: emailContent.subject,
      text: emailContent.text,
      html: emailContent.html,
    });
    recordQueueEvent({
      roomName,
      userId: entry.userId,
      entryId: entry.id,
      queueType,
      eventType: 'turn_email_sent',
      status: entry.status,
      payload: {
        email: entry.email,
        mailerMode: getMailerMode(),
      },
    });
  } catch (error) {
    console.error('Error sending turn-ready email:', error);
    recordQueueEvent({
      roomName,
      userId: entry.userId,
      entryId: entry.id,
      queueType,
      eventType: 'turn_email_failed',
      status: entry.status,
      payload: {
        email: entry.email,
        message: error instanceof Error ? error.message : 'unknown error',
      },
    });
  }
};

loadQueues();
syncRoomRecords(rooms.entries());

io.use((socket, next) => {
  const token = typeof socket.handshake.auth.token === 'string'
    ? socket.handshake.auth.token
    : null;

  if (!token) {
    next(new Error('Authentication required'));
    return;
  }

  const session = getAuthSessionByTokenHash(hashValue(token));
  if (!session) {
    next(new Error('Authentication required'));
    return;
  }

  socket.data.authSession = {
    id: session.id,
    userId: session.userId,
    email: session.email,
    displayName: session.displayName,
    role: session.role,
    expiresAt: session.expiresAt,
  } satisfies AuthenticatedSession;

  next();
});

io.on('connection', (socket: Socket) => {
  console.log(`Client connected: ${socket.id}`);

  const authSession = getSocketSession(socket);
  const currentUserId = authSession?.userId ?? null;

  if (currentUserId) {
    registerUserSocket(currentUserId, socket.id);
  }

  socket.on('register-user', (payload: RegisterUserPayload = {}) => {
    const session = requireSocketSession(socket);
    const room = requireString(payload.room);
    if (!room || !session) return;

    socket.join(room);
    upsertUserRecord({
      userId: session.userId,
      displayName: session.displayName,
      email: session.email,
      role: session.role,
      lastRoom: room,
    });
    console.log(`User ${session.userId} registered in room ${room}`);

    if (!rooms.has(room)) return;

    broadcastQueues(room);
    const roomData = rooms.get(room)!;

    const getEntryInfo = (queue: QueueEntry[]): RestoreEntryInfo | null => {
      const entry = queue.find((item) => item.userId === session.userId);
      if (!entry) return null;

      return {
        entryId: entry.id,
        position: getActivePosition(queue, entry),
        status: entry.status,
      };
    };

    socket.emit('restore-entries', {
      marking: getEntryInfo(roomData.marking),
      question: getEntryInfo(roomData.question),
    });
  });

  socket.on('join-marking', (payload: JoinMarkingPayload = {}) => {
    const session = requireSocketSession(socket, ['student']);
    const roomName = requireString(payload.room);
    const name = requireString(payload.name) ?? session?.displayName ?? null;
    const studentId = requireString(payload.studentId);
    if (!roomName || !session || !name || !studentId) return;

    const room = getRoom(roomName);
    touchRoomRecord(roomName, room.password);

    if (room.marking.some((entry) => entry.userId === session.userId)) {
      socket.emit('error', { message: 'You are already in the marking queue.' });
      return;
    }

    const otherRoomEntry = findUserInAnyRoom(session.userId);
    if (otherRoomEntry && otherRoomEntry.room !== roomName) {
      socket.emit('error', {
        message: `You are already in a queue in room "${otherRoomEntry.room}". Please leave that queue first before joining another room.`,
        existingRoom: otherRoomEntry.room,
        existingQueueType: otherRoomEntry.queueType,
      });
      return;
    }

    const entry: MarkingEntry = {
      id: uuidv4(),
      name,
      studentId,
      email: session.email,
      joinedAt: new Date().toISOString(),
      userId: session.userId,
      status: 'waiting',
      attachment: payload.attachment ?? null,
    };

    room.marking.push(entry);
    upsertUserRecord({
      userId: session.userId,
      displayName: name,
      email: entry.email,
      lastRoom: roomName,
      role: session.role,
    });
    recordQueueEvent({
      roomName,
      userId: session.userId,
      entryId: entry.id,
      queueType: 'marking',
      eventType: 'joined',
      status: entry.status,
      payload: {
        name,
        studentId,
        attachmentId: entry.attachment?.id ?? null,
      },
    });
    saveQueues();
    broadcastQueues(roomName);

    const joinedPayload: JoinedQueuePayload = {
      queueType: 'marking',
      position: room.marking.length,
      entryId: entry.id,
    };

    emitToUser(session.userId, 'joined-queue', joinedPayload);
  });

  socket.on('join-question', (payload: JoinQuestionPayload = {}) => {
    const session = requireSocketSession(socket, ['student']);
    const roomName = requireString(payload.room);
    const name = requireString(payload.name) ?? session?.displayName ?? null;
    if (!roomName || !session || !name) return;

    const room = getRoom(roomName);
    touchRoomRecord(roomName, room.password);

    if (room.question.some((entry) => entry.userId === session.userId)) {
      socket.emit('error', { message: 'You are already in the question queue.' });
      return;
    }

    const otherRoomEntry = findUserInAnyRoom(session.userId);
    if (otherRoomEntry && otherRoomEntry.room !== roomName) {
      socket.emit('error', {
        message: `You are already in a queue in room "${otherRoomEntry.room}". Please leave that queue first before joining another room.`,
        existingRoom: otherRoomEntry.room,
        existingQueueType: otherRoomEntry.queueType,
      });
      return;
    }

    const entry: QuestionEntry = {
      id: uuidv4(),
      name,
      email: session.email,
      description: optionalString(payload.description),
      joinedAt: new Date().toISOString(),
      userId: session.userId,
      status: 'waiting',
      followers: [],
      attachment: payload.attachment ?? null,
    };

    room.question.push(entry);
    upsertUserRecord({
      userId: session.userId,
      displayName: name,
      email: entry.email,
      lastRoom: roomName,
      role: session.role,
    });
    recordQueueEvent({
      roomName,
      userId: session.userId,
      entryId: entry.id,
      queueType: 'question',
      eventType: 'joined',
      status: entry.status,
      payload: {
        name,
        description: entry.description,
        attachmentId: entry.attachment?.id ?? null,
      },
    });
    saveQueues();
    broadcastQueues(roomName);

    emitToUser(session.userId, 'joined-queue', {
      queueType: 'question',
      position: room.question.length,
      entryId: entry.id,
    } satisfies JoinedQueuePayload);
  });

  socket.on('leave-queue', (payload: LeaveQueuePayload = {}) => {
    const session = requireSocketSession(socket, ['student']);
    const roomName = requireString(payload.room);
    const entryId = requireString(payload.entryId);
    if (!roomName || !entryId || !session || !isQueueType(payload.queueType)) return;

    const room = getRoom(roomName);
    const queue = room[payload.queueType];
    const index = queue.findIndex((entry) => entry.id === entryId);
    if (index === -1) return;

    if (queue[index]?.userId !== session.userId) {
      socket.emit('error', { message: 'You can only leave your own queue entry.' });
      return;
    }

    const [removedEntry] = queue.splice(index, 1);
    recordQueueEvent({
      roomName,
      userId: session.userId,
      entryId,
      queueType: payload.queueType,
      eventType: 'left',
      status: removedEntry.status,
    });
    saveQueues();
    emitToUser(session.userId, 'left-queue', { queueType: payload.queueType, entryId });
    broadcastQueues(roomName);
    notifyNextStudents(roomName, payload.queueType);
  });

  socket.on('follow-question', (payload: FollowQuestionPayload = {}) => {
    const session = requireSocketSession(socket, ['student']);
    const roomName = requireString(payload.room);
    const entryId = requireString(payload.entryId);
    const name = requireString(payload.name) ?? session?.displayName ?? formatDisplayNameFromEmail(session?.email ?? '');
    if (!roomName || !entryId || !session || !name) return;

    const otherRoomEntry = findUserInAnyRoom(session.userId);
    if (otherRoomEntry && otherRoomEntry.room !== roomName) {
      socket.emit('error', {
        message: `You cannot follow questions while in a queue in room "${otherRoomEntry.room}". Please leave that queue first.`,
        existingRoom: otherRoomEntry.room,
        existingQueueType: otherRoomEntry.queueType,
      });
      return;
    }

    const room = getRoom(roomName);
    const entry = room.question.find((item) => item.id === entryId);
    if (!entry || entry.userId === session.userId || entry.followers.some((follower) => follower.userId === session.userId)) {
      socket.emit('error', { message: 'Cannot follow question.' });
      return;
    }

    entry.followers.push({ userId: session.userId, name });
    upsertUserRecord({
      userId: session.userId,
      displayName: name,
      email: session.email,
      lastRoom: roomName,
      role: session.role,
    });
    recordQueueEvent({
      roomName,
      userId: session.userId,
      entryId,
      queueType: 'question',
      eventType: 'followed',
      status: entry.status,
    });
    saveQueues();
    broadcastQueues(roomName);
    emitToUser(session.userId, 'following-question', { entryId });
  });

  socket.on('unfollow-question', (payload: FollowQuestionPayload = {}) => {
    const session = requireSocketSession(socket, ['student']);
    const roomName = requireString(payload.room);
    const entryId = requireString(payload.entryId);
    if (!roomName || !entryId || !session) return;

    const room = getRoom(roomName);
    const entry = room.question.find((item) => item.id === entryId);
    if (!entry) return;

    const followerIndex = entry.followers.findIndex((follower) => follower.userId === session.userId);
    if (followerIndex === -1) return;

    entry.followers.splice(followerIndex, 1);
    recordQueueEvent({
      roomName,
      userId: session.userId,
      entryId,
      queueType: 'question',
      eventType: 'unfollowed',
      status: entry.status,
    });
    saveQueues();
    broadcastQueues(roomName);
    emitToUser(session.userId, 'unfollowed-question', { entryId });
  });

  socket.on('push-back', (payload: PushBackPayload = {}) => {
    const session = requireSocketSession(socket, ['student']);
    const roomName = requireString(payload.room);
    const entryId = requireString(payload.entryId);
    if (!roomName || !entryId || !session || !isQueueType(payload.queueType)) return;

    const room = getRoom(roomName);
    const currentEntry = room[payload.queueType].find((entry) => entry.id === entryId);
    if (!currentEntry || currentEntry.userId !== session.userId) {
      socket.emit('error', { message: 'You can only push back your own entry.' });
      return;
    }

    const newPosition =
      payload.queueType === 'marking'
        ? pushBackInQueue(room.marking, entryId)
        : pushBackInQueue(room.question, entryId);
    if (!newPosition) return;

    recordQueueEvent({
      roomName,
      userId: session.userId,
      entryId,
      queueType: payload.queueType,
      eventType: 'pushed_back',
      status: 'waiting',
      payload: { position: newPosition },
    });
    saveQueues();
    broadcastQueues(roomName);
    emitToUser(session.userId, 'pushed-back', { queueType: payload.queueType, position: newPosition });
  });

  socket.on('ta-checkin', async (payload: TAQueuePayload = {}) => {
    const session = requireSocketSession(socket, ['ta']);
    const roomName = requireString(payload.room);
    if (!roomName || !session || !isQueueSelection(payload.queueType)) {
      socket.emit('error', { message: 'Invalid queue type' });
      return;
    }

    const room = getRoom(roomName);
    upsertUserRecord({
      userId: session.userId,
      displayName: session.displayName ?? `TA ${roomName}`,
      email: session.email,
      lastRoom: roomName,
      role: 'ta',
    });
    let selectedType: QueueType | null = payload.queueType === 'combined' ? null : payload.queueType;
    let entry: QueueEntry | null = null;

    if (payload.queueType === 'combined') {
      const markingTop = room.marking.find((item) => item.status === 'waiting') ?? null;
      const questionTop = room.question.find((item) => item.status === 'waiting') ?? null;

      if (markingTop && questionTop) {
        if (new Date(markingTop.joinedAt) <= new Date(questionTop.joinedAt)) {
          entry = markingTop;
          selectedType = 'marking';
        } else {
          entry = questionTop;
          selectedType = 'question';
        }
      } else if (markingTop) {
        entry = markingTop;
        selectedType = 'marking';
      } else if (questionTop) {
        entry = questionTop;
        selectedType = 'question';
      }
    } else {
      entry = room[payload.queueType].find((item) => item.status === 'waiting') ?? null;
    }

    if (!entry || !selectedType) return;

    entry.status = 'called';
    recordQueueEvent({
      roomName,
      userId: entry.userId,
      entryId: entry.id,
      queueType: selectedType,
      eventType: 'called',
      status: entry.status,
    });
    saveQueues();
    emitToUser(entry.userId, 'being-called', {
      queueType: selectedType,
      message: 'You are called. Please raise your hand.',
    });
    await sendTurnReadyEmail(roomName, selectedType, entry);

    if (selectedType === 'question' && 'followers' in entry) {
      entry.followers.forEach((follower) => {
        emitToUser(follower.userId, 'being-called', {
          queueType: 'question',
          message: 'A question you follow is being answered!',
        });
      });
    }

    broadcastQueues(roomName);
  });

  socket.on('ta-call-specific', async (payload: TASpecificPayload = {}) => {
    const session = requireSocketSession(socket, ['ta']);
    const roomName = requireString(payload.room);
    const entryId = requireString(payload.entryId);
    if (!roomName || !entryId || !session || !isQueueSelection(payload.queueType)) return;

    const room = getRoom(roomName);
    const { entry, realType } = findEntry(room, payload.queueType, entryId);
    if (!entry || !realType) return;

    entry.status = 'called';
    recordQueueEvent({
      roomName,
      userId: entry.userId,
      entryId: entry.id,
      queueType: realType,
      eventType: 'called',
      status: entry.status,
    });
    saveQueues();
    emitToUser(entry.userId, 'being-called', {
      queueType: realType,
      message: 'TA will be with you shortly.',
    });
    await sendTurnReadyEmail(roomName, realType, entry);

    if (realType === 'question' && 'followers' in entry) {
      entry.followers.forEach((follower) => {
        emitToUser(follower.userId, 'being-called', {
          queueType: 'question',
          message: 'A question you follow is being answered!',
        });
      });
    }

    broadcastQueues(roomName);
  });

  socket.on('ta-cancel-call', (payload: TASpecificPayload = {}) => {
    if (!requireSocketSession(socket, ['ta'])) return;
    const roomName = requireString(payload.room);
    const entryId = requireString(payload.entryId);
    if (!roomName || !entryId || !isQueueSelection(payload.queueType)) return;

    const room = getRoom(roomName);
    const { entry, realType } = findEntry(room, payload.queueType, entryId);
    if (!entry || !realType || entry.status !== 'called') return;

    entry.status = 'waiting';
    recordQueueEvent({
      roomName,
      userId: entry.userId,
      entryId: entry.id,
      queueType: realType,
      eventType: 'call_cancelled',
      status: entry.status,
    });
    saveQueues();
    emitToUser(entry.userId, 'pushed-back', {
      queueType: realType,
      position: getActivePosition(room[realType], entry),
    });
    broadcastQueues(roomName);
  });

  socket.on('ta-start-assisting', (payload: TASpecificPayload = {}) => {
    if (!requireSocketSession(socket, ['ta'])) return;
    const roomName = requireString(payload.room);
    const entryId = requireString(payload.entryId);
    if (!roomName || !entryId || !isQueueSelection(payload.queueType)) return;

    const room = getRoom(roomName);
    const { entry, realType } = findEntry(room, payload.queueType, entryId);
    if (!entry || !realType) return;

    entry.status = 'assisting';
    recordQueueEvent({
      roomName,
      userId: entry.userId,
      entryId: entry.id,
      queueType: realType,
      eventType: 'assisting_started',
      status: entry.status,
    });
    saveQueues();
    emitToUser(entry.userId, 'assisting-started', {
      queueType: realType,
      message: 'The TA has started assisting you.',
    });
    broadcastQueues(roomName);
  });

  socket.on('ta-next', (payload: TAQueuePayload = {}) => {
    if (!requireSocketSession(socket, ['ta'])) return;
    const roomName = requireString(payload.room);
    if (!roomName || !isQueueSelection(payload.queueType)) return;

    const room = getRoom(roomName);
    const queueTypes: QueueType[] =
      payload.queueType === 'combined' ? ['marking', 'question'] : [payload.queueType];

    let changed = false;

    queueTypes.forEach((queueType) => {
      const assistingEntries = room[queueType].filter((entry) => entry.status === 'assisting');
      if (assistingEntries.length === 0) return;

      changed = true;
      if (queueType === 'marking') {
        room.marking = room.marking.filter((entry) => entry.status !== 'assisting');
      } else {
        room.question = room.question.filter((entry) => entry.status !== 'assisting');
      }

      assistingEntries.forEach((entry) => {
        recordQueueEvent({
          roomName,
          userId: entry.userId,
          entryId: entry.id,
          queueType,
          eventType: 'assistance_finished',
          status: 'assisting',
        });
        if (queueType === 'marking') {
          emitToUser(entry.userId, 'finished-assisting', {
            queueType,
            message: 'Session finished.',
          });
        }
      });

      if (queueType === 'marking') {
        notifyNextStudents(roomName, queueType);
      }
    });

    if (!changed) return;

    saveQueues();
    broadcastQueues(roomName);
  });

  socket.on('ta-remove', (payload: TASpecificPayload = {}) => {
    if (!requireSocketSession(socket, ['ta'])) return;
    const roomName = requireString(payload.room);
    const entryId = requireString(payload.entryId);
    if (!roomName || !entryId || !isQueueType(payload.queueType)) return;

    const room = getRoom(roomName);
    const queue = room[payload.queueType];
    const index = queue.findIndex((entry) => entry.id === entryId);
    if (index === -1) return;

    const [removed] = queue.splice(index, 1);
    recordQueueEvent({
      roomName,
      userId: removed.userId,
      entryId: removed.id,
      queueType: payload.queueType,
      eventType: 'removed',
      status: removed.status,
    });
    saveQueues();
    emitToUser(removed.userId, 'removed-from-queue', {
      queueType: payload.queueType,
      message: 'You have been removed.',
    });
    broadcastQueues(roomName);
  });

  socket.on('ta-clear-all', (payload: { room?: string } = {}) => {
    if (!requireSocketSession(socket, ['ta'])) return;
    const roomName = requireString(payload.room);
    if (!roomName) return;

    const room = getRoom(roomName);
    const clearedEntries = [...room.marking, ...room.question];
    room.marking = [];
    room.question = [];
    clearedEntries.forEach((entry) => {
      recordQueueEvent({
        roomName,
        userId: entry.userId,
        entryId: entry.id,
        queueType: 'studentId' in entry ? 'marking' : 'question',
        eventType: 'queue_cleared',
        status: entry.status,
      });
    });
    saveQueues();
    broadcastQueues(roomName);
    io.to(roomName).emit('removed-from-queue', { message: 'Queue reset by TA.' });
  });

  socket.on('ta-delete-room', (payload: { room?: string } = {}) => {
    if (!requireSocketSession(socket, ['ta'])) return;
    const roomName = requireString(payload.room);
    if (!roomName || !rooms.has(roomName)) return;

    recordQueueEvent({
      roomName,
      eventType: 'room_deleted',
    });
    rooms.delete(roomName);
    markRoomInactive(roomName);
    saveQueues();
    io.to(roomName).emit('room-deleted', { message: 'This room has been closed by the TA.' });
    io.in(roomName).socketsLeave(roomName);
    console.log(`Room ${roomName} deleted by TA`);
    broadcastRoomsList();
  });

  socket.on('disconnect', () => {
    if (currentUserId) {
      unregisterUserSocket(currentUserId, socket.id);
    }
  });
});

app.post('/api/auth/request-otp', async (req: Request<unknown, unknown, AuthRequestOtpBody>, res: Response) => {
  const email = requireString(req.body.email);
  const requestedRole = req.body.role === 'ta' ? 'ta' : 'student';

  if (!email) {
    res.status(400).json({ error: 'Email is required' });
    return;
  }

  const normalizedEmail = normalizeEmail(email);
  if (!isUofTEmail(normalizedEmail)) {
    res.status(400).json({ error: 'Use a UofT email address' });
    return;
  }

  let assignedRole: DBRole;
  try {
    assignedRole = resolveRoleForEmail(normalizedEmail, requestedRole);
  } catch (error) {
    res.status(403).json({
      error: error instanceof Error ? error.message : 'TA access is not available for this email',
    });
    return;
  }

  const code = generateOtpCode();
  const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60_000).toISOString();

  createOtpRecord({
    email: normalizedEmail,
    role: assignedRole,
    otpHash: hashValue(code),
    expiresAt,
  });

  const emailContent = buildOtpEmail({
    code,
    email: normalizedEmail,
    role: assignedRole,
    expiresInMinutes: OTP_EXPIRY_MINUTES,
  });

  try {
    await sendEmail({
      to: normalizedEmail,
      subject: emailContent.subject,
      text: emailContent.text,
      html: emailContent.html,
    });
  } catch (error) {
    console.error('Error sending OTP email:', error);
    res.status(500).json({ error: 'Failed to send OTP email' });
    return;
  }

  recordQueueEvent({
    roomName: '__auth__',
    userId: normalizedEmail,
    eventType: 'otp_requested',
    payload: {
      role: assignedRole,
      expiresAt,
      mailerMode: getMailerMode(),
    },
  });

  res.json({
    success: true,
    role: assignedRole,
    expiresInMinutes: OTP_EXPIRY_MINUTES,
  });
});

app.post('/api/auth/verify-otp', (req: Request<unknown, unknown, AuthVerifyOtpBody>, res: Response) => {
  const email = requireString(req.body.email);
  const code = requireString(req.body.code);

  if (!email || !code) {
    res.status(400).json({ error: 'Email and OTP are required' });
    return;
  }

  const normalizedEmail = normalizeEmail(email);
  const otpRecord = consumeOtpRecord(normalizedEmail, hashValue(code));
  if (!otpRecord) {
    res.status(401).json({ error: 'Invalid or expired OTP' });
    return;
  }

  const existingUser = findUserByEmail(normalizedEmail);
  const userId = existingUser?.userId ?? uuidv4();
  const displayName =
    requireString(req.body.displayName) ??
    existingUser?.displayName ??
    formatDisplayNameFromEmail(normalizedEmail);

  upsertUserRecord({
    userId,
    displayName,
    email: normalizedEmail,
    role: otpRecord.role,
  });

  const token = generateSessionToken();
  const expiresAt = new Date(Date.now() + SESSION_EXPIRY_DAYS * 24 * 60 * 60_000).toISOString();

  createAuthSession({
    id: uuidv4(),
    userId,
    email: normalizedEmail,
    displayName,
    role: otpRecord.role,
    tokenHash: hashValue(token),
    expiresAt,
  });

  recordQueueEvent({
    roomName: '__auth__',
    userId,
    eventType: 'otp_verified',
    payload: {
      email: normalizedEmail,
      role: otpRecord.role,
    },
  });

  res.json({
    success: true,
    token,
    session: {
      user: {
        userId,
        email: normalizedEmail,
        displayName,
        role: otpRecord.role,
      },
      expiresAt,
    },
  });
});

app.get('/api/auth/session', (req: Request, res: Response) => {
  const session = requireRequestSession(req, res);
  if (!session) {
    return;
  }

  res.json({
    success: true,
    session: toPublicSession(session),
  });
});

app.post('/api/auth/logout', (req: Request, res: Response) => {
  const token = getBearerToken(req);
  if (!token) {
    res.status(204).end();
    return;
  }

  revokeAuthSession(hashValue(token));
  res.status(204).end();
});

app.get('/api/rooms', (_req: Request, res: Response) => {
  try {
    res.json(buildRoomList());
  } catch (error) {
    console.error('Error in /api/rooms:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.post('/api/attachments/upload', upload.single('file'), async (req: Request, res: Response) => {
  const session = requireRequestSession(req, res, ['student', 'ta']);
  if (!session) {
    return;
  }

  const room = requireString(req.body.room);
  const queueType = requireString(req.body.queueType);
  const file = req.file;

  if (!room || !file || !isQueueType(queueType)) {
    res.status(400).json({ error: 'room, queueType, and file are required' });
    return;
  }

  try {
    const attachmentId = uuidv4();
    const stored = await storeAttachment({
      attachmentId,
      originalName: file.originalname,
      contentType: file.mimetype || 'application/octet-stream',
      buffer: file.buffer,
    });

    createAttachmentRecord({
      id: attachmentId,
      roomName: room,
      userId: session.userId,
      queueType,
      fileName: file.originalname,
      contentType: file.mimetype || 'application/octet-stream',
      sizeBytes: file.size,
      storageKey: stored.storageKey,
    });

    upsertUserRecord({
      userId: session.userId,
      displayName: session.displayName,
      email: session.email,
      lastRoom: room,
      role: session.role,
    });
    touchRoomRecord(room);
    recordQueueEvent({
      roomName: room,
      userId: session.userId,
      queueType,
      eventType: 'attachment_uploaded',
      payload: {
        attachmentId,
        fileName: file.originalname,
        storageMode: getStorageMode(),
      },
    });

    res.json({
      id: attachmentId,
      fileName: file.originalname,
      contentType: file.mimetype || 'application/octet-stream',
      sizeBytes: file.size,
      downloadUrl: `/api/attachments/${attachmentId}/download`,
    } satisfies AttachmentMeta);
  } catch (error) {
    console.error('Error in /api/attachments/upload:', error);
    res.status(500).json({ error: 'Attachment upload failed' });
  }
});

app.get('/api/attachments/:attachmentId/download', async (req: Request<{ attachmentId: string }>, res: Response) => {
  // No auth required — attachment IDs are unguessable UUIDs.
  // Browser <img src> and <a href> cannot send Bearer tokens,
  // so this endpoint must be public for previews and downloads to work.
  const attachment = getAttachmentRecord(req.params.attachmentId);
  if (!attachment) {
    res.status(404).json({ error: 'Attachment not found' });
    return;
  }

  try {
    const fileBuffer = await loadAttachment({
      storageKey: attachment.storageKey,
    });

    res.setHeader('Content-Type', attachment.contentType);
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${attachment.fileName.replace(/"/g, '\\"')}"`,
    );
    res.send(fileBuffer);
  } catch (error) {
    console.error('Error in /api/attachments/:attachmentId/download:', error);
    res.status(500).json({ error: 'Attachment download failed' });
  }
});

app.get('/api/room-status', (req: Request, res: Response) => {
  const room = getQueryString(req.query.room);
  if (!room) {
    res.status(400).json({ error: 'Room required' });
    return;
  }

  if (rooms.has(room)) {
    res.json({ exists: true, hasPassword: Boolean(rooms.get(room)?.password) });
    return;
  }

  res.json({ exists: false, hasPassword: false });
});

app.post('/api/claim-room', (req: Request<Record<string, never>, unknown, ClaimRoomBody>, res: Response) => {
  const session = requireRequestSession(req, res, ['ta']);
  if (!session) {
    return;
  }

  const room = requireString(req.body.room);
  const masterPassword = requireString(req.body.masterPassword);

  if (!room || !masterPassword) {
    res.status(400).json({ success: false, message: 'Room and master password are required' });
    return;
  }

  if (masterPassword !== MASTER_PASSWORD) {
    res.status(401).json({ success: false, message: 'Incorrect Master Password' });
    return;
  }

  const roomData = getRoom(room);
  roomData.password = optionalString(req.body.newPassword);
  touchRoomRecord(room, roomData.password);
  recordQueueEvent({
    roomName: room,
    userId: session.userId,
    eventType: 'room_claimed',
    payload: {
      hasPassword: Boolean(roomData.password),
    },
  });
  saveQueues();
  res.json({ success: true });
});

app.post('/api/room-auth', (req: Request<Record<string, never>, unknown, RoomAuthBody>, res: Response) => {
  const session = requireRequestSession(req, res, ['ta']);
  if (!session) {
    return;
  }

  const room = requireString(req.body.room);
  const password = requireString(req.body.password);
  if (!room || !password) {
    res.status(400).json({ success: false, message: 'Room and password are required' });
    return;
  }

  const roomData = rooms.get(room);
  if (!roomData) {
    res.status(404).json({ success: false, message: 'Room not found' });
    return;
  }

  if (roomData.password && roomData.password === password) {
    res.json({ success: true, room, userId: session.userId });
    return;
  }

  res.status(401).json({ success: false, message: 'Incorrect room password' });
});

app.get('/api/user-status', (req: Request, res: Response) => {
  const session = requireRequestSession(req, res, ['student', 'ta']);
  if (!session) {
    return;
  }

  const existingEntry = findUserInAnyRoom(session.userId);
  if (!existingEntry) {
    res.json({ inQueue: false });
    return;
  }

  res.json({
    inQueue: true,
    room: existingEntry.room,
    queueType: existingEntry.queueType,
    entryId: existingEntry.entry.id,
    status: existingEntry.entry.status,
  });
});

app.get('/api/room-analytics', (req: Request, res: Response) => {
  const session = requireRequestSession(req, res, ['ta']);
  if (!session) {
    return;
  }

  const room = getQueryString(req.query.room);
  if (!room) {
    res.status(400).json({ error: 'Room required' });
    return;
  }

  try {
    res.json(getRoomAnalytics(room));
  } catch (error) {
    console.error('Error in /api/room-analytics:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

if (fs.existsSync(DIST_PATH)) {
  console.log('Serving static files from:', DIST_PATH);
  app.use(express.static(DIST_PATH));

  app.get('*', (req: Request, res: Response) => {
    if (req.path.startsWith('/api/') || req.path.startsWith('/socket.io/')) {
      res.status(404).json({ error: 'Not found' });
      return;
    }

    res.sendFile(path.join(DIST_PATH, 'index.html'));
  });
} else {
  console.log('No dist folder found. Run "npm run build" to generate frontend files.');
  console.log('Expected path:', DIST_PATH);
}

httpServer.listen(PORT, () => {
  console.log(`Queue server running on port ${PORT}`);
  if (fs.existsSync(DIST_PATH)) {
    console.log(`Frontend available at http://localhost:${PORT}`);
  }
});

// Shared type definitions for the queue application

export type QueueType = 'marking' | 'question';
export type CombinedQueueType = QueueType | 'combined';
export type EntryStatus = 'waiting' | 'called' | 'assisting';
export type AuthRole = 'student' | 'ta';

export interface AuthUser {
  userId: string;
  email: string;
  displayName: string | null;
  role: AuthRole;
}

export interface AuthSession {
  token: string;
  user: AuthUser;
  expiresAt: string;
}

export interface Follower {
  userId: string;
  name: string;
}

export interface AttachmentMeta {
  id: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  downloadUrl: string;
}

export interface QueueEntry {
  id: string;
  name: string;
  studentId?: string;
  email?: string;
  userId: string;
  joinedAt: string;
  status: EntryStatus;
  description?: string;
  followers?: Follower[];
  attachment?: AttachmentMeta | null;
  position: number;
  type?: QueueType; // Present in combined queue view
}

export interface Queues {
  marking: QueueEntry[];
  question: QueueEntry[];
}

export interface MyEntryInfo {
  entryId: string;
  position: number;
  status: EntryStatus;
}

export interface MyEntries {
  marking: MyEntryInfo | null;
  question: MyEntryInfo | null;
}

export interface RoomInfo {
  name: string;
  markingCount: number;
  questionCount: number;
}

export interface Toast {
  id: number;
  title: string;
  message: string;
  type: 'success' | 'warning' | 'error' | 'info';
  exiting?: boolean;
}

export interface TurnAlert {
  message: string;
  queueType: QueueType;
}

export interface JoinData {
  name: string;
  studentId: string;
  email: string;
  description: string;
  attachment?: AttachmentMeta | null;
}

export interface UserData {
  [key: string]: unknown;
  updatedAt?: number;
}

// Socket event payloads
export interface JoinedQueuePayload {
  queueType: QueueType;
  entryId: string;
  position: number;
}

export interface LeftQueuePayload {
  queueType: QueueType;
}

export interface TurnApproachingPayload {
  message: string;
  queueType: QueueType;
}

export interface BeingCalledPayload {
  message: string;
  queueType: QueueType;
}

export interface PushedBackPayload {
  position: number;
}

export interface FinishedAssistingPayload {
  message: string;
}

export interface RemovedFromQueuePayload {
  message: string;
  queueType: QueueType;
}

export interface RoomDeletedPayload {
  message: string;
}

export interface ErrorPayload {
  message: string;
}

export interface RestoreEntriesPayload {
  marking: MyEntryInfo | null;
  question: MyEntryInfo | null;
}

export type NotificationPermissionStatus = 'granted' | 'denied' | 'default' | 'unsupported';

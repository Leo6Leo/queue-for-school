# API Overview

This project uses:

- REST for room metadata, auth, analytics, and file handling
- Socket.IO for live queue operations and state updates

Base URLs in local development:

- Frontend: `http://127.0.0.1:5173`
- Backend: `http://127.0.0.1:3001`

## REST Endpoints

### `GET /api/rooms`

Returns active room summaries.

Response:

```json
[
  {
    "name": "SF101",
    "markingCount": 3,
    "questionCount": 5,
    "hasPassword": true
  }
]
```

### `GET /api/room-status?room=<room>`

Checks whether a room exists and whether it is password protected.

### `POST /api/claim-room`

Creates or claims a room.

Request body:

```json
{
  "room": "SF101",
  "masterPassword": "ece297ta",
  "newPassword": "room-secret"
}
```

### `POST /api/room-auth`

Authenticates a TA into an existing room.

Request body:

```json
{
  "room": "SF101",
  "password": "room-secret"
}
```

### `GET /api/user-status?userId=<userId>`

Returns whether a user is already in any room queue.

### `GET /api/room-analytics?room=<room>`

Returns SQLite-backed queue event counts and recent room activity.

### `POST /api/attachments/upload`

Multipart upload endpoint for queue attachments.

Form fields:

- `room`
- `userId`
- `queueType`
- `file`

Response:

```json
{
  "id": "attachment-id",
  "fileName": "error.png",
  "contentType": "image/png",
  "sizeBytes": 102400,
  "downloadUrl": "/api/attachments/attachment-id/download"
}
```

### `GET /api/attachments/:attachmentId/download`

Downloads a previously uploaded attachment.

## Socket.IO Events

### Client to Server

- `register-user`
- `join-marking`
- `join-question`
- `leave-queue`
- `follow-question`
- `unfollow-question`
- `push-back`
- `ta-checkin`
- `ta-call-specific`
- `ta-cancel-call`
- `ta-start-assisting`
- `ta-next`
- `ta-remove`
- `ta-clear-all`
- `ta-delete-room`

### Server to Client

- `queues-update`
- `rooms-list-update`
- `restore-entries`
- `joined-queue`
- `left-queue`
- `turn-approaching`
- `being-called`
- `pushed-back`
- `assisting-started`
- `finished-assisting`
- `removed-from-queue`
- `room-deleted`
- `error`

## Storage Notes

- Live queue state remains in memory for responsiveness.
- SQLite persists room records, users, queue events, and attachment metadata.
- Attachment files use S3-compatible storage when the `S3_*` environment variables are configured.
- In local development, attachments fall back to `server/uploads/`.

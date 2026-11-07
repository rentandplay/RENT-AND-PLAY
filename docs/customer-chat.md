# Customer rental support

Customer Android: chat button above the main navigation → Ask a question → general inquiry or an owned rental. Existing conversations are reused. Staff can reply in the web **Messages** page or Android **Customer inbox**. Conversations may be resolved and reopened; customer follow-up automatically reopens them. Closing a conversation preserves history.

## Deployment

1. Apply `infrastructure/chat-schema.sql` in Supabase SQL Editor after the existing base schema. It adds four RLS-enabled tables, indexed bounded queries and one backend-only RPC. It is safe to re-run. Do this before deploying the backend.
2. Rotate the legacy Supabase service-role credential previously embedded in Android's `mobile_api_service.dart`. Removing it from source does not invalidate previously distributed apps or Git history. Update only backend secret configuration; never include the replacement in a client build. Profile photo uploads now go through the authenticated backend instead of using a privileged client key.
3. Build the web app, deploy the backend and distribute the updated Android app with its existing Firebase/FCM configuration. Android dependencies include `shared_preferences` for local drafts. Verify both clients point to the same backend.
4. Check a customer→staff→customer exchange on two devices, notifications with the app backgrounded, reconnect after an interrupted send, and denial when customer B requests customer A's thread.

Setup verified on 2026-11-08: the chat migration is applied to the production Supabase project; the exact legacy credential previously embedded in Android returns HTTP 401, and the existing server-only secret key successfully calls the chat RPC. Backend configuration prefers SUPABASE_SECRET_KEY and does not send that opaque key as a JWT. The retired local service-role variable has been removed. Deployment status is recorded after release verification.

## Reliability and privacy

- The backend derives sender identity and customer ownership from verified Firebase tokens or staff sessions. Every thread read, write, history request and read receipt checks access. Customers cannot open another customer's rental. Both Owner and Operator roles share the staff inbox and its read cursor.
- Thread creation is deterministic per customer plus rental (or general inquiry). Optimistic transactions serialize sequence numbers, summary counters, messages, idempotency records and notification outbox entries. The Supabase adapter now preserves nonexistent-document preconditions as well as existing versions, preventing concurrent thread/key creation races across instances.
- A 128-bit client request key is reused for uncertain retries. A duplicate returns the original saved message. Reusing that key for different content or another thread returns 409. Only a committed message is shown as Sent; Read means the recipient side has advanced its read cursor, not that a push notification arrived.
- Read cursors never move backwards or beyond an existing message. Incoming counts exclude the viewer's own sends. Clients advance read receipts while the conversation is foregrounded near its latest messages. Staff receipts represent the team, not an individual agent.
- Messages are plain text up to 2,000 characters. React/Flutter render text without HTML execution. There are no arbitrary file uploads, message edits or history deletion. Chat never approves rentals, changes prices, extends rentals or confirms payments; those actions remain in the existing rental workflow.
- Database-backed limits: 20 customer sends/minute, 60 staff sends/minute, 5 new conversations/minute per customer. Retry duplicates do not consume limits. Push previews contain generic text; durable inbox alerts and push outbox entries are created atomically with the message. FCM uses the existing retry/lease and device-token cleanup pipeline.
- Foreground message sync polls every 4 seconds, inboxes every 7 seconds. This works across backend instances without an in-memory event bus. Polling pauses when the conversation is hidden/backgrounded. Reconnection requests messages after the last received sequence; catch-up pages drain in order. History uses 50-message keyset pages, inboxes 30-thread pages, with filtering and limits executed in PostgreSQL.
- Android stores account-scoped local drafts and pending retry keys before sending; web uses account-scoped session storage. Local draft storage is best effort, not a delivery acknowledgement or a background offline queue. After a failure the user explicitly retries. Clearing app/browser data removes unsent drafts; committed server history remains available.

## API

All endpoints require authentication and an active supported account. Staff temporary passwords must be changed first. Responses disable caching; mutations use the existing origin checks.

| Method | Route | Behavior |
| --- | --- | --- |
| GET | `/api/chat/threads?before=sort_key&status=OPEN` | Caller-scoped inbox, unread counts and next cursor |
| POST | `/api/chat/threads` | Customer creates/reuses thread, optional `{rentalId}` |
| GET | `/api/chat/threads/:id/messages` | Latest page in ascending display order |
| GET | `/api/chat/threads/:id/messages?before=sequence` | Earlier history |
| GET | `/api/chat/threads/:id/messages?after=sequence` | Ordered reconnect catch-up |
| POST | `/api/chat/threads/:id/messages` | `{text, requestKey}`; 201 new / 200 duplicate |
| POST | `/api/chat/threads/:id/read` | `{through: sequence}`; monotonic read cursor |
| PATCH | `/api/chat/threads/:id/status` | Staff only, `{status: OPEN or RESOLVED}` |
| POST | `/api/mobile/profile/photo` | Bearer auth; PNG/JPEG data URL up to 2 MB; server owns upload path |

No production migration, device push delivery, or multi-instance load test is implied by local test results. Monitor API latency/error rates, pending/failed notification outbox entries and database size in deployment. Conversation retention needs a business policy before adding automated deletion.

## Research behind the approach

- [OWASP WebSocket Security](https://cheatsheetseries.owasp.org/cheatsheets/WebSocket_Security_Cheat_Sheet.html): authenticate, authorize each operation, validate content and limit abuse. The same checks apply to this HTTP-based chat.
- [Socket.IO delivery guarantees](https://socket.io/docs/v4/delivery-guarantees/): realtime transport alone does not give durable delivery; use persisted identifiers, acknowledgement, retries and offsets. We implement those at the application/database layer and use bounded polling as transport.
- [Supabase data security](https://supabase.com/docs/guides/database/secure-data): keep privileged credentials server-side. Chat tables enable RLS and the query RPC is service-role only because this project authenticates clients using Firebase.
- [Firebase message lifetime](https://firebase.google.com/docs/cloud-messaging/customize-messages/setting-message-lifespan) and [token management](https://firebase.google.com/docs/cloud-messaging/manage-tokens): push is an alerting channel, not the message history or proof of reading.

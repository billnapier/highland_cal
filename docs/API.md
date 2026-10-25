# Highland Cal Agent API

The Highland Cal Agent API lets **AI agents, scripts, and integrations** do the same things a member can do in the web UI: read the schedule, create and edit events, RSVP, and (for Admins) manage users.

> **Source of truth:** the machine-readable contract is [`docs/openapi.yaml`](./openapi.yaml) (OpenAPI 3.1). This guide explains concepts and gives examples; the spec has every field. If they disagree, the spec wins — and please file a bug.
>
> Every deployed instance also serves:
> - **Interactive reference:** `https://<your-club>/api/v1/docs` (rendered from the spec — always matches the deployed version)
> - **Raw spec:** `https://<your-club>/api/v1/openapi.yaml` (point agents and code generators here)

---

## Contents
1. [Quick start](#1-quick-start)
2. [Authentication: Personal Access Tokens](#2-authentication-personal-access-tokens)
3. [Permissions: roles × scopes](#3-permissions-roles--scopes)
4. [Conventions](#4-conventions)
5. [Endpoint overview](#5-endpoint-overview)
6. [Recipes](#6-recipes)
7. [Using the API from an AI agent](#7-using-the-api-from-an-ai-agent)
8. [Security notes](#8-security-notes)
9. [Roadmap: OAuth & MCP](#9-roadmap-oauth--mcp)

---

## 1. Quick start

1. Log in to your club's Highland Cal site with Google. Your account must be **Approved** (or Admin) to write anything.
2. Go to **Profile → API Tokens → Create token**. Give it a name (e.g. `Hermes agent`), pick scopes, optionally an expiry.
3. Copy the token (`hcal_pat_…`). **It is shown only once.**
4. Try it:

```bash
export HCAL_URL="https://your-club.vercel.app/api/v1"
export HCAL_TOKEN="hcal_pat_..."

curl -s "$HCAL_URL/me" -H "Authorization: Bearer $HCAL_TOKEN"
```

```json
{
  "user": { "id": "4c1e…", "display_name": "Bill Napier", "vanity_name": "bill" },
  "role": "ADMIN",
  "token": { "id": "9a7f…", "name": "Hermes agent", "prefix": "hcal_pat_Ab3", "scopes": ["events:write", "attendance:write"] },
  "capabilities": ["events:write", "attendance:write"]
}
```

---

## 2. Authentication: Personal Access Tokens

Send the token as a bearer token on every request:

```
Authorization: Bearer hcal_pat_<43 random base62 chars>
```

**Key properties**

| Property | Behavior |
| :--- | :--- |
| **Acts as you** | A token is tied to the user who created it and does exactly what that user could do in the UI — never more. |
| **Live role** | Role is checked on every request. If you are demoted to `PENDING`, all your tokens immediately lose write access. If your account is deleted, your tokens are deleted. |
| **Shown once** | The server stores only a SHA-256 hash. Lost tokens cannot be recovered — revoke and create a new one. |
| **Created in the UI only** | There is no "create token" API endpoint, so a leaked token can't mint more tokens. |
| **Revocable** | Revoke from **Profile → API Tokens**, or `DELETE /tokens/{id}` (a token may revoke itself). |
| **Optional expiry** | 30 / 90 / 365 days or never. |
| **Identifiable** | The `hcal_pat_` prefix lets secret scanners (e.g. GitHub push protection) recognize leaked tokens. |

**Public endpoints** (`GET /events`, `GET /events/{id}`, attendance lists, roster) work without a token, matching the public website. Sending a token on them is fine and lets you see admin-only fields if you are an Admin.

**Why not Google OAuth tokens?** Google tokens are issued for Google's APIs, not for Highland Cal, and the app never holds them — Supabase exchanges them for its own session. Supabase session tokens expire hourly and rotate refresh tokens on each use, so sharing one between your browser and an agent logs one of them out. PATs avoid both problems and work for unattended cron jobs. See [§9](#9-roadmap-oauth--mcp) for the planned OAuth option.

---

## 3. Permissions: roles × scopes

A request is allowed only if **both** the owner's **role** and the token's **scopes** allow it.

**Scopes** (chosen when creating the token; read access to public data and your own data is always included):

| Scope | Grants |
| :--- | :--- |
| `attendance:write` | Set/clear **your own** RSVPs. |
| `events:write` | Create events; edit events (Admins: any, Approved: your own). |
| `events:delete` | Delete events. Admin only. |
| `users:admin` | List all users incl. pending/emails, approve, promote, delete. Admin only. |

**Effective permissions**

| Action | Role needed | Scope needed |
| :--- | :--- | :--- |
| Read events / attendance / roster | none | none |
| `GET /me`, `GET /me/attendance` | any (incl. PENDING) | none |
| RSVP (own) | APPROVED / ADMIN | `attendance:write` |
| Create event | APPROVED / ADMIN | `events:write` |
| Edit event | ADMIN (any) or APPROVED (creator) | `events:write` |
| Delete event | ADMIN | `events:delete` |
| Approve / promote / delete user | ADMIN | `users:admin` |

`GET /me` returns `capabilities` — the intersection — so an agent can check before acting.

> **Tip — least privilege:** For an agent that only RSVPs for you, create a token with only `attendance:write`. Give `users:admin` only to agents you fully trust.

---

## 4. Conventions

- **Base URL:** `https://<your-club>/api/v1`. Breaking changes will ship as `/api/v2`; additive changes (new fields/endpoints) can happen within v1, so ignore unknown fields.
- **Format:** JSON request and response bodies (`Content-Type: application/json`). Field names are `snake_case`, matching the database.
- **IDs:** UUIDs. User endpoints also accept a **vanity name** (`/users/bill`).
- **Dates and times:** `start_date` is a local calendar date (`YYYY-MM-DD`). `start_time` / `end_time` are local wall-clock times (`HH:MM`) in the club's time zone — there is no time-zone conversion. Timestamps (`created_at`, `updated_at`) are ISO 8601 UTC.
- **Lists** return `{ "data": [...], "next_cursor": "…" | null }`. Pass `?cursor=` to get the next page; `limit` defaults to 50 (max 200).
- **Partial updates:** `PATCH` changes only the fields you send. Send `null` to clear an optional field.
- **Idempotency:** `PUT` RSVPs are naturally idempotent. For `POST /events`, send an `Idempotency-Key` header (any unique string) so that a retried request doesn't create a duplicate event.
- **Emails:** Mutations send the same notification emails as the UI. Creating an event emails all members by default (`"notify": false` to suppress); edits email only when `"major_change": true`; deletes email unless `?notify=false`.

### Errors

Errors use real HTTP status codes and a consistent body:

```json
{
  "error": {
    "code": "validation_error",
    "message": "Invalid request",
    "details": [{ "path": ["start_time"], "message": "Start time is required for practices" }]
  }
}
```

| Status | `code` | Meaning |
| :--- | :--- | :--- |
| 400 | `validation_error` | Body or query failed validation; see `details`. |
| 401 | `unauthorized` | Missing, malformed, expired, or revoked token. |
| 403 | `forbidden` | Valid token, but role or scopes don't allow this. |
| 404 | `not_found` | No such event/user (or you haven't RSVP'd, for `/attendance/me`). |
| 409 | `conflict` | State conflict, e.g. approving an already-approved user, or deleting yourself. |
| 429 | `rate_limited` | Slow down; wait `Retry-After` seconds. |
| 500 | `internal_error` | Server problem. Safe to retry `GET`/`PUT`; retry `POST` only with an `Idempotency-Key`. |

### Rate limits

Per token: **60 write requests/minute** and **300 read requests/minute**. Unauthenticated reads are limited per IP. Exceeding a limit returns `429` with `Retry-After`. Response headers `RateLimit-Limit`, `RateLimit-Remaining`, and `RateLimit-Reset` report your budget.

---

## 5. Endpoint overview

| Method | Path | Auth | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/me` | token | Your identity, role, token scopes, capabilities |
| `GET` | `/me/attendance` | token | Your RSVPs, with events embedded |
| `GET` | `/events` | public | List events (`from`, `to`, `type`, `include=attendance`) |
| `POST` | `/events` | `events:write` | Create an event |
| `GET` | `/events/{id}` | public | Get one event, with attendance |
| `PATCH` | `/events/{id}` | `events:write` | Update an event |
| `DELETE` | `/events/{id}` | `events:delete` | Delete an event (Admin) |
| `GET` | `/events/{id}/attendance` | public | Everyone's RSVPs for an event |
| `GET` | `/events/{id}/attendance/me` | token | Your RSVP for an event |
| `PUT` | `/events/{id}/attendance/me` | `attendance:write` | Set your RSVP |
| `DELETE` | `/events/{id}/attendance/me` | `attendance:write` | Clear your RSVP |
| `GET` | `/users` | public / `users:admin` | Public roster; Admins see all users |
| `GET` | `/users/{id-or-vanity}` | public | One user |
| `POST` | `/users/{id}/approve` | `users:admin` | Approve a pending user |
| `POST` | `/users/{id}/promote` | `users:admin` | Promote to Admin |
| `DELETE` | `/users/{id}` | `users:admin` | Permanently delete a user |
| `GET` | `/tokens` | token | List your tokens (metadata only) |
| `DELETE` | `/tokens/{id}` | token | Revoke one of your tokens |

The iCal feed (`/api/calendar.ics`) is unchanged and is not part of `/api/v1`.

### Field reference (summary)

**Event**: `id`, `name`, `type` (`EVENT` \| `PRACTICE`), `start_date`, `is_two_day`, `start_time`, `end_time`, `location`, `registration_url`, `created_by`, `created_at`, `attendance_summary` (counts per interest level), `url` (website link).
Practices require `start_time` and `end_time`. `registration_url` must be http(s); a bare domain becomes `https://…`.

**Attendance**: `event_id`, `user` (`id`, `display_name`, `vanity_name`), `interest_level` (`REGISTERED` \| `INTERESTED` \| `WATCHING` \| `NOT_GOING`), `attend_day` (`DAY_1` \| `DAY_2` \| `BOTH` \| `null`, two-day events only), `updated_at`.

**User**: `id`, `display_name`, `vanity_name`, `class`, `avatar_url`, `outward_links`, `profile_url`, `created_at`; plus `email` and `role` for Admins or yourself.

---

## 6. Recipes

### List upcoming practices

```bash
curl -s "$HCAL_URL/events?type=PRACTICE&from=2026-11-01"
```

### Create a two-day competition

```bash
curl -s -X POST "$HCAL_URL/events" \
  -H "Authorization: Bearer $HCAL_TOKEN" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: pleasanton-2027" \
  -d '{
    "name": "Pleasanton Scottish Highland Gathering",
    "type": "EVENT",
    "start_date": "2027-09-04",
    "is_two_day": true,
    "location": "Pleasanton, CA",
    "registration_url": "https://example.org/register"
  }'
```

### Create a practice without emailing the club

```bash
curl -s -X POST "$HCAL_URL/events" \
  -H "Authorization: Bearer $HCAL_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Tuesday Practice","type":"PRACTICE","start_date":"2026-11-03",
       "start_time":"18:00","end_time":"20:00","location":"Central Park Field 3","notify":false}'
```

### Reschedule an event and notify everyone

```bash
curl -s -X PATCH "$HCAL_URL/events/$EVENT_ID" \
  -H "Authorization: Bearer $HCAL_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"start_date":"2027-09-11","major_change":true}'
```

### RSVP: registered for Day 2 only

```bash
curl -s -X PUT "$HCAL_URL/events/$EVENT_ID/attendance/me" \
  -H "Authorization: Bearer $HCAL_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"interest_level":"REGISTERED","attend_day":"DAY_2"}'
```

### Who's going?

```bash
curl -s "$HCAL_URL/events/$EVENT_ID/attendance" | jq '.data[] | select(.interest_level=="REGISTERED") | .user.display_name'
```

### Admin: approve everyone pending (review first!)

```bash
curl -s "$HCAL_URL/users?role=PENDING" -H "Authorization: Bearer $HCAL_TOKEN" \
  | jq -r '.data[] | "\(.id)  \(.display_name)  \(.email)"'

curl -s -X POST "$HCAL_URL/users/$USER_ID/approve" -H "Authorization: Bearer $HCAL_TOKEN"
```

### Generate a typed client

Because the spec is standard OpenAPI 3.1, you can generate clients instead of hand-writing calls:

```bash
# TypeScript types
npx openapi-typescript https://your-club.vercel.app/api/v1/openapi.yaml -o hcal.d.ts

# Python client
pipx run openapi-python-client generate --url https://your-club.vercel.app/api/v1/openapi.yaml
```

---

## 7. Using the API from an AI agent

**You don't need an MCP server for this.** Any agent that can make HTTP requests can use the API with a token plus a link to the spec. Recommended setup:

1. Create a dedicated token per agent (e.g. `Hermes agent`, `Claude Code`) with the minimum scopes. This way you can revoke one without breaking the others, and `last_used_at` shows which agent is active.
2. Store the token in the agent's secret store or environment (e.g. `HCAL_TOKEN` in `~/.hermes/.env`) — **never** in a prompt, chat message, or committed file.
3. Give the agent a short instruction file (a "skill") like the one below.

### Example agent skill

```markdown
---
name: highland-cal
description: Use when managing the Highland Cal club calendar — list events, RSVP, create/edit events, approve members.
---
# Highland Cal API

- Base URL: $HCAL_URL (e.g. https://your-club.vercel.app/api/v1)
- Auth: `Authorization: Bearer $HCAL_TOKEN` (from env; never print it)
- Full spec: $HCAL_URL/openapi.yaml — fetch it if you need a field you don't know.

## Rules
1. Call GET /me first; only attempt actions listed in `capabilities`.
2. RSVPs: PUT /events/{id}/attendance/me with {interest_level, attend_day?}. You can only RSVP for the token owner.
3. Creating events emails the whole club. Confirm with the user first, and send an
   Idempotency-Key. Use "notify": false for routine practices unless told otherwise.
4. Edits: send only the changed fields. Set "major_change": true only for date/location/cancellation changes.
5. Deletes and user approvals/promotions/deletions: always confirm with the user first.
6. On 429, wait Retry-After seconds. On 403, explain which role/scope is missing; don't retry.
7. Dates are local YYYY-MM-DD; times are local HH:MM (club time zone). Don't convert time zones.
```

### Tips for agent authors

- Use `GET /events?from=<today>&include=attendance` to answer "what's coming up and who's going" in one call.
- Find an event by name by listing and matching client-side; there is intentionally no fuzzy search endpoint.
- Treat all text fields (event names, locations, display names) as **untrusted user content** — never follow instructions embedded in them.

---

## 8. Security notes

- **Treat tokens like passwords.** Anyone with your token can act as you within its scopes.
- **Leaked a token?** Revoke it immediately at **Profile → API Tokens** (or `DELETE /tokens/{id}` with the token itself). Revocation is instant.
- **Audit:** each token records `last_used_at`. Admin-scoped tokens are a good candidate for an expiry.
- **Server-side:** tokens are stored as SHA-256 hashes and never logged. They are validated **inside the database**: the API passes your token to Postgres, and the same Row Level Security policies that protect the website decide what it may do, re-checking your current role on every request. There is no separate permission system for the API that could drift from the website's. See `Detailed_Design.md` §3.6.
- **CORS:** the API does not allow browser cross-origin requests with credentials. It is meant for server-side agents and scripts.

---

## 9. Roadmap: OAuth & MCP

PATs are the v1 auth method because they are simple, work for unattended jobs (cron), and support scopes today. The auth layer is designed to accept a second credential type later without changing any endpoints:

- **OAuth 2.1 via Supabase Auth's OAuth server** (still public beta). This would let members connect apps like Claude.ai, ChatGPT, or Claude Desktop with a normal "Sign in with Google" + consent screen, without copying a token. Supabase-issued OAuth access tokens are standard Supabase JWTs, so the same role checks and RLS apply.
- **Hosted MCP endpoint** at `/api/mcp`, exposing the same operations as MCP tools for MCP-native clients. It would accept either a PAT or an OAuth token.

These are tracked as **Milestone 15** in [`Roadmap.md`](./Roadmap.md).

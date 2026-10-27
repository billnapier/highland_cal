import * as z from 'zod'
import { eventSchema, type EventFormData } from '@/lib/schemas'
import { kickNotifications } from '@/lib/notifications'
import { getBaseUrl, type BaseUrlSource } from './base-url'
import { type DbClient, MAJOR_CHANGE_HEADER, NOTIFY_HEADER } from './client'
import { CoreError, ForbiddenError, NotFoundError, ValidationError, fromPostgrestError } from './errors'

/**
 * Event operations shared by Server Actions and the Agent API.
 *
 * Authorization is RLS on `db` (see the agent_api_foundation migration).
 * Nothing here checks roles: a denied INSERT raises 42501, a denied
 * UPDATE/DELETE affects zero rows, and both become ForbiddenError.
 */

export const EVENT_COLUMNS =
  'id, name, start_date, is_two_day, type, start_time, end_time, location, registration_url, created_by, created_at'

export interface EventRow {
  id: string
  name: string
  start_date: string
  is_two_day: boolean
  type: 'EVENT' | 'PRACTICE'
  start_time: string | null
  end_time: string | null
  location: string | null
  registration_url: string | null
  created_by: string | null
  created_at: string
}

function parseEvent(raw: unknown): EventFormData {
  const parsed = eventSchema.safeParse(raw)
  if (!parsed.success) {
    throw new ValidationError('Invalid data', z.flattenError(parsed.error))
  }
  return parsed.data
}

function toPayload(data: EventFormData) {
  return {
    name: data.name,
    start_date: data.start_date,
    is_two_day: data.is_two_day,
    type: data.type,
    start_time: data.start_time || null,
    end_time: data.end_time || null,
    location: data.location || null,
    registration_url: data.registration_url || null,
  }
}

/**
 * When an UPDATE/DELETE matched no rows, tell "doesn't exist" from "RLS
 * filtered it out". Events are publicly readable, so a visible row means the
 * write was denied.
 */
async function deniedOrMissing(db: DbClient, eventId: string, forbidden: string): Promise<CoreError> {
  const { data, error } = await db.from('games').select('id').eq('id', eventId).maybeSingle()
  if (error) return fromPostgrestError(error, 'Failed to load event')
  return data ? new ForbiddenError(forbidden) : new NotFoundError('Event not found')
}

export interface CreateEventOptions {
  /** `false` suppresses the "New Event" email (API `notify: false`). */
  notify?: boolean
}

export async function createEvent(
  db: DbClient,
  actorId: string,
  raw: unknown,
  { notify = true }: CreateEventOptions = {},
): Promise<EventRow> {
  const data = parseEvent(raw)

  let query = db
    .from('games')
    .insert({ ...toPayload(data), created_by: actorId })
    .select(EVENT_COLUMNS)
  if (!notify) query = query.setHeader(NOTIFY_HEADER, 'false')

  const { data: row, error } = await query.single()
  if (error) {
    console.error('Error creating event:', error)
    if (error.code === '42501') {
      throw new ForbiddenError('Forbidden: You do not have permission to create events')
    }
    throw fromPostgrestError(error, 'Failed to create event. Please try again later.')
  }

  // The insert trigger enqueued the "New Event" email in the same transaction.
  if (notify) kickNotifications()
  return row as EventRow
}

export interface UpdateEventOptions {
  /** Email approved members about the change. */
  majorChange?: boolean
  /**
   * Snapshot of the row as last read by the caller (e.g. the API's merge-
   * then-validate PATCH). When set, the UPDATE only applies if every listed
   * column still matches — optimistic concurrency without a dedicated
   * version column, so two concurrent PATCHes against stale snapshots can't
   * silently stomp each other's unrelated field changes.
   */
  expectedRow?: Partial<EventRow>
}

export async function updateEvent(
  db: DbClient,
  eventId: string,
  raw: unknown,
  { majorChange = false, expectedRow }: UpdateEventOptions = {},
): Promise<EventRow> {
  const data = parseEvent(raw)

  let query = db.from('games').update(toPayload(data)).eq('id', eventId)
  if (expectedRow) {
    for (const [key, value] of Object.entries(expectedRow)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      query = (value === null ? (query as any).is(key, value) : (query as any).eq(key, value))
    }
  }
  let selectQuery = query.select(EVENT_COLUMNS)
  if (majorChange) selectQuery = selectQuery.setHeader(MAJOR_CHANGE_HEADER, 'true')

  const { data: rows, error } = await selectQuery
  if (error) {
    console.error('Error updating event:', error)
    throw fromPostgrestError(error, 'Failed to update event. Please try again later.')
  }
  if (!rows || rows.length === 0) {
    if (expectedRow) {
      // Zero rows with a snapshot match condition means either: the event
      // is gone/RLS-hidden, RLS denied the write outright, or someone else
      // changed it between our read and this write (a real race, not a
      // permission problem) — tell those apart before raising.
      const { data: nowRow, error: nowError } = await db
        .from('games')
        .select(EVENT_COLUMNS)
        .eq('id', eventId)
        .maybeSingle()
      if (nowError) throw fromPostgrestError(nowError, 'Failed to update event')
      if (!nowRow) throw new NotFoundError('Event not found')
      const stillMatchesSnapshot = Object.entries(expectedRow).every(
        ([key, value]) => (nowRow as Record<string, unknown>)[key] === value,
      )
      if (stillMatchesSnapshot) {
        throw new ForbiddenError('Forbidden: You do not have permission to edit this event')
      }
      throw new CoreError('conflict', 'Event was modified by someone else since you last read it; refetch and retry')
    }
    throw await deniedOrMissing(db, eventId, 'Forbidden: You do not have permission to edit this event')
  }

  if (majorChange) kickNotifications()
  return rows[0] as EventRow
}

export interface DeleteEventOptions {
  /** `false` suppresses the "Event Canceled" email (API `?notify=false`). */
  notify?: boolean
}

export async function deleteEvent(
  db: DbClient,
  eventId: string,
  { notify = true }: DeleteEventOptions = {},
): Promise<void> {
  let query = db.from('games').delete().eq('id', eventId).select('id')
  if (!notify) query = query.setHeader(NOTIFY_HEADER, 'false')

  const { data: rows, error } = await query
  if (error) {
    console.error('Error deleting event:', error)
    throw fromPostgrestError(error, 'Failed to delete event')
  }
  if (!rows || rows.length === 0) {
    throw await deniedOrMissing(db, eventId, 'Forbidden: Only admins can delete events')
  }

  // The delete trigger enqueued the "Event Canceled" email.
  if (notify) kickNotifications()
}

/**
 * Build the public URL for an event on the website.
 */
export function eventUrl(eventId: string, baseUrl: string = getBaseUrl()): string {
  return `${baseUrl}/events/${eventId}`
}

/**
 * Add computed `url` field to an event row.
 * Used by API route handlers to fulfil the Event schema contract.
 * `source` is the incoming request, used to derive the base URL.
 */
export function addEventUrl<T extends { id: string }>(event: T, source?: BaseUrlSource): T & { url: string } {
  return { ...event, url: eventUrl(event.id, getBaseUrl(source)) }
}

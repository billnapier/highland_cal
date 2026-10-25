import { eventSchema, type EventFormData } from '@/lib/schemas'
import { kickNotifications } from '@/lib/notifications'
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
    throw new ValidationError('Invalid data', parsed.error.flatten())
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
  if (error) return fromPostgrestError(error)
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
}

export async function updateEvent(
  db: DbClient,
  eventId: string,
  raw: unknown,
  { majorChange = false }: UpdateEventOptions = {},
): Promise<EventRow> {
  const data = parseEvent(raw)

  let query = db.from('games').update(toPayload(data)).eq('id', eventId).select(EVENT_COLUMNS)
  if (majorChange) query = query.setHeader(MAJOR_CHANGE_HEADER, 'true')

  const { data: rows, error } = await query
  if (error) {
    console.error('Error updating event:', error)
    throw fromPostgrestError(error, 'Failed to update event. Please try again later.')
  }
  if (!rows || rows.length === 0) {
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

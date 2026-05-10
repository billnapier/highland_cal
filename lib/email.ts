import { Resend } from 'resend'
import { createClient } from '@/lib/supabase/server'
import NewRegistrationEmail from '@/emails/NewRegistrationEmail'
import UserApprovedEmail from '@/emails/UserApprovedEmail'
import EventNotificationEmail from '@/emails/EventNotificationEmail'

const resend = new Resend(process.env.RESEND_API_KEY)

const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || 'Highland Cal'
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || `${APP_NAME} <onboarding@resend.dev>`

// Fetch emails for users with specific roles
async function getEmailsByRoles(roles: string[]): Promise<string[]> {
  const supabase = await createClient()

  // To get the emails we need to join Profiles and User_Roles
  const { data, error } = await supabase
    .from('profiles')
    .select('email, user_roles!inner(role)')
    .in('user_roles.role', roles)

  if (error || !data) {
    console.error('Error fetching emails for roles:', roles, error)
    return []
  }

  return data
    .map((row: { email?: string | null }) => row.email)
    .filter((email): email is string => Boolean(email))
}

export async function sendNewRegistrationNotification(
  displayName: string,
  email: string
) {
  if (!process.env.RESEND_API_KEY) {
    console.log('Stub: sendNewRegistrationNotification', { displayName, email })
    return
  }

  try {
    const adminEmails = await getEmailsByRoles(['ADMIN'])

    if (adminEmails.length === 0) {
      console.log('No admins found to notify')
      return
    }

    await resend.emails.send({
      from: FROM_EMAIL,
      to: adminEmails,
      subject: 'New User Registration: ' + displayName,
      react: NewRegistrationEmail({ displayName, email }),
    })
  } catch (error) {
    console.error('Failed to send NewRegistrationNotification email', error)
  }
}

export async function sendUserApprovedNotification(
  displayName: string,
  email: string
) {
  if (!process.env.RESEND_API_KEY) {
    console.log('Stub: sendUserApprovedNotification', { displayName, email })
    return
  }

  try {
    const dashboardUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/dashboard`

    await resend.emails.send({
      from: FROM_EMAIL,
      to: email,
      subject: 'Your Highland Cal account has been approved!',
      react: UserApprovedEmail({ displayName, dashboardUrl }),
    })
  } catch (error) {
    console.error('Failed to send UserApprovedNotification email', error)
  }
}

export async function sendEventNotification(
  type: 'CREATE' | 'UPDATE' | 'DELETE',
  eventDetails: {
    name: string
    startTimestamp?: string
    endTimestamp?: string
    location?: string
  }
) {
  if (!process.env.RESEND_API_KEY) {
    console.log('Stub: sendEventNotification', { type, eventDetails })
    return
  }

  try {
    const recipientEmails = await getEmailsByRoles(['APPROVED', 'ADMIN'])

    if (recipientEmails.length === 0) {
      console.log('No users found to notify about the event')
      return
    }

    let subject = ''
    if (type === 'CREATE') subject = `New Event: ${eventDetails.name}`
    if (type === 'UPDATE') subject = `Event Updated: ${eventDetails.name}`
    if (type === 'DELETE') subject = `Event Canceled: ${eventDetails.name}`

    const dashboardUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/dashboard`

    await resend.emails.send({
      from: FROM_EMAIL,
      to: process.env.INITIAL_ADMIN_EMAIL || recipientEmails[0],
      bcc: recipientEmails,
      subject,
      react: EventNotificationEmail({
        type,
        eventName: eventDetails.name,
        startTimestamp: eventDetails.startTimestamp,
        endTimestamp: eventDetails.endTimestamp,
        location: eventDetails.location,
        dashboardUrl,
      }),
    })
  } catch (error) {
    console.error('Failed to send EventNotification email', error)
  }
}

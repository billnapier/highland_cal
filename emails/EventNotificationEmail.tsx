import {
  Html,
  Body,
  Head,
  Heading,
  Container,
  Preview,
  Section,
  Text,
  Link,
} from '@react-email/components'
import { format } from 'date-fns'

interface EventNotificationEmailProps {
  actionType: 'CREATE' | 'UPDATE' | 'DELETE'
  eventName: string
  startDate?: string
  isTwoDay?: boolean
  eventType?: 'EVENT' | 'PRACTICE'
  startTime?: string | null
  endTime?: string | null
  location?: string
  registrationUrl?: string
  dashboardUrl: string
}

export default function EventNotificationEmail({
  actionType,
  eventName,
  startDate,
  isTwoDay,
  eventType,
  startTime,
  endTime,
  location,
  registrationUrl,
  dashboardUrl,
}: EventNotificationEmailProps) {
  let title = ''
  let previewText = ''
  let actionText = ''

  if (actionType === 'CREATE') {
    title = eventType === 'PRACTICE' ? 'New Practice Added' : 'New Event Added'
    previewText = `New ${eventType === 'PRACTICE' ? 'practice' : 'event'}: ${eventName}`
    actionText = `A new ${eventType === 'PRACTICE' ? 'practice' : 'event'} has been added to the calendar:`
  } else if (actionType === 'UPDATE') {
    title = eventType === 'PRACTICE' ? 'Practice Updated' : 'Event Updated'
    previewText = `${eventType === 'PRACTICE' ? 'Practice' : 'Event'} update: ${eventName}`
    actionText = `A${eventType === 'PRACTICE' ? ' practice' : 'n event'} has been updated:`
  } else if (actionType === 'DELETE') {
    title = eventType === 'PRACTICE' ? 'Practice Canceled' : 'Event Canceled'
    previewText = `${eventType === 'PRACTICE' ? 'Practice' : 'Event'} canceled: ${eventName}`
    actionText = `The following ${eventType === 'PRACTICE' ? 'practice' : 'event'} has been canceled/deleted:`
  }

  const renderDateString = () => {
    if (!startDate) return ''
    try {
      const start = new Date(startDate + 'T00:00:00')
      // adjust for local timezone offset if needed, or simply let format(..., 'PP') handle it 
      // since startDate is 'YYYY-MM-DD', new Date() parses as UTC midnight.
      // Actually we must format using utc helper or add 'T00:00:00' to avoid timezone shifts.
      // But preserving existing logic for now
      if (isNaN(start.getTime())) return startDate
      
      const startStr = format(start, 'PP')
      if (eventType === 'PRACTICE') {
        let timeStr = ''
        if (startTime) {
           // We can format "15:00" to "3:00 PM" if we want, or just leave it. Let's just output it directly.
           timeStr = ` from ${startTime}`
           if (endTime) timeStr += ` to ${endTime}`
        }
        return `${startStr}${timeStr}`
      }

      if (isTwoDay) {
        const end = new Date(start)
        end.setDate(end.getDate() + 1)
        return `${startStr} - ${format(end, 'PP')}`
      }
      return startStr
    } catch {
      return startDate
    }
  }

  return (
    <Html>
      <Head />
      <Preview>{previewText}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={h1}>{title}</Heading>
          <Text style={text}>{actionText}</Text>
          <Section style={details}>
            <Text style={text}>
              <strong>Event:</strong> {eventName}
            </Text>
            {actionType !== 'DELETE' && startDate && (
              <Text style={text}>
                <strong>Date:</strong> {renderDateString()}
              </Text>
            )}
            {actionType !== 'DELETE' && location && (
              <Text style={text}>
                <strong>Location:</strong> {location}
              </Text>
            )}
            {actionType !== 'DELETE' && registrationUrl && (
              <Text style={text}>
                <strong>Registration:</strong> <a href={registrationUrl}>{registrationUrl}</a>
              </Text>
            )}
          </Section>
          {actionType !== 'DELETE' && (
            <Text style={text}>
              <Link href={dashboardUrl} style={link}>
                View on Dashboard & RSVP
              </Link>
            </Text>
          )}
        </Container>
      </Body>
    </Html>
  )
}

const main = {
  backgroundColor: '#ffffff',
  fontFamily:
    '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Oxygen-Sans,Ubuntu,Cantarell,"Helvetica Neue",sans-serif',
}

const container = {
  margin: '0 auto',
  padding: '20px 0 48px',
  width: '580px',
}

const h1 = {
  fontSize: '24px',
  fontWeight: '600',
  lineHeight: '1.25',
  color: '#333',
  marginBottom: '24px',
}

const text = {
  fontSize: '16px',
  lineHeight: '1.5',
  color: '#333',
}

const details = {
  backgroundColor: '#f4f4f4',
  padding: '12px 24px',
  borderRadius: '4px',
  marginBottom: '24px',
}

const link = {
  color: '#2754C5',
  textDecoration: 'underline',
}

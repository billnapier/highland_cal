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
  type: 'CREATE' | 'UPDATE' | 'DELETE'
  eventName: string
  startTimestamp?: string
  endTimestamp?: string
  location?: string
  dashboardUrl: string
}

export default function EventNotificationEmail({
  type,
  eventName,
  startTimestamp,
  endTimestamp,
  location,
  dashboardUrl,
}: EventNotificationEmailProps) {
  let title = ''
  let previewText = ''
  let actionText = ''

  if (type === 'CREATE') {
    title = 'New Event Added'
    previewText = `New event: ${eventName}`
    actionText = 'A new event has been added to the calendar:'
  } else if (type === 'UPDATE') {
    title = 'Event Updated'
    previewText = `Event update: ${eventName}`
    actionText = 'An event has been updated:'
  } else if (type === 'DELETE') {
    title = 'Event Canceled'
    previewText = `Event canceled: ${eventName}`
    actionText = 'The following event has been canceled/deleted:'
  }

  const safeFormatDate = (dateString?: string) => {
    if (!dateString) return ''
    try {
      const date = new Date(dateString)
      if (isNaN(date.getTime())) return dateString
      return format(date, 'PPp')
    } catch {
      return dateString
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
            {type !== 'DELETE' && startTimestamp && (
              <Text style={text}>
                <strong>Start:</strong> {safeFormatDate(startTimestamp)}
              </Text>
            )}
            {type !== 'DELETE' && endTimestamp && (
              <Text style={text}>
                <strong>End:</strong> {safeFormatDate(endTimestamp)}
              </Text>
            )}
            {type !== 'DELETE' && location && (
              <Text style={text}>
                <strong>Location:</strong> {location}
              </Text>
            )}
          </Section>
          {type !== 'DELETE' && (
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

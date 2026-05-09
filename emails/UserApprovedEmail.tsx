import {
  Html,
  Body,
  Head,
  Heading,
  Container,
  Preview,
  Text,
  Link,
} from '@react-email/components'

interface UserApprovedEmailProps {
  displayName: string
  dashboardUrl: string
}

export default function UserApprovedEmail({
  displayName,
  dashboardUrl,
}: UserApprovedEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>Your account has been approved!</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={h1}>Welcome to Highland Cal</Heading>
          <Text style={text}>Hi {displayName},</Text>
          <Text style={text}>
            Your account has been approved by an administrator! You can now log
            in to view the schedule, RSVP for events, and manage your profile.
          </Text>
          <Text style={text}>
            <Link href={dashboardUrl} style={link}>
              Go to Dashboard
            </Link>
          </Text>
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

const link = {
  color: '#2754C5',
  textDecoration: 'underline',
}

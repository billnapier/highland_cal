import {
  Html,
  Body,
  Head,
  Heading,
  Container,
  Preview,
  Section,
  Text,
} from '@react-email/components'

interface NewRegistrationEmailProps {
  displayName: string
  email: string
}

export default function NewRegistrationEmail({
  displayName,
  email,
}: NewRegistrationEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>New user registration: {displayName}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={h1}>New User Registration</Heading>
          <Text style={text}>
            A new user has registered and is pending approval:
          </Text>
          <Section style={details}>
            <Text style={text}>
              <strong>Name:</strong> {displayName}
            </Text>
            <Text style={text}>
              <strong>Email:</strong> {email}
            </Text>
          </Section>
          <Text style={text}>
            Please log in to the dashboard to approve or decline their request.
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

const details = {
  backgroundColor: '#f4f4f4',
  padding: '12px 24px',
  borderRadius: '4px',
  marginBottom: '24px',
}

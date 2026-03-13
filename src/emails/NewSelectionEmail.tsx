import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from "@react-email/components";

export interface NewSelectionEmailProps {
  customerName: string;
  customerEmail: string | null;
  customerNote: string | null;
  photoCount: number;
  eventTitle: string;
  eventUrl: string;
  studioName: string | null;
}

export function NewSelectionEmail({
  customerName,
  customerEmail,
  customerNote,
  photoCount,
  eventTitle,
  eventUrl,
  studioName,
}: NewSelectionEmailProps) {
  const previewText = `${customerName} selected ${photoCount} photo${photoCount === 1 ? "" : "s"} from ${eventTitle}`;

  return (
    <Html>
      <Head />
      <Preview>{previewText}</Preview>
      <Body style={main}>
        <Container style={container}>
          {/* Header */}
          <Section style={header}>
            <Text style={headerLabel}>
              {studioName ?? "PhotoShare"}
            </Text>
          </Section>

          {/* Body */}
          <Section style={content}>
            <Heading style={h1}>New Photo Selection</Heading>
            <Text style={paragraph}>
              <strong>{customerName}</strong> has submitted a photo selection
              from your event <strong>{eventTitle}</strong>.
            </Text>

            {/* Details table */}
            <Section style={detailsBox}>
              <table style={table} cellPadding={0} cellSpacing={0}>
                <tbody>
                  <tr>
                    <td style={labelCell}>Customer</td>
                    <td style={valueCell}>{customerName}</td>
                  </tr>
                  {customerEmail && (
                    <tr>
                      <td style={labelCell}>Email</td>
                      <td style={valueCell}>
                        <Link href={`mailto:${customerEmail}`} style={link}>
                          {customerEmail}
                        </Link>
                      </td>
                    </tr>
                  )}
                  <tr>
                    <td style={labelCell}>Photos selected</td>
                    <td style={valueCell}>
                      <strong>{photoCount}</strong>
                    </td>
                  </tr>
                  {customerNote && (
                    <tr>
                      <td style={labelCell}>Note</td>
                      <td style={valueCell}>{customerNote}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </Section>

            <Section style={{ textAlign: "center" as const, marginTop: "32px" }}>
              <Link href={eventUrl} style={button}>
                View Selection
              </Link>
            </Section>

            <Hr style={hr} />

            <Text style={footer}>
              You received this email because a client submitted a photo
              selection via your gallery link. Visit{" "}
              <Link href={eventUrl} style={link}>
                {eventUrl}
              </Link>{" "}
              to review it.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

export default NewSelectionEmail;

// ─── Styles ───────────────────────────────────────────────────────────────────

const main: React.CSSProperties = {
  backgroundColor: "#f4f4f5",
  fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
};

const container: React.CSSProperties = {
  maxWidth: "560px",
  margin: "40px auto",
  backgroundColor: "#ffffff",
  borderRadius: "12px",
  overflow: "hidden",
  boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
};

const header: React.CSSProperties = {
  backgroundColor: "#18181b",
  padding: "20px 32px",
};

const headerLabel: React.CSSProperties = {
  color: "#ffffff",
  fontSize: "14px",
  fontWeight: "600",
  margin: "0",
  letterSpacing: "0.02em",
};

const content: React.CSSProperties = {
  padding: "32px",
};

const h1: React.CSSProperties = {
  fontSize: "22px",
  fontWeight: "700",
  color: "#18181b",
  margin: "0 0 12px",
};

const paragraph: React.CSSProperties = {
  fontSize: "15px",
  lineHeight: "1.6",
  color: "#3f3f46",
  margin: "0 0 24px",
};

const detailsBox: React.CSSProperties = {
  backgroundColor: "#f9f9fb",
  borderRadius: "8px",
  padding: "4px 0",
};

const table: React.CSSProperties = {
  width: "100%",
};

const labelCell: React.CSSProperties = {
  padding: "10px 16px",
  fontSize: "13px",
  color: "#71717a",
  fontWeight: "500",
  width: "140px",
  verticalAlign: "top",
};

const valueCell: React.CSSProperties = {
  padding: "10px 16px 10px 0",
  fontSize: "13px",
  color: "#18181b",
  verticalAlign: "top",
};

const button: React.CSSProperties = {
  display: "inline-block",
  backgroundColor: "#18181b",
  color: "#ffffff",
  fontSize: "14px",
  fontWeight: "600",
  textDecoration: "none",
  padding: "12px 28px",
  borderRadius: "8px",
};

const hr: React.CSSProperties = {
  borderColor: "#e4e4e7",
  margin: "28px 0 20px",
};

const footer: React.CSSProperties = {
  fontSize: "12px",
  color: "#a1a1aa",
  lineHeight: "1.6",
  margin: "0",
};

const link: React.CSSProperties = {
  color: "#3b82f6",
  textDecoration: "underline",
};

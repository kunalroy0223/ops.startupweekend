import { Body, Button, Container, Head, Heading, Hr, Html, Img, Preview, Section, Text } from "@react-email/components";

export interface NoticeEmailProps {
  preview: string;
  eyebrow: string;
  heading: string;
  paragraphs: string[];
  cta?: { label: string; href: string };
  footnote?: string;
  logoUrl: string;
  appUrl: string;
}

/**
 * The one branded email layout. Brand values: #000000 ink, #39C463 green,
 * #FFFFFF paper, #8298AB slate. Email clients ignore web fonts, so the
 * hierarchy is carried by weight and the inked button.
 */
export function NoticeEmail({ preview, eyebrow, heading, paragraphs, cta, footnote, logoUrl }: NoticeEmailProps) {
  return (
    <Html lang="en">
      <Head />
      <Preview>{preview}</Preview>
      <Body style={{ backgroundColor: "#F4F6F3", fontFamily: "Helvetica, Arial, sans-serif", margin: 0, padding: "32px 12px" }}>
        <Container style={{ maxWidth: 560, backgroundColor: "#FFFFFF", border: "2px solid #000000", boxShadow: "6px 6px 0 #000000" }}>
          <Section style={{ padding: "24px 32px 0" }}>
            <Img src={logoUrl} alt="Inhub Entrepreneurship Cell" width="104" height="54" style={{ display: "block" }} />
          </Section>
          <Section style={{ padding: "8px 32px 32px" }}>
            <Text style={{ fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: "#4D6070", margin: "16px 0 4px" }}>{eyebrow}</Text>
            <Heading as="h1" style={{ fontSize: 26, lineHeight: "1.15", fontWeight: 800, color: "#000000", margin: "0 0 16px" }}>
              {heading}
            </Heading>
            {paragraphs.map((p, i) => (
              <Text key={i} style={{ fontSize: 15, lineHeight: "1.55", color: "#1D2329", margin: "0 0 12px" }}>
                {p}
              </Text>
            ))}
            {cta ? (
              <Button
                href={cta.href}
                style={{ backgroundColor: "#000000", color: "#FFFFFF", fontSize: 14, fontWeight: 700, padding: "12px 20px", border: "2px solid #000000", boxShadow: "4px 4px 0 #39C463", marginTop: 12 }}
              >
                {cta.label}
              </Button>
            ) : null}
            {footnote ? <Text style={{ fontSize: 13, color: "#4D6070", marginTop: 24 }}>{footnote}</Text> : null}
          </Section>
          <Hr style={{ borderColor: "#D9DED7", margin: 0 }} />
          <Section style={{ padding: "16px 32px" }}>
            <Text style={{ fontSize: 12, lineHeight: "1.6", color: "#4D6070", margin: 0 }}>
              This is a system-generated mail. Please do not reply.
            </Text>
            <Text style={{ fontSize: 12, lineHeight: "1.6", color: "#4D6070", margin: "8px 0 0" }}>
              For assistance, contact{" "}
              <a href="mailto:admin@startupweekend.sbs" style={{ color: "#000000", fontWeight: 600 }}>
                admin@startupweekend.sbs
              </a>.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

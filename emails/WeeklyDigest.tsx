import {
  Html,
  Head,
  Body,
  Container,
  Section,
  Heading,
  Text,
  Link,
  Hr,
} from "@react-email/components";

export type DigestEmailThesis = {
  thesisId: string;
  ticker: string;
  title: string;
  healthBefore: number | null;
  healthAfter: number | null;
  blurb: string;
};

function delta(before: number | null, after: number | null): string {
  const fmt = (n: number) => (n > 0 ? `+${n.toFixed(2)}` : n.toFixed(2));
  if (after === null) return "";
  if (before === null) return `health ${fmt(after)}`;
  return `health ${fmt(before)} → ${fmt(after)}`;
}

export function WeeklyDigest({
  theses,
  appUrl,
}: {
  theses: DigestEmailThesis[];
  appUrl: string;
}) {
  return (
    <Html>
      <Head />
      <Body
        style={{
          backgroundColor: "#fafafa",
          fontFamily: "ui-sans-serif, system-ui, sans-serif",
          color: "#18181b",
        }}
      >
        <Container style={{ maxWidth: 560, margin: "0 auto", padding: "24px" }}>
          <Heading style={{ fontSize: 18, fontWeight: 600 }}>
            Your weekly thesis digest
          </Heading>
          <Text style={{ color: "#71717a", fontSize: 13 }}>
            What changed across the theses analyzed this week.
          </Text>
          {theses.map((t) => (
            <Section key={t.thesisId} style={{ margin: "16px 0" }}>
              <Text style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>
                {t.ticker} — {t.title}
              </Text>
              <Text style={{ fontSize: 12, color: "#71717a", margin: "2px 0" }}>
                {delta(t.healthBefore, t.healthAfter)}
              </Text>
              <Text style={{ fontSize: 13, lineHeight: "1.5", margin: "6px 0" }}>
                {t.blurb}
              </Text>
              <Link
                href={`${appUrl}/theses/${t.thesisId}`}
                style={{ fontSize: 12, color: "#1E3A5F" }}
              >
                View thesis →
              </Link>
            </Section>
          ))}
          <Hr style={{ borderColor: "#e4e4e7", margin: "24px 0 12px" }} />
          <Text style={{ fontSize: 11, color: "#a1a1aa" }}>
            You can turn off these emails anytime in your notification settings.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

export default WeeklyDigest;

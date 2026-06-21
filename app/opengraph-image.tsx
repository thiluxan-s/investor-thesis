import { ImageResponse } from "next/og";

export const alt =
  "Thesis Tracker — an AI agent that tracks evidence for and against your investment thesis";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#ffffff",
          padding: 80,
          boxSizing: "border-box",
        }}
      >
        {/* Wordmark */}
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div style={{ width: 44, height: 44, background: "#1E3A5F", borderRadius: 12 }} />
          <div style={{ display: "flex", alignItems: "center", fontSize: 34, fontWeight: 600, color: "#18181b" }}>Thesis Tracker</div>
        </div>

        {/* Headline + tagline */}
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ display: "flex", flexDirection: "column", fontSize: 64, fontWeight: 700, color: "#18181b", lineHeight: 1.1, letterSpacing: "-0.02em" }}>
            <div style={{ display: "flex" }}>Evidence for and against</div>
            <div style={{ display: "flex" }}>your investment thesis.</div>
          </div>
          <div style={{ display: "flex", fontSize: 28, color: "#71717a", maxWidth: 760 }}>
            An AI agent researches the web on a schedule, scores each claim, and tracks thesis health over time.
          </div>
        </div>

        {/* Health-bar motif */}
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ width: 220, height: 10, borderRadius: 999, background: "#1F7A4D" }} />
          <div style={{ width: 120, height: 10, borderRadius: 999, background: "#e4e4e7" }} />
          <div style={{ width: 80, height: 10, borderRadius: 999, background: "#C0492F" }} />
          <div style={{ display: "flex", alignItems: "center", marginLeft: 16, fontSize: 22, color: "#a1a1aa", fontFamily: "monospace" }}>
            investor-thesis.vercel.app
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}

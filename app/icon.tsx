import { ImageResponse } from "next/og";

// Branded favicon: the deep-blue rounded-square mark used in the wordmark
// (app/page.tsx, app/(app)/layout.tsx). Generated at request time — no binary.
export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          background: "#1E3A5F",
          borderRadius: 7,
        }}
      />
    ),
    { ...size },
  );
}

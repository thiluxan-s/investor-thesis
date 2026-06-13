const REPLACEMENT_CHAR = "�";

/**
 * Truncate `text` so its UTF-8 byte length is at most `maxBytes`.
 * Returns `text` unchanged when it already fits.
 * When truncation is needed the byte slice is decoded non-fatally and
 * any trailing replacement character (U+FFFD) produced by a split multi-byte
 * sequence is trimmed.
 */
export function truncateToBytes(text: string, maxBytes: number): string {
  const buf = Buffer.from(text, "utf8");
  if (buf.byteLength <= maxBytes) return text;

  const sliced = buf.subarray(0, maxBytes);
  const decoded = new TextDecoder("utf-8", { fatal: false }).decode(sliced);
  // Trim any trailing replacement character that resulted from a split sequence
  return decoded.endsWith(REPLACEMENT_CHAR)
    ? decoded.slice(0, -REPLACEMENT_CHAR.length)
    : decoded;
}

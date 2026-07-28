const PDF_TEXT_LIMIT = 3000;

export async function extractPdfText(base64: string): Promise<string> {
  const { extractText } = await import("unpdf");
  const buffer = Buffer.from(base64, "base64");
  const { text } = await extractText(new Uint8Array(buffer));
  const clean = (Array.isArray(text) ? text.join(" ") : String(text)).replace(/\s+/g, " ").trim();
  return clean.length > PDF_TEXT_LIMIT ? clean.slice(0, PDF_TEXT_LIMIT) + "..." : clean;
}

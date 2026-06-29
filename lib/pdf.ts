import { PDFParse } from "pdf-parse";

const PDF_TEXT_LIMIT = 3000; // chars of extracted text to include in the prompt

export async function extractPdfText(base64: string): Promise<string> {
  const buffer = Buffer.from(base64, "base64");
  const uint8 = new Uint8Array(buffer);
  const parser = new PDFParse({ data: uint8 });
  const result = await parser.getText();
  await parser.destroy();
  const text = result.text.replace(/\s+/g, " ").trim();
  return text.length > PDF_TEXT_LIMIT ? text.slice(0, PDF_TEXT_LIMIT) + "..." : text;
}

import { createRequire } from "module";

const require = createRequire(import.meta.url);
const pdfParse = require("pdf-parse");

export interface PDFExtractionResult {
  text: string;
  title: string;
  pages: number;
  metadata?: {
    author?: string;
    subject?: string;
    keywords?: string;
  };
}

/**
 * Extract text content from PDF buffer
 */
export async function extractPDFText(buffer: Buffer): Promise<PDFExtractionResult> {
  try {
    const data = await pdfParse(buffer);

    if (!data.text || data.text.trim().length === 0) {
      throw new Error("No text content found in PDF");
    }

    return {
      text: data.text,
      title: data.info?.Title || "Untitled Document",
      pages: data.numpages,
      metadata: {
        author: data.info?.Author,
        subject: data.info?.Subject,
        keywords: data.info?.Keywords,
      },
    };
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to extract PDF text: ${error.message}`);
    }
    throw new Error("Failed to extract PDF text");
  }
}

/**
 * Validate if buffer is a valid PDF
 */
export function isPDF(buffer: Buffer): boolean {
  // PDF files start with %PDF
  return buffer.slice(0, 4).toString() === "%PDF";
}

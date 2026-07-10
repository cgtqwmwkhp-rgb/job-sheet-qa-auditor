/**
 * Gemini multimodal content-part mapping tests.
 */

import { describe, it, expect } from "vitest";
import { buildGeminiContents, type Message } from "../../_core/llm";

describe("buildGeminiContents multimodal", () => {
  it("maps text-only messages to text parts", () => {
    const messages: Message[] = [
      { role: "system", content: "You are a QA auditor." },
      { role: "user", content: "Analyze this job sheet." },
    ];
    const built = buildGeminiContents(messages);
    expect(built.systemInstruction?.parts[0]?.text).toContain("QA auditor");
    expect(built.contents).toHaveLength(1);
    expect(built.contents[0].parts).toEqual([
      { text: "Analyze this job sheet." },
    ]);
  });

  it("maps data-URI PDF file_url to inlineData", () => {
    const messages: Message[] = [
      {
        role: "user",
        content: [
          { type: "text", text: "Check the signature ink." },
          {
            type: "file_url",
            file_url: {
              url: "data:application/pdf;base64,JVBERi0x",
              mime_type: "application/pdf",
            },
          },
        ],
      },
    ];
    const built = buildGeminiContents(messages);
    expect(built.contents[0].parts).toEqual([
      { text: "Check the signature ink." },
      {
        inlineData: {
          mimeType: "application/pdf",
          data: "JVBERi0x",
        },
      },
    ]);
  });

  it("maps data-URI image_url to inlineData", () => {
    const messages: Message[] = [
      {
        role: "user",
        content: [
          {
            type: "image_url",
            image_url: {
              url: "data:image/png;base64,iVBOR",
              detail: "high",
            },
          },
        ],
      },
    ];
    const built = buildGeminiContents(messages);
    expect(built.contents[0].parts[0]).toEqual({
      inlineData: { mimeType: "image/png", data: "iVBOR" },
    });
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  csrfMiddleware,
  generateCsrfToken,
  validateCsrfOrigin,
  validateCsrfToken,
} from "./csrf";

const sessionId = "user:42";

function request(headers: Record<string, string> = {}) {
  return {
    protocol: "https",
    headers: {
      host: "portal.example.test",
      origin: "https://portal.example.test",
      ...headers,
    },
  } as any;
}

describe("CSRF protection", () => {
  beforeEach(() => {
    vi.stubEnv("CSRF_SECRET", "a".repeat(32));
    vi.stubEnv("JWT_SECRET", "");
    vi.stubEnv("CSRF_TRUSTED_ORIGINS", "");
  });

  it("accepts a valid session-bound token", () => {
    const token = generateCsrfToken(sessionId);
    expect(() => validateCsrfToken(token, sessionId)).not.toThrow();
  });

  it("rejects a mutation from an untrusted origin", () => {
    expect(() =>
      validateCsrfOrigin(request({ origin: "https://attacker.example" }))
    ).toThrow("CSRF origin is not trusted");
  });

  it("uses configured origins for a separately hosted SPA", () => {
    vi.stubEnv("CSRF_TRUSTED_ORIGINS", "https://app.example.test");
    expect(() =>
      validateCsrfOrigin(request({ origin: "https://app.example.test" }))
    ).not.toThrow();
  });

  it("requires both an allowed origin and token for mutations", async () => {
    const next = vi.fn();
    const token = generateCsrfToken(sessionId);

    await csrfMiddleware()({
      ctx: { req: request({ "x-csrf-token": token }), user: { id: 42 } },
      input: {},
      next,
    });

    expect(next).toHaveBeenCalledOnce();
  });
});

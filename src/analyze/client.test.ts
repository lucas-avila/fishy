import { describe, expect, it, vi } from "vitest";
import type { ExtractedEmail } from "../shared/types";
import { analyzeEmail } from "./client";

const email: ExtractedEmail = {
  sender: { displayName: "A", email: "a@example.com" },
  subject: "hi",
  bodyText: "body",
  links: [],
};

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return { ok, status, json: async () => body } as unknown as Response;
}

describe("analyzeEmail", () => {
  it("posts to the systemone endpoint with the right headers and body", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({
        model: "jev-latest",
        answers: {
          scam_likelihood: { type: "score", score: 0, confidence: 1, legend: {}, probabilities: {} },
        },
        usage: {},
      })
    );

    await analyzeEmail(email, "secret-key", [], fetchImpl);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://api.typesafe.ai/v1/systemone");
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({
      Authorization: "Bearer secret-key",
      "Content-Type": "application/json",
    });
    const body = JSON.parse(init.body);
    expect(body.model).toBe("jev-latest");
    expect(body.state.email.sender.email).toBe("a@example.com");
  });

  it("omits disabled signals from the request body", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({
        model: "jev-latest",
        answers: {
          scam_likelihood: { type: "score", score: 0, confidence: 1, legend: {}, probabilities: {} },
        },
        usage: {},
      })
    );

    await analyzeEmail(email, "secret-key", ["requests_credentials", "requests_payment"], fetchImpl);

    const [, init] = fetchImpl.mock.calls[0];
    const body = JSON.parse(init.body);
    expect(body.questions).not.toHaveProperty("requests_credentials");
    expect(body.questions).not.toHaveProperty("requests_payment");
    expect(body.questions).toHaveProperty("scam_likelihood");
  });

  it("maps a 401 to a friendly message", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({}, false, 401));

    await expect(analyzeEmail(email, "bad-key", [], fetchImpl)).rejects.toThrow(
      "Your TypeSafe API key was rejected. Check it in Fishy's options."
    );
  });

  it("maps a 429 to a busy message after retrying once", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({}, false, 429));

    await expect(analyzeEmail(email, "key", [], fetchImpl)).rejects.toThrow(
      "TypeSafe is busy, try again in a moment."
    );
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("returns a parsed AnalysisResult on success", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({
        model: "jev-latest",
        answers: {
          requests_credentials: { type: "noul", noul: 0.9 },
          scam_likelihood: { type: "score", score: 3, confidence: 1, legend: {}, probabilities: {} },
        },
        usage: {},
      })
    );

    const result = await analyzeEmail(email, "key", [], fetchImpl);

    expect(result.verdict).toBe("phishing");
    expect(result.scamScore).toBe(1);
    expect(result.signals[0]).toEqual({
      id: "requests_credentials",
      label: "Asks for passwords, codes, or account details",
      probability: 0.9,
    });
  });
});

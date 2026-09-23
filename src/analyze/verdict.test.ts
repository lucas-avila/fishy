import { describe, expect, it } from "vitest";
import type { TypeSafeAnswers } from "./questions";
import {
  HIGH_STAKES_NOUL_THRESHOLD,
  PHISHING_SCORE_THRESHOLD,
  SUSPICIOUS_NOUL_THRESHOLD,
  SUSPICIOUS_SCORE_THRESHOLD,
  toResult,
} from "./verdict";

// scam_likelihood's raw score has 4 levels (0..3); toResult normalizes it via score / 3.
const SCORE_LEVELS = 3;

const NOUL_IDS = [
  "requests_credentials",
  "requests_payment",
  "creates_time_pressure",
  "offers_unexpected_reward",
  "sender_identity_mismatch",
  "link_domain_mismatch",
  "reply_to_mismatch",
  "impersonates_brand_or_person",
];

function makeAnswers(overrides: Record<string, number>, score: number): TypeSafeAnswers {
  const answers: TypeSafeAnswers = {};
  for (const id of NOUL_IDS) {
    answers[id] = { type: "noul", noul: overrides[id] ?? 0.1 };
  }
  answers.scam_likelihood = {
    type: "score",
    score,
    confidence: 0.9,
    legend: {},
    probabilities: {},
  };
  return answers;
}

describe("toResult", () => {
  it("is fine for a low-risk email", () => {
    const result = toResult(makeAnswers({}, 0));
    expect(result.verdict).toBe("fine");
    expect(result.scamScore).toBe(0);
  });

  it("normalizes scamScore as score / 3", () => {
    const result = toResult(makeAnswers({}, 2));
    expect(result.scamScore).toBeCloseTo(2 / 3);
  });

  it("is suspicious once scamScore reaches 0.3", () => {
    const result = toResult(makeAnswers({}, SUSPICIOUS_SCORE_THRESHOLD * SCORE_LEVELS));
    expect(result.verdict).toBe("suspicious");
  });

  it("is suspicious when any noul reaches 0.6, even with a low score", () => {
    const result = toResult(makeAnswers({ creates_time_pressure: SUSPICIOUS_NOUL_THRESHOLD }, 0));
    expect(result.verdict).toBe("suspicious");
  });

  it("is phishing once scamScore reaches 0.6", () => {
    const result = toResult(makeAnswers({}, PHISHING_SCORE_THRESHOLD * SCORE_LEVELS));
    expect(result.verdict).toBe("phishing");
  });

  it("is phishing via the high-stakes override even with a low score", () => {
    const result = toResult(makeAnswers({ requests_credentials: HIGH_STAKES_NOUL_THRESHOLD }, 0));
    expect(result.verdict).toBe("phishing");
  });

  it("does not let a non-high-stakes noul trigger the phishing override", () => {
    const result = toResult(makeAnswers({ creates_time_pressure: 0.95 }, 0));
    expect(result.verdict).toBe("suspicious");
  });

  it("sorts signals by probability descending", () => {
    const result = toResult(
      makeAnswers(
        { requests_credentials: 0.2, requests_payment: 0.9, creates_time_pressure: 0.5 },
        0
      )
    );
    const probabilities = result.signals.map((s) => s.probability);
    expect(probabilities).toEqual([...probabilities].sort((a, b) => b - a));
    expect(result.signals).toHaveLength(NOUL_IDS.length);
  });

  it("attaches the human label from SIGNAL_LABELS", () => {
    const result = toResult(makeAnswers({}, 0));
    const credentials = result.signals.find((s) => s.id === "requests_credentials");
    expect(credentials?.label).toBe("Asks for passwords, codes, or account details");
  });

  it("only produces signals for the Nouls present in the answers", () => {
    const answers: TypeSafeAnswers = {
      requests_credentials: { type: "noul", noul: 0.9 },
      scam_likelihood: { type: "score", score: 0, confidence: 1, legend: {}, probabilities: {} },
    };
    const result = toResult(answers);
    expect(result.signals).toHaveLength(1);
    expect(result.signals[0].id).toBe("requests_credentials");
  });
});

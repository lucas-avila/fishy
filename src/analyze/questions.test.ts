import { describe, expect, it } from "vitest";
import type { ExtractedEmail } from "../shared/types";
import { buildRequest, SIGNAL_DESCRIPTIONS, SIGNAL_LABELS } from "./questions";

const baseEmail: ExtractedEmail = {
  sender: { displayName: "PayPal", email: "service@paypa1-secure.com" },
  replyTo: "reply@another.com",
  subject: "Verify your account",
  bodyText: "Please verify your account now.",
  links: Array.from({ length: 30 }, (_, i) => ({
    text: `link ${i}`,
    href: `https://example${i}.com/path`,
  })),
};

const QUESTION_IDS = [
  "requests_credentials",
  "requests_payment",
  "creates_time_pressure",
  "offers_unexpected_reward",
  "sender_identity_mismatch",
  "link_domain_mismatch",
  "reply_to_mismatch",
  "impersonates_brand_or_person",
  "scam_likelihood",
];

describe("buildRequest", () => {
  it("uses the jev-latest model", () => {
    expect(buildRequest(baseEmail).model).toBe("jev-latest");
  });

  it("computes the sender domain from the sender email", () => {
    const req = buildRequest(baseEmail);
    const state = req.state as { email: { sender: { domain: string } } };
    expect(state.email.sender.domain).toBe("paypa1-secure.com");
  });

  it("computes a domain for each link", () => {
    const req = buildRequest(baseEmail);
    const state = req.state as { email: { links: { domain: string }[] } };
    expect(state.email.links[0].domain).toBe("example0.com");
  });

  it("falls back to an empty domain for an invalid href or sender email", () => {
    const email: ExtractedEmail = {
      ...baseEmail,
      sender: { displayName: "x", email: "not-an-email" },
      links: [{ text: "bad", href: "not a url" }],
    };
    const req = buildRequest(email);
    const state = req.state as {
      email: { sender: { domain: string }; links: { domain: string }[] };
    };
    expect(state.email.sender.domain).toBe("");
    expect(state.email.links[0].domain).toBe("");
  });

  it("caps links at the first 25", () => {
    const req = buildRequest(baseEmail);
    const state = req.state as { email: { links: unknown[] } };
    expect(state.email.links).toHaveLength(25);
  });

  it("includes every expected question id", () => {
    const req = buildRequest(baseEmail);
    expect(Object.keys(req.questions).sort()).toEqual([...QUESTION_IDS].sort());
  });

  it("labels every noul question and only noul questions", () => {
    const req = buildRequest(baseEmail);
    const noulIds = Object.entries(req.questions)
      .filter(([, q]) => q.type === "noul")
      .map(([id]) => id);
    expect(Object.keys(SIGNAL_LABELS).sort()).toEqual(noulIds.sort());
  });

  it("gives scam_likelihood 4 ordered score levels", () => {
    const req = buildRequest(baseEmail);
    const scamLikelihood = req.questions.scam_likelihood;
    expect(scamLikelihood.type).toBe("score");
    if (scamLikelihood.type === "score") {
      expect(scamLikelihood.criteria).toHaveLength(4);
    }
  });

  it("defaults to sending every question when no signals are disabled", () => {
    const req = buildRequest(baseEmail);
    expect(Object.keys(req.questions).sort()).toEqual([...QUESTION_IDS].sort());
  });

  it("omits disabled Noul questions from the request", () => {
    const req = buildRequest(baseEmail, ["requests_credentials", "requests_payment"]);
    expect(req.questions).not.toHaveProperty("requests_credentials");
    expect(req.questions).not.toHaveProperty("requests_payment");
    expect(Object.keys(req.questions).sort()).toEqual(
      QUESTION_IDS.filter((id) => id !== "requests_credentials" && id !== "requests_payment").sort()
    );
  });

  it("always sends scam_likelihood even if it were passed as disabled", () => {
    const req = buildRequest(baseEmail, [
      "requests_credentials",
      "requests_payment",
      "creates_time_pressure",
      "offers_unexpected_reward",
      "sender_identity_mismatch",
      "link_domain_mismatch",
      "reply_to_mismatch",
      "impersonates_brand_or_person",
    ]);
    expect(req.questions).toHaveProperty("scam_likelihood");
    expect(Object.keys(req.questions)).toEqual(["scam_likelihood"]);
  });
});

describe("SIGNAL_DESCRIPTIONS", () => {
  it("has a description for every signal label", () => {
    expect(Object.keys(SIGNAL_DESCRIPTIONS).sort()).toEqual(Object.keys(SIGNAL_LABELS).sort());
  });

  it("gives every signal a non-empty plain sentence", () => {
    for (const description of Object.values(SIGNAL_DESCRIPTIONS)) {
      expect(typeof description).toBe("string");
      expect(description.length).toBeGreaterThan(0);
    }
  });
});

import type { AnalysisResult, Signal, Verdict } from "../shared/types";
import { SIGNAL_LABELS, type SignalId, type TypeSafeAnswers } from "./questions";

export const PHISHING_SCORE_THRESHOLD = 0.6;
export const SUSPICIOUS_SCORE_THRESHOLD = 0.3;
export const HIGH_STAKES_NOUL_THRESHOLD = 0.85;
export const SUSPICIOUS_NOUL_THRESHOLD = 0.6;

const HIGH_STAKES_SIGNAL_IDS: SignalId[] = [
  "requests_credentials",
  "requests_payment",
  "sender_identity_mismatch",
  "link_domain_mismatch",
];

const MAX_SCORE_LEVEL = 3;

export function toResult(answers: TypeSafeAnswers): AnalysisResult {
  const signals: Signal[] = [];
  let scamScore = 0;

  for (const [id, answer] of Object.entries(answers)) {
    if (answer.type === "noul") {
      signals.push({ id, label: (SIGNAL_LABELS as Record<string, string>)[id] ?? id, probability: answer.noul });
    } else {
      scamScore = answer.score / MAX_SCORE_LEVEL;
    }
  }

  signals.sort((a, b) => b.probability - a.probability);

  const highStakesTriggered = signals.some(
    (s) =>
      (HIGH_STAKES_SIGNAL_IDS as string[]).includes(s.id) && s.probability >= HIGH_STAKES_NOUL_THRESHOLD
  );
  const anySignalSuspicious = signals.some((s) => s.probability >= SUSPICIOUS_NOUL_THRESHOLD);

  let verdict: Verdict;
  if (scamScore >= PHISHING_SCORE_THRESHOLD || highStakesTriggered) {
    verdict = "phishing";
  } else if (scamScore >= SUSPICIOUS_SCORE_THRESHOLD || anySignalSuspicious) {
    verdict = "suspicious";
  } else {
    verdict = "fine";
  }

  return { verdict, scamScore, signals };
}

import type { AnalysisResult, ExtractedEmail } from "../shared/types";
import { buildRequest, type SignalId, type TypeSafeAnswers } from "./questions";
import { toResult } from "./verdict";

const API_URL = "https://api.typesafe.ai/v1/systemone";
const RETRY_DELAY_MS = 400;
const RETRYABLE_STATUSES = new Set([429, 529]);

interface TypeSafeResponseBody {
  model: string;
  answers: TypeSafeAnswers;
  usage: unknown;
}

function friendlyError(status: number): string {
  if (status === 401) {
    return "Your TypeSafe API key was rejected. Check it in Fishy's options.";
  }
  if (RETRYABLE_STATUSES.has(status)) {
    return "TypeSafe is busy, try again in a moment.";
  }
  return `TypeSafe request failed (status ${status}).`;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function analyzeEmail(
  email: ExtractedEmail,
  apiKey: string,
  disabledSignals: SignalId[] = [],
  fetchImpl: typeof fetch = fetch
): Promise<AnalysisResult> {
  const body = JSON.stringify(buildRequest(email, disabledSignals));
  const headers = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };

  let response = await fetchImpl(API_URL, { method: "POST", headers, body });

  if (!response.ok && RETRYABLE_STATUSES.has(response.status)) {
    await delay(RETRY_DELAY_MS);
    response = await fetchImpl(API_URL, { method: "POST", headers, body });
  }

  if (!response.ok) {
    throw new Error(friendlyError(response.status));
  }

  const data = (await response.json()) as TypeSafeResponseBody;
  return toResult(data.answers);
}

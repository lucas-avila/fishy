export interface EmailLink {
  text: string;
  href: string;
}

export interface ExtractedEmail {
  sender: { displayName: string; email: string };
  /** Reply-To address when Gmail exposes one and it differs from sender.email. */
  replyTo?: string;
  subject: string;
  /** Plain text of the body, whitespace-normalized, capped at ~15k chars. */
  bodyText: string;
  links: EmailLink[];
}

export type Verdict = "fine" | "suspicious" | "phishing";

export interface Signal {
  id: string;
  /** Human-readable, e.g. "Asks for a password or login credentials" */
  label: string;
  /** Probability 0..1 that this red flag is present. */
  probability: number;
}

export interface AnalysisResult {
  verdict: Verdict;
  /** 0..1 overall scam likelihood derived from the model's Score answer. */
  scamScore: number;
  signals: Signal[];
}

// Popup -> content script (chrome.tabs.sendMessage)
export interface ExtractEmailRequest { type: "EXTRACT_EMAIL" }
export type ExtractEmailResponse =
  | { ok: true; email: ExtractedEmail }
  | { ok: false; error: string };

// Popup -> background (chrome.runtime.sendMessage)
export interface AnalyzeEmailRequest { type: "ANALYZE_EMAIL"; email: ExtractedEmail }
export type AnalyzeEmailResponse =
  | { ok: true; result: AnalysisResult }
  | { ok: false; error: string };

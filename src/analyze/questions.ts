import type { ExtractedEmail } from "../shared/types";

const MODEL = "jev-latest";

export const SIGNAL_LABELS = {
  requests_credentials: "Asks for passwords, codes, or account details",
  requests_payment: "Asks for money or payment details",
  creates_time_pressure: "Creates urgency or threatens consequences",
  offers_unexpected_reward: "Promises an unexpected prize, refund, or payment",
  sender_identity_mismatch: "Sender name doesn't match the sending domain",
  link_domain_mismatch: "Links go somewhere other than they claim",
  reply_to_mismatch: "Replies are redirected to a different address",
  impersonates_brand_or_person: "Impersonates a known company or person",
} satisfies Record<string, string>;

export type SignalId = keyof typeof SIGNAL_LABELS;

export const SIGNAL_DESCRIPTIONS: Record<SignalId, string> = {
  requests_credentials:
    "Flags emails that ask you to enter, confirm, or verify a password, login, or one-time code.",
  requests_payment:
    "Flags emails that ask you to send money, wire funds, buy gift cards, or share card or bank details.",
  creates_time_pressure:
    "Flags emails that pressure you to act immediately or threaten a consequence like account closure or legal action.",
  offers_unexpected_reward:
    "Flags emails that claim you've won or are owed an unexpected prize, refund, inheritance, or payment.",
  sender_identity_mismatch:
    "Flags emails where the claimed sender doesn't match the domain the email actually came from.",
  link_domain_mismatch:
    "Flags emails whose links point somewhere different from what they claim or display.",
  reply_to_mismatch:
    "Flags emails where replies are redirected to a different, unrelated address than the sender.",
  impersonates_brand_or_person:
    "Flags emails that pose as a known company, bank, or person in a way that doesn't fit who actually sent it.",
};

export interface NoulQuestion {
  type: "noul";
  instructions: string;
  criteria?: { true: string; false: string };
}

export interface ScoreQuestion {
  type: "score";
  instructions: string;
  criteria: string[];
}

export type Question = NoulQuestion | ScoreQuestion;

export interface NoulAnswer {
  type: "noul";
  noul: number;
}

export interface ScoreAnswer {
  type: "score";
  score: number;
  confidence: number;
  legend: Record<string, unknown>;
  probabilities: Record<string, number>;
}

export type Answer = NoulAnswer | ScoreAnswer;
export type TypeSafeAnswers = Record<string, Answer>;

export interface TypeSafeRequestBody {
  model: string;
  state: unknown;
  questions: Record<string, Question>;
}

function domainOfEmail(address: string): string {
  const at = address.lastIndexOf("@");
  return at === -1 ? "" : address.slice(at + 1).toLowerCase();
}

function domainOfUrl(href: string): string {
  try {
    return new URL(href).hostname.toLowerCase();
  } catch {
    return "";
  }
}

const MAX_LINKS = 25;

export function buildRequest(email: ExtractedEmail, disabledSignals: SignalId[] = []): TypeSafeRequestBody {
  const links = email.links.slice(0, MAX_LINKS).map((link) => ({
    text: link.text,
    href: link.href,
    domain: domainOfUrl(link.href),
  }));

  const state = {
    email: {
      sender: {
        displayName: email.sender.displayName,
        email: email.sender.email,
        domain: domainOfEmail(email.sender.email),
      },
      replyTo: email.replyTo,
      subject: email.subject,
      bodyText: email.bodyText,
      links,
    },
  };

  const allQuestions: Record<SignalId | "scam_likelihood", Question> = {
    requests_credentials: {
      type: "noul",
      instructions:
        "Does `email.bodyText` ask the recipient to enter, confirm, or verify a password, login, 2FA code, or account details?",
      criteria: {
        true: "The email explicitly asks the recipient to provide, confirm, or verify a password, login, 2FA/verification code, or other account credentials.",
        false: "The email does not ask the recipient for any credentials or account verification.",
      },
    },
    requests_payment: {
      type: "noul",
      instructions:
        "Does the email ask the recipient to pay, wire money, buy gift cards, or share card/bank details?",
      criteria: {
        true: "The email asks the recipient to send money, make a payment, buy gift cards, or share card or bank account details.",
        false: "The email does not request any payment or financial account details.",
      },
    },
    creates_time_pressure: {
      type: "noul",
      instructions:
        "Does `email.subject` or `email.bodyText` pressure the recipient to act immediately or threaten consequences (account closure, legal action, missed prize)?",
      criteria: {
        true: "The subject or body pressures immediate action or threatens a negative consequence such as account closure, legal action, or a missed deadline or prize.",
        false: "The subject and body contain no urgency or threat language.",
      },
    },
    offers_unexpected_reward: {
      type: "noul",
      instructions:
        "Does the email claim the recipient won or is owed an unexpected prize, refund, inheritance, or payment?",
      criteria: {
        true: "The email claims the recipient has won, is owed, or is entitled to an unexpected prize, refund, inheritance, or payment.",
        false: "The email makes no such claim.",
      },
    },
    sender_identity_mismatch: {
      type: "noul",
      instructions:
        'Does the organization or person implied by `email.sender.displayName` or the body\'s claimed sender conflict with `email.sender.domain` (e.g. "PayPal" from a gmail.com or lookalike domain)?',
      criteria: {
        true: "The claimed identity would normally send from a different, well-known domain than `email.sender.domain`.",
        false: "`email.sender.domain` plausibly belongs to the claimed sender, or no specific identity is claimed.",
      },
    },
    link_domain_mismatch: {
      type: "noul",
      instructions:
        "Do any of `email.links[*].domain` point somewhere inconsistent with the claimed sender or with what the link text says (lookalike domains, URL shorteners, raw IPs, `text` showing one domain while `href` goes to another)?",
      criteria: {
        true: "At least one link's domain is inconsistent with the claimed sender or with that link's own visible text.",
        false: "All links are consistent with the claimed sender and their visible text.",
      },
    },
    reply_to_mismatch: {
      type: "noul",
      instructions:
        "Is `email.replyTo` present and on a different domain than `email.sender.domain` in a way that suggests replies are being redirected?",
      criteria: {
        true: "`email.replyTo` is present and on a different, suspicious domain than `email.sender.domain`.",
        false: "`email.replyTo` is absent, or is on a domain that plausibly relates to `email.sender.domain`.",
      },
    },
    impersonates_brand_or_person: {
      type: "noul",
      instructions:
        "Does the email pose as a well-known company, bank, government body, or as a colleague/executive of the recipient in a way that doesn't fit the sender address?",
      criteria: {
        true: "The email presents itself as a well-known organization, or as a colleague or executive, in a way inconsistent with `email.sender.email`.",
        false: "The email does not impersonate any specific organization or person, or the sender address is a plausible fit for the claimed identity.",
      },
    },
    scam_likelihood: {
      type: "score",
      instructions:
        "Overall, how likely is this email to be a phishing attempt or scam, considering sender, links, and what it asks the recipient to do?",
      criteria: [
        "Ordinary legitimate email: personal, transactional, or newsletter with consistent sender and links",
        "Mostly legitimate but has one mildly unusual element (e.g. marketing urgency, a tracking-link domain)",
        "Several red flags: mismatched identity or links, or asks for sensitive info under pressure",
        "Clear phishing or scam: impersonation plus a request for credentials, money, or a malicious link",
      ],
    },
  };

  const questions: Record<string, Question> = {};
  for (const [id, question] of Object.entries(allQuestions)) {
    if (id !== "scam_likelihood" && disabledSignals.includes(id as SignalId)) continue;
    questions[id] = question;
  }

  return { model: MODEL, state, questions };
}

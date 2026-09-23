import type {
  AnalysisResult,
  AnalyzeEmailResponse,
  ExtractEmailResponse,
  ExtractedEmail,
  Verdict,
} from "../shared/types";
import { SUSPICIOUS_NOUL_THRESHOLD } from "../analyze/verdict";

const GMAIL_URL_PREFIX = "https://mail.google.com/";

const VERDICT_COPY: Record<Verdict, string> = {
  fine: "Looks fine",
  suspicious: "Suspicious",
  phishing: "Likely phishing",
};

const VERDICT_SUBTITLE: Record<Verdict, string> = {
  fine: "No strong warning signs found.",
  suspicious: "Some warning signs. Read carefully before acting.",
  phishing: "Strong warning signs. Don't click links or reply.",
};

// Static, developer-authored icon markup (never derived from email content).
const GEAR_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>';

const MAIL_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22 6 12 13 2 6"></polyline></svg>';

const VERDICT_ICON: Record<Verdict, string> = {
  fine: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>',
  suspicious:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>',
  phishing:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polygon points="7.86 2 16.14 2 22 7.86 22 16.14 16.14 22 7.86 22 2 16.14 2 7.86 7.86 2"></polygon><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>',
};

function iconElement(svgMarkup: string): SVGElement {
  const template = document.createElement("template");
  template.innerHTML = svgMarkup;
  return template.content.firstElementChild as SVGElement;
}

const app = document.getElementById("app");
if (!app) throw new Error("missing #app");
const root: HTMLElement = app;

function renderWordmark(): HTMLElement {
  const title = document.createElement("span");
  title.className = "header-title";
  title.setAttribute("aria-label", "fishy");
  title.appendChild(document.createTextNode("f"));
  const idot = document.createElement("span");
  idot.className = "i-dot";
  idot.textContent = "ı";
  title.appendChild(idot);
  title.appendChild(document.createTextNode("shy"));
  return title;
}

function renderHeader(): HTMLElement {
  const header = document.createElement("div");
  header.className = "header";

  const logo = document.createElement("img");
  logo.src = "/logo.png";
  logo.width = 24;
  logo.height = 24;
  logo.alt = "";
  logo.className = "header-logo";
  header.appendChild(logo);

  header.appendChild(renderWordmark());

  const settingsButton = document.createElement("button");
  settingsButton.type = "button";
  settingsButton.className = "icon-button";
  settingsButton.setAttribute("aria-label", "Open settings");
  settingsButton.appendChild(iconElement(GEAR_ICON));
  settingsButton.addEventListener("click", () => chrome.runtime.openOptionsPage());
  header.appendChild(settingsButton);

  return header;
}

function renderEmptyState(): HTMLElement {
  const wrap = document.createElement("div");
  wrap.className = "empty-state";
  wrap.appendChild(iconElement(MAIL_ICON));
  const text = document.createElement("p");
  text.textContent = "Open an email in Gmail, then come back to check it here.";
  wrap.appendChild(text);
  return wrap;
}

function renderIdleCard(tabId: number, content: HTMLElement): HTMLElement {
  const card = document.createElement("div");
  card.className = "idle-card";

  const button = document.createElement("button");
  button.type = "button";
  button.className = "btn-primary";
  button.textContent = "Check this email";
  button.addEventListener("click", () => void handleCheckClick(tabId, content));
  card.appendChild(button);

  const helper = document.createElement("p");
  helper.className = "helper";
  helper.textContent = "Fishy reads the open email and checks it for phishing.";
  card.appendChild(helper);

  return card;
}

function renderLoadingCard(stageText: string): HTMLElement {
  const card = document.createElement("div");
  card.className = "idle-card";

  const button = document.createElement("button");
  button.type = "button";
  button.className = "btn-primary";
  button.disabled = true;

  const spinner = document.createElement("span");
  spinner.className = "spinner";
  button.appendChild(spinner);

  const label = document.createElement("span");
  label.textContent = stageText;
  button.appendChild(label);

  card.appendChild(button);
  return card;
}

function renderCheckAgainButton(tabId: number, content: HTMLElement): HTMLElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "btn-secondary";
  button.textContent = "Check again";
  button.addEventListener("click", () => void handleCheckClick(tabId, content));
  return button;
}

function renderError(message: string): HTMLElement {
  const box = document.createElement("div");
  box.className = "error-card";

  const text = document.createElement("p");
  text.textContent = message;
  box.appendChild(text);

  if (/api key|options/i.test(message)) {
    const openOptions = document.createElement("button");
    openOptions.type = "button";
    openOptions.className = "btn-link";
    openOptions.textContent = "Open options";
    openOptions.addEventListener("click", () => chrome.runtime.openOptionsPage());
    box.appendChild(openOptions);
  }

  return box;
}

function renderEmailMeta(email: ExtractedEmail): HTMLElement {
  const meta = document.createElement("div");
  meta.className = "meta-row";

  const subjectLine = document.createElement("div");
  subjectLine.className = "meta-subject";
  subjectLine.textContent = email.subject || "(no subject)";
  meta.appendChild(subjectLine);

  const senderLine = document.createElement("div");
  senderLine.className = "meta-sender";
  senderLine.textContent = `${email.sender.displayName} <${email.sender.email}>`;
  meta.appendChild(senderLine);

  return meta;
}

function renderBar(fraction: number): HTMLElement {
  const track = document.createElement("div");
  track.className = "bar-track";
  const fill = document.createElement("div");
  fill.className = "bar-fill";
  fill.style.width = `${Math.round(fraction * 100)}%`;
  track.appendChild(fill);
  return track;
}

function renderResult(result: AnalysisResult): HTMLElement {
  const card = document.createElement("div");
  card.className = `verdict-card ${result.verdict}`;

  const head = document.createElement("div");
  head.className = "verdict-head";

  const badge = document.createElement("div");
  badge.className = "verdict-badge";
  badge.appendChild(iconElement(VERDICT_ICON[result.verdict]));
  head.appendChild(badge);

  const text = document.createElement("div");
  text.className = "verdict-text";
  const title = document.createElement("div");
  title.className = "verdict-title";
  title.textContent = VERDICT_COPY[result.verdict];
  text.appendChild(title);
  const subtitle = document.createElement("div");
  subtitle.className = "verdict-subtitle";
  subtitle.textContent = VERDICT_SUBTITLE[result.verdict];
  text.appendChild(subtitle);
  head.appendChild(text);

  card.appendChild(head);

  const scoreRow = document.createElement("div");
  scoreRow.className = "score-row";
  const scoreLabels = document.createElement("div");
  scoreLabels.className = "score-labels";
  const scoreLabel = document.createElement("span");
  scoreLabel.textContent = "Scam score";
  scoreLabels.appendChild(scoreLabel);
  const scoreValue = document.createElement("strong");
  scoreValue.textContent = `${Math.round(result.scamScore * 100)}%`;
  scoreLabels.appendChild(scoreValue);
  scoreRow.appendChild(scoreLabels);
  scoreRow.appendChild(renderBar(result.scamScore));
  card.appendChild(scoreRow);

  const wrap = document.createElement("div");
  wrap.appendChild(card);

  if (result.signals.length > 0) {
    const section = document.createElement("div");
    section.className = "signals-section";

    const heading = document.createElement("div");
    heading.className = "signals-heading";
    heading.textContent = "What we checked";
    section.appendChild(heading);

    for (const signal of result.signals) {
      const row = document.createElement("div");
      row.className = "signal-row";
      if (signal.probability >= SUSPICIOUS_NOUL_THRESHOLD) row.classList.add("high");

      const top = document.createElement("div");
      top.className = "signal-row-top";
      const label = document.createElement("span");
      label.className = "signal-label";
      label.textContent = signal.label;
      top.appendChild(label);
      const pct = document.createElement("span");
      pct.className = "signal-pct";
      pct.textContent = `${Math.round(signal.probability * 100)}%`;
      top.appendChild(pct);
      row.appendChild(top);
      row.appendChild(renderBar(signal.probability));

      section.appendChild(row);
    }

    wrap.appendChild(section);
  }

  return wrap;
}

async function handleCheckClick(tabId: number, content: HTMLElement): Promise<void> {
  content.textContent = "";
  content.appendChild(renderLoadingCard("Reading email…"));

  let email: ExtractedEmail;
  try {
    const response = (await chrome.tabs.sendMessage(tabId, {
      type: "EXTRACT_EMAIL",
    })) as ExtractEmailResponse;

    if (!response.ok) {
      content.textContent = "";
      content.appendChild(renderError(response.error));
      content.appendChild(renderIdleCard(tabId, content));
      return;
    }
    email = response.email;
  } catch {
    content.textContent = "";
    content.appendChild(renderError("Reload the Gmail tab and try again."));
    content.appendChild(renderIdleCard(tabId, content));
    return;
  }

  content.textContent = "";
  content.appendChild(renderEmailMeta(email));
  content.appendChild(renderLoadingCard("Asking TypeSafe…"));

  try {
    const analyzeResponse = (await chrome.runtime.sendMessage({
      type: "ANALYZE_EMAIL",
      email,
    })) as AnalyzeEmailResponse;

    content.textContent = "";
    content.appendChild(renderEmailMeta(email));
    if (!analyzeResponse.ok) {
      content.appendChild(renderError(analyzeResponse.error));
    } else {
      content.appendChild(renderResult(analyzeResponse.result));
    }
    content.appendChild(renderCheckAgainButton(tabId, content));
  } catch (err) {
    content.textContent = "";
    content.appendChild(renderEmailMeta(email));
    content.appendChild(
      renderError(err instanceof Error ? err.message : "Something went wrong.")
    );
    content.appendChild(renderCheckAgainButton(tabId, content));
  }
}

async function init(): Promise<void> {
  root.textContent = "";
  root.appendChild(renderHeader());

  const content = document.createElement("div");
  content.className = "content";
  root.appendChild(content);

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const url = tab?.url ?? "";

  if (!url.startsWith(GMAIL_URL_PREFIX) || tab?.id === undefined) {
    content.appendChild(renderEmptyState());
    return;
  }

  content.appendChild(renderIdleCard(tab.id, content));
}

void init();

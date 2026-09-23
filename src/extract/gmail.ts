import type { EmailLink, ExtractedEmail } from "../shared/types";

const BODY_CHAR_CAP = 15_000;
// Elements Gmail uses to hide quoted/trimmed thread history inside a message body.
const QUOTE_SELECTOR = ".adL, .gmail_quote";
// Block-level tags whose boundaries should become paragraph breaks in the plain text.
const BLOCK_SELECTOR = "div, p, tr, li, table";

function pickMessageRoot(main: Element): { root: Element; bodyEl: Element } | null {
  const candidates = Array.from(main.querySelectorAll("[data-message-id]"));
  // Most recent expanded message is the last one in document order that has a body.
  for (let i = candidates.length - 1; i >= 0; i--) {
    const bodyEl = candidates[i].querySelector(".a3s");
    if (bodyEl) return { root: candidates[i], bodyEl };
  }
  return null;
}

function extractSender(messageRoot: Element): { displayName: string; email: string } | null {
  const senderEl = messageRoot.querySelector("span.gD[email]");
  if (!senderEl) return null;
  const email = senderEl.getAttribute("email") ?? "";
  if (!email) return null;
  const displayName = senderEl.getAttribute("name") ?? senderEl.textContent?.trim() ?? "";
  return { displayName, email };
}

function findReplyTo(messageRoot: Element, senderEmail: string): string | undefined {
  // Gmail's "show details" panel renders a label/value pair; the label is a leaf
  // node containing only text like "Reply-To:", so matching on isolated textContent
  // (rather than a class name, which changes) finds it without matching an ancestor
  // that also contains the value text.
  const nodes = messageRoot.querySelectorAll("*");
  for (const node of nodes) {
    if (!/^reply-to:?$/i.test(node.textContent?.trim() ?? "")) continue;
    const value = node.nextElementSibling?.textContent?.trim();
    if (value && value.toLowerCase() !== senderEmail.toLowerCase()) return value;
  }
  return undefined;
}

function bodyPlainText(bodyEl: Element): string {
  const clone = bodyEl.cloneNode(true) as Element;
  clone.querySelectorAll(QUOTE_SELECTOR).forEach((n) => n.remove());
  clone.querySelectorAll("br").forEach((br) => br.replaceWith("\n"));
  clone.querySelectorAll(BLOCK_SELECTOR).forEach((el) => el.after("\n"));
  const raw = clone.textContent ?? "";
  return raw
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line) => line.length > 0)
    .join("\n");
}

function resolveHref(href: string, doc: Document): string {
  const base = doc.baseURI && doc.baseURI !== "about:blank" ? doc.baseURI : "https://mail.google.com/";
  try {
    return new URL(href, base).toString();
  } catch {
    return href;
  }
}

function unwrapGoogleRedirect(href: string): string {
  try {
    const url = new URL(href);
    if (url.hostname.replace(/^www\./, "") === "google.com" && url.pathname === "/url") {
      const q = url.searchParams.get("q");
      if (q) return q;
    }
  } catch {
    // not a valid absolute URL; leave as-is
  }
  return href;
}

function isMailtoToSender(rawHref: string, senderEmail: string): boolean {
  if (!rawHref.toLowerCase().startsWith("mailto:")) return false;
  const address = rawHref.slice("mailto:".length).split("?")[0]?.trim().toLowerCase();
  return address === senderEmail.toLowerCase();
}

function extractLinks(bodyEl: Element, senderEmail: string, doc: Document): EmailLink[] {
  const clone = bodyEl.cloneNode(true) as Element;
  clone.querySelectorAll(QUOTE_SELECTOR).forEach((n) => n.remove());
  const seen = new Set<string>();
  const links: EmailLink[] = [];
  for (const a of clone.querySelectorAll("a[href]")) {
    const rawHref = a.getAttribute("href") ?? "";
    if (!rawHref || isMailtoToSender(rawHref, senderEmail)) continue;
    const href = unwrapGoogleRedirect(resolveHref(rawHref, doc));
    const text = (a.textContent ?? "").trim();
    const key = `${text}\u0000${href}`;
    if (seen.has(key)) continue;
    seen.add(key);
    links.push({ text, href });
  }
  return links;
}

export function extractOpenEmail(doc: Document): ExtractedEmail | null {
  const main = doc.querySelector('div[role="main"]');
  if (!main) return null;

  const picked = pickMessageRoot(main);
  if (!picked) return null;
  const { root: messageRoot, bodyEl } = picked;

  const sender = extractSender(messageRoot);
  if (!sender) return null;

  const subject = main.querySelector('h2[data-thread-perm-id], h2.hP')?.textContent?.trim() ?? "";
  const bodyText = bodyPlainText(bodyEl).slice(0, BODY_CHAR_CAP);
  const links = extractLinks(bodyEl, sender.email, doc);
  // The "show details" reply-to row isn't reliably nested inside the message's
  // [data-message-id] container across Gmail's markup variants, so search the
  // whole main pane rather than just messageRoot.
  const replyTo = findReplyTo(main, sender.email);

  return {
    sender,
    ...(replyTo ? { replyTo } : {}),
    subject,
    bodyText,
    links,
  };
}

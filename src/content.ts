import { extractOpenEmail } from "./extract/gmail";
import type { ExtractEmailResponse } from "./shared/types";

chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
  if (!message || typeof message !== "object" || (message as { type?: unknown }).type !== "EXTRACT_EMAIL") return;

  const email = extractOpenEmail(document);
  const response: ExtractEmailResponse = email
    ? { ok: true, email }
    : { ok: false, error: "No open email found. Open a message in Gmail and try again." };
  sendResponse(response);
});

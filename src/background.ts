import type { AnalyzeEmailRequest, AnalyzeEmailResponse } from "./shared/types";
import { analyzeEmail } from "./analyze/client";
import type { SignalId } from "./analyze/questions";
import { hasRequiredOrigins } from "./shared/permissions";

// First-run nicety: send the user straight to the options page if they have
// no API key stored yet, since the extension is useless without one.
chrome.runtime.onInstalled.addListener(async () => {
  const { apiKey } = await chrome.storage.local.get<{ apiKey?: string }>("apiKey");
  if (!apiKey) chrome.runtime.openOptionsPage();
});

chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
  if (!message || typeof message !== "object" || (message as { type?: unknown }).type !== "ANALYZE_EMAIL") return;
  const request = message as AnalyzeEmailRequest;

  (async () => {
    const { apiKey, disabledSignals } = await chrome.storage.local.get<{
      apiKey?: string;
      disabledSignals?: SignalId[];
    }>(["apiKey", "disabledSignals"]);
    if (!apiKey) {
      const response: AnalyzeEmailResponse = {
        ok: false,
        error: "Add your TypeSafe API key in Fishy's options first.",
      };
      sendResponse(response);
      return;
    }

    if (!(await hasRequiredOrigins())) {
      const response: AnalyzeEmailResponse = {
        ok: false,
        error: "Fishy needs permission to reach api.typesafe.ai and Gmail. Grant it in Fishy's options.",
      };
      sendResponse(response);
      return;
    }

    try {
      const result = await analyzeEmail(request.email, apiKey, disabledSignals ?? []);
      const response: AnalyzeEmailResponse = { ok: true, result };
      sendResponse(response);
    } catch (err) {
      const response: AnalyzeEmailResponse = {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      };
      sendResponse(response);
    }
  })();

  return true; // keep the message channel open for the async response
});

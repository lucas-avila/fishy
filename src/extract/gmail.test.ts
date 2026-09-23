import { describe, expect, it } from "vitest";
import { extractOpenEmail } from "./gmail";
import normalEmailHtml from "./__fixtures__/normal-email.html?raw";
import phishingEmailHtml from "./__fixtures__/phishing-email.html?raw";
import inboxListHtml from "./__fixtures__/inbox-list.html?raw";

function parse(html: string): Document {
  return new DOMParser().parseFromString(html, "text/html");
}

describe("extractOpenEmail", () => {
  it("extracts a normal email", () => {
    const doc = parse(normalEmailHtml);
    const email = extractOpenEmail(doc);

    expect(email).not.toBeNull();
    expect(email?.sender).toEqual({ displayName: "Jane Doe", email: "jane.doe@example.com" });
    expect(email?.subject).toBe("Quarterly report attached");
    // Reply-To equals sender email, so it must be omitted.
    expect(email?.replyTo).toBeUndefined();
    expect(email?.bodyText).toBe(
      "Hi team,\nPlease find the quarterly report attached.\nLet me know if you have questions.",
    );
    // Quoted history under .gmail_quote/.adL must not leak into the body.
    expect(email?.bodyText).not.toContain("Previous message content");
    expect(email?.links).toEqual([{ text: "quarterly report", href: "https://example.com/report.pdf" }]);
  });

  it("extracts a phishing-style email with mismatched sender and a disguised link", () => {
    const doc = parse(phishingEmailHtml);
    const email = extractOpenEmail(doc);

    expect(email).not.toBeNull();
    expect(email?.sender).toEqual({
      displayName: "PayPal Security Team",
      email: "security@paypa1-support.com",
    });
    expect(email?.subject).toBe("Urgent: Verify your account now");
    // Reply-To differs from the sender address, a classic phishing signal.
    expect(email?.replyTo).toBe("support@totally-not-a-scam.ru");
    // Repeated whitespace collapses to single spaces.
    expect(email?.bodyText).toContain("Dear Customer,");
    expect(email?.bodyText).toContain("We detected unusual activity. Please verify your account immediately.");
    // The two identical google.com/url redirect links dedupe to one, unwrapped to the real destination.
    expect(email?.links).toEqual([{ text: "verify your account", href: "https://paypa1-verify.com/login" }]);
    // mailto: link that points back at the sender's own address is dropped as noise.
    expect(email?.links.some((l) => l.href.startsWith("mailto:"))).toBe(false);
  });

  it("returns null when no email is open (e.g. inbox list view)", () => {
    const doc = parse(inboxListHtml);
    expect(extractOpenEmail(doc)).toBeNull();
  });

  it("returns null when div[role=main] itself is missing", () => {
    const doc = new DOMParser().parseFromString("<div>nothing here</div>", "text/html");
    expect(extractOpenEmail(doc)).toBeNull();
  });

  it("caps the body text at ~15k characters", () => {
    const longLine = "a".repeat(20_000);
    const html = `<div role="main">
      <h2 class="hP">Long email</h2>
      <div data-message-id="msg-3">
        <span class="gD" email="long@example.com" name="Long Sender"></span>
        <div class="a3s aiL"><div>${longLine}</div></div>
      </div>
    </div>`;
    const doc = new DOMParser().parseFromString(html, "text/html");
    const email = extractOpenEmail(doc);
    expect(email?.bodyText.length).toBeLessThanOrEqual(15_000);
  });

  it("picks the last expanded message when a thread has several", () => {
    const html = `<div role="main">
      <h2 class="hP">Thread with replies</h2>
      <div data-message-id="msg-old">
        <span class="gD" email="first@example.com" name="First Sender"></span>
        <div class="a3s aiL"><div>Original message.</div></div>
      </div>
      <div data-message-id="msg-new">
        <span class="gD" email="second@example.com" name="Second Sender"></span>
        <div class="a3s aiL"><div>Latest reply.</div></div>
      </div>
    </div>`;
    const doc = new DOMParser().parseFromString(html, "text/html");
    const email = extractOpenEmail(doc);
    expect(email?.sender.email).toBe("second@example.com");
    expect(email?.bodyText).toBe("Latest reply.");
  });
});

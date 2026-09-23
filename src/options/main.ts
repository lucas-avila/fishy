import { SIGNAL_DESCRIPTIONS, SIGNAL_LABELS, type SignalId } from "../analyze/questions";
import { hasRequiredOrigins, requestRequiredOrigins } from "../shared/permissions";

const STATUS_CLEAR_DELAY_MS = 2000;

const SIGNAL_IDS = Object.keys(SIGNAL_LABELS) as SignalId[];

const app = document.getElementById("app");
if (!app) throw new Error("missing #app");
app.textContent = "";

const page = document.createElement("div");
page.className = "page";
app.appendChild(page);

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
  logo.width = 28;
  logo.height = 28;
  logo.alt = "";
  logo.className = "header-logo";
  header.appendChild(logo);

  header.appendChild(renderWordmark());

  return header;
}

function renderPermissionCallout(): {
  callout: HTMLElement;
  grantButton: HTMLButtonElement;
  deniedNote: HTMLElement;
} {
  const callout = document.createElement("div");
  callout.className = "callout callout-warning";

  const heading = document.createElement("h3");
  heading.textContent = "Permission needed";
  callout.appendChild(heading);

  const description = document.createElement("p");
  description.textContent =
    "Fishy needs access to api.typesafe.ai (to analyze emails) and mail.google.com (to read the open email).";
  callout.appendChild(description);

  const grantButton = document.createElement("button");
  grantButton.type = "button";
  grantButton.className = "btn-primary";
  grantButton.textContent = "Grant access";
  callout.appendChild(grantButton);

  const deniedNote = document.createElement("p");
  deniedNote.className = "note";
  callout.appendChild(deniedNote);

  const firefoxNote = document.createElement("p");
  firefoxNote.className = "note";
  firefoxNote.textContent = "In Firefox, this can also be changed under about:addons > Fishy > Permissions.";
  callout.appendChild(firefoxNote);

  return { callout, grantButton, deniedNote };
}

function renderApiKeyCard(): {
  card: HTMLElement;
  input: HTMLInputElement;
  saveButton: HTMLButtonElement;
  statusText: HTMLElement;
} {
  const card = document.createElement("div");
  card.className = "card";

  const heading = document.createElement("h2");
  heading.textContent = "API key";
  card.appendChild(heading);

  const label = document.createElement("label");
  label.textContent = "TypeSafe API key";
  label.htmlFor = "api-key";
  card.appendChild(label);

  const row = document.createElement("div");
  row.className = "row";

  const input = document.createElement("input");
  input.type = "password";
  input.id = "api-key";
  input.autocomplete = "off";
  row.appendChild(input);

  const toggleButton = document.createElement("button");
  toggleButton.type = "button";
  toggleButton.className = "btn-secondary";
  toggleButton.textContent = "Show";
  toggleButton.addEventListener("click", () => {
    const showing = input.type === "text";
    input.type = showing ? "password" : "text";
    toggleButton.textContent = showing ? "Show" : "Hide";
  });
  row.appendChild(toggleButton);

  card.appendChild(row);

  const saveRow = document.createElement("div");
  saveRow.className = "save-row";

  const saveButton = document.createElement("button");
  saveButton.type = "button";
  saveButton.className = "btn-primary";
  saveButton.textContent = "Save";
  saveRow.appendChild(saveButton);

  const statusText = document.createElement("span");
  statusText.className = "status";
  saveRow.appendChild(statusText);

  card.appendChild(saveRow);
  card.appendChild(renderPrivacyCallout());

  return { card, input, saveButton, statusText };
}

function renderPrivacyCallout(): HTMLElement {
  const callout = document.createElement("div");
  callout.className = "callout";

  const heading = document.createElement("h3");
  heading.textContent = "What leaves your browser";
  callout.appendChild(heading);

  const intro = document.createElement("p");
  intro.textContent =
    "When you click Check this email, Fishy sends the open email's contents below to api.typesafe.ai, together with your API key in the request header, to get an assessment.";
  callout.appendChild(intro);

  const list = document.createElement("ul");
  const fields = [
    "Sender name and address",
    "Reply-to address, if present",
    "Subject line",
    "Body text",
    "Links found in the email",
  ];
  for (const field of fields) {
    const li = document.createElement("li");
    li.textContent = field;
    list.appendChild(li);
  }
  callout.appendChild(list);

  const outro = document.createElement("p");
  outro.textContent =
    "That's it: there's no Fishy server and nothing is used for analytics. Your API key and these preferences are stored only in this browser's extension storage.";
  callout.appendChild(outro);

  return callout;
}

function renderSwitch(id: string, checked: boolean, onChange: (checked: boolean) => void): HTMLElement {
  const wrap = document.createElement("label");
  wrap.className = "switch";

  const input = document.createElement("input");
  input.type = "checkbox";
  input.id = id;
  input.checked = checked;
  input.addEventListener("change", () => onChange(input.checked));
  wrap.appendChild(input);

  const track = document.createElement("span");
  track.className = "switch-track";
  wrap.appendChild(track);

  return wrap;
}

function renderAssessmentsCard(disabledSignals: Set<SignalId>): HTMLElement {
  const card = document.createElement("div");
  card.className = "card";

  const heading = document.createElement("h2");
  heading.textContent = "Assessments";
  card.appendChild(heading);

  const list = document.createElement("div");
  list.className = "signal-list";

  for (const id of SIGNAL_IDS) {
    const item = document.createElement("div");
    item.className = "signal-item";

    const text = document.createElement("div");
    text.className = "signal-item-text";
    const title = document.createElement("div");
    title.className = "signal-item-title";
    title.textContent = SIGNAL_LABELS[id];
    text.appendChild(title);
    const desc = document.createElement("div");
    desc.className = "signal-item-desc";
    desc.textContent = SIGNAL_DESCRIPTIONS[id];
    text.appendChild(desc);
    item.appendChild(text);

    const switchEl = renderSwitch(`signal-${id}`, !disabledSignals.has(id), async (checked) => {
      if (checked) {
        disabledSignals.delete(id);
      } else {
        disabledSignals.add(id);
      }
      await chrome.storage.local.set({ disabledSignals: [...disabledSignals] });
    });
    item.appendChild(switchEl);

    list.appendChild(item);
  }

  card.appendChild(list);

  const note = document.createElement("p");
  note.className = "note";
  note.textContent =
    "Turning an assessment off means it won't be sent to TypeSafe and won't count toward the verdict. The overall scam score always runs.";
  card.appendChild(note);

  return card;
}

async function init(): Promise<void> {
  page.appendChild(renderHeader());

  if (!(await hasRequiredOrigins())) {
    const { callout, grantButton, deniedNote } = renderPermissionCallout();
    grantButton.addEventListener("click", async () => {
      const granted = await requestRequiredOrigins();
      if (granted) {
        callout.remove();
      } else {
        deniedNote.textContent = "Permission was not granted.";
      }
    });
    page.appendChild(callout);
  }

  const { card, input, saveButton, statusText } = renderApiKeyCard();
  page.appendChild(card);

  let clearStatusTimer: ReturnType<typeof setTimeout> | undefined;
  const flashStatus = (message: string) => {
    statusText.textContent = message;
    clearTimeout(clearStatusTimer);
    clearStatusTimer = setTimeout(() => {
      statusText.textContent = "";
    }, STATUS_CLEAR_DELAY_MS);
  };

  saveButton.addEventListener("click", async () => {
    await chrome.storage.local.set({ apiKey: input.value.trim() });
    flashStatus("Saved");
  });

  const stored = await chrome.storage.local.get<{
    apiKey?: string;
    disabledSignals?: SignalId[];
  }>(["apiKey", "disabledSignals"]);
  if (typeof stored.apiKey === "string") input.value = stored.apiKey;

  const disabledSignals = new Set<SignalId>(stored.disabledSignals ?? []);
  page.appendChild(renderAssessmentsCard(disabledSignals));
}

void init();

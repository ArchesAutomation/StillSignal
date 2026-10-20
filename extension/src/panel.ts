import { APP_ORIGIN } from "./config";
import type { State } from "./state";
const $ = (id: string) => document.getElementById(id)!;
const send = async (payload: unknown) => {
  const r = await chrome.runtime.sendMessage({ target: "worker", payload });
  if (r?.error) $("error").textContent = r.error;
  await render();
  return r;
};
let current: State | undefined,
  rendering = false;
async function render() {
  if (rendering) return;
  rendering = true;
  try {
    const s = (await chrome.runtime.sendMessage({
      target: "worker",
      payload: { type: "state" },
    })) as State & { wakeAvailable: boolean };
    current = s;
    if (!s || (s.error && !("outbox" in s))) {
      return;
    }
    $("identity").textContent =
      s.credential?.identity ?? "Connect your Still Signal account";
    $("status").textContent = s.status;
    $("status").classList.toggle(
      "live",
      s.status === "Recording" || s.wakeEnabled,
    );
    $("error").textContent = s.error ?? "";
    const select = $("sessions") as HTMLSelectElement;
    select.replaceChildren(new Option("Choose a journal", ""));
    for (const session of s.sessions)
      select.add(
        new Option(
          session.name +
            " · " +
            new Date(session.startedAt).toLocaleDateString(),
          session.id,
        ),
      );
    select.value = s.selectedId ?? "";
    select.disabled =
      !!s.active || (!!s.review && !/^switch to\s+/i.test(s.transcript ?? ""));
    const chosen = s.sessions.find((x) => x.id === s.selectedId);
    const instrumentSelect = $("instrument") as HTMLSelectElement,
      accountSelect = $("account") as HTMLSelectElement;
    instrumentSelect.replaceChildren(
      new Option("Whole journal · all instruments", ""),
    );
    accountSelect.replaceChildren(
      new Option("Whole journal · all accounts", ""),
    );
    const seenInstruments = new Set<string>(),
      seenAccounts = new Set<string>();
    for (const e of chosen?.events ?? []) {
      const id = e.instrument?.id ?? e.symbol;
      if (!seenInstruments.has(id)) {
        instrumentSelect.add(new Option(e.symbol, id));
        seenInstruments.add(id);
      }
      const a = e.broker?.accountId ?? e.account;
      if (a && !seenAccounts.has(a)) {
        accountSelect.add(new Option(e.account ?? a, a));
        seenAccounts.add(a);
      }
    }
    if (s.scope?.instrumentId && !seenInstruments.has(s.scope.instrumentId))
      instrumentSelect.add(
        new Option(
          s.scope.instrumentId + " · selected in dashboard",
          s.scope.instrumentId,
        ),
      );
    if (s.scope?.accountId && !seenAccounts.has(s.scope.accountId))
      accountSelect.add(
        new Option(
          s.scope.accountId + " · selected in dashboard",
          s.scope.accountId,
        ),
      );
    instrumentSelect.value = s.scope?.instrumentId ?? "";
    accountSelect.value = s.scope?.accountId ?? "";
    instrumentSelect.disabled = accountSelect.disabled =
      !!s.active || !!s.review;
    const instruments = [...new Set(chosen?.events.map((e) => e.symbol))];
    const accounts = [
      ...new Set(
        chosen?.events
          .map((e) => e.account || e.broker?.accountId)
          .filter(Boolean),
      ),
    ];
    $("context").textContent =
      (instruments.length
        ? instruments.join(", ")
        : "No measured instrument context") +
      (accounts.length
        ? " · " + accounts.join(", ")
        : " · No measured account context");
    ($("pinned") as HTMLInputElement).checked = s.pinned;
    $("mic").textContent =
      s.status === "Recording" ? "● Recording…" : "● Record a reflection";
    ($("mic") as HTMLButtonElement).disabled =
      !s.credential || !!s.active || !!s.review;
    $("controls").hidden = !s.active && !s.review;
    ($("stop") as HTMLButtonElement).disabled = s.status !== "Recording";
    $("transcript").textContent =
      s.transcript ||
      (s.status === "Recording"
        ? "Listening. Stop when you finish; your reflection saves automatically."
        : "Your words will appear here after transcription.");
    $("review-box").hidden = !s.review;
    const input = $("review-text") as HTMLTextAreaElement;
    if (document.activeElement !== input) input.value = s.transcript ?? "";
    $("latest").textContent = s.latest
      ? new Date(s.latest.t).toLocaleTimeString() +
        " · " +
        s.latest.label +
        "\n" +
        s.latest.text
      : "No reflection saved in this journal yet.";
    $("saved-actions").hidden = !s.latest;
    $("pause").textContent = s.promptsPaused
      ? "Resume prompts"
      : "Pause prompts";
    ($("wake") as HTMLInputElement).checked = s.wakeEnabled;
    ($("wake") as HTMLInputElement).disabled = !s.wakeAvailable;
    $("wake-info").textContent = s.wakeAvailable
      ? "Local wake detection. Only activated speech is sent for transcription."
      : "Hey Journal is unavailable until the licensed custom model is installed and tested.";
    ($("auto") as HTMLInputElement).checked = s.autoRespond;
    $("shortcut").textContent = s.shortcut
      ? "Recording shortcut: " + s.shortcut
      : "Shortcut unassigned or conflicting. Configure it in Chrome.";
    $("prompt").hidden = !s.prompt;
    $("queue").textContent = s.outbox
      .filter((p) => p.destination.userId === s.credential?.userId)
      .map((p) =>
        p.blocked
          ? "Needs review: " + p.blocked
          : "Queued on this device · " +
            (p.mutation.kind === "create"
              ? p.mutation.note.text
              : p.mutation.kind),
      )
      .join("\n");
    const pending = $("pending");
    pending.replaceChildren();
    for (const item of s.outbox.filter((p) => !!p.blocked)) {
      const card = document.createElement("div"),
        text = document.createElement("p");
      text.className = "words";
      text.textContent =
        item.mutation.kind === "create"
          ? new Date(item.mutation.note.t).toLocaleString() +
            " · " +
            item.mutation.note.text
          : item.mutation.kind + " needs review in the dashboard";
      card.append(text);
      if (item.mutation.kind === "create") {
        const move = document.createElement("button");
        move.textContent = "Save in a new journal at the original time";
        move.onclick = () =>
          void send({
            type: "pending-move",
            requestId: item.destination.requestId,
          });
        card.append(move);
      }
      const discard = document.createElement("button");
      discard.textContent = "Discard this pending action";
      discard.onclick = () =>
        void send({
          type: "pending-discard",
          requestId: item.destination.requestId,
        });
      card.append(discard);
      pending.append(card);
    }
    $("disconnect").hidden = !s.credential;
    $("connect").hidden = !!s.credential;
  } finally {
    rendering = false;
  }
}
$("connect").onclick = () => void send({ type: "connect" });
for (const id of ["instrument", "account"])
  $(id).onchange = () =>
    void send({
      type: "scope",
      instrumentId: ($("instrument") as HTMLSelectElement).value,
      accountId: ($("account") as HTMLSelectElement).value,
    });
$("disconnect").onclick = () => void send({ type: "disconnect" });
$("mic").onclick = () => void send({ type: "start", activationAt: Date.now() });
$("stop").onclick = () => void send({ type: "stop" });
$("cancel").onclick = () => void send({ type: "cancel" });
$("new-journal").onclick = () => void send({ type: "new-journal" });
$("sessions").onchange = () => {
  const id = ($("sessions") as HTMLSelectElement).value;
  if (id)
    void send({
      type: "select",
      id,
      pinned: ($("pinned") as HTMLInputElement).checked,
    });
};
$("pinned").onchange = () => {
  if (current?.selectedId)
    void send({
      type: "select",
      id: current.selectedId,
      pinned: ($("pinned") as HTMLInputElement).checked,
    });
};
document
  .querySelectorAll<HTMLButtonElement>("[data-emotion]")
  .forEach(
    (b) =>
      (b.onclick = () =>
        void send({ type: "emotion", label: b.dataset.emotion })),
  );
$("pause").onclick = () =>
  void send({ type: "pause", paused: !current?.promptsPaused });
$("wake").onchange = () =>
  void send({ type: "wake", enabled: ($("wake") as HTMLInputElement).checked });
$("auto").onchange = () =>
  void send({
    type: "auto-respond",
    enabled: ($("auto") as HTMLInputElement).checked,
  });
$("dashboard").onclick = () => void chrome.tabs.create({ url: APP_ORIGIN });
$("microphone").onclick = () =>
  void chrome.tabs.create({ url: chrome.runtime.getURL("setup.html") });
$("shortcuts").onclick = () =>
  void chrome.tabs.create({ url: "chrome://extensions/shortcuts" });
$("refresh").onclick = () => void send({ type: "refresh" });
$("retry").onclick = () => void send({ type: "retry" });
$("save-review").onclick = () =>
  void send({
    type: "review",
    text: ($("review-text") as HTMLTextAreaElement).value,
  });
$("undo").onclick = () => void send({ type: "undo" });
$("correct").onclick = () => {
  $("correction-box").hidden = false;
  ($("correction-text") as HTMLTextAreaElement).value =
    current?.latest?.text ?? "";
};
$("save-correction").onclick = () => {
  void send({
    type: "correct",
    text: ($("correction-text") as HTMLTextAreaElement).value,
  });
  $("correction-box").hidden = true;
};
$("answer").onclick = () =>
  void send({ type: "start", activationAt: Date.now(), hr: true });
$("snooze").onclick = () => void send({ type: "snooze" });
chrome.runtime.onMessage.addListener((m) => {
  if (m?.target === "panel" && m.type === "changed") void render();
});
window.addEventListener("online", () => void send({ type: "retry" }));
void render();
void send({ type: "refresh" });

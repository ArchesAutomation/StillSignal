import { useRef, useState } from "react";
import type { ProcessStore } from "../command-center/use-process";
import type { StillnessBrowse } from "../stillness-library";
import { supportFocus } from "@/lib/process/journal-guide";
import { bigFour, createRecord, dateInZone, type SupportFocus } from "@/lib/process/model";
import { readProcess } from "@/lib/process/storage";
import { emptyTradingDay, tradingDayFor } from "@/lib/process/trading-day";
import { catalogue } from "@/lib/stillness-catalogue";
import type { Page } from "./shared";

const destinations = [
  ["Pre-Market", "Preparation", "A short check-in, your chosen support and an intention to return to.", "◒"],
  ["Journal", "Your journal", "Return to your reflections, recordings and the evidence behind each moment.", "▤"],
  ["Trade Quality", "Done for the day", "Review how you traded and choose how to close the day.", "◐"],
] as const;

export default function ReadingRoomHome({
  owner, now, store, onPage, onBrowse, onWeek,
}: {
  owner: string;
  now: number;
  store: ProcessStore;
  onPage: (page: Page) => void;
  onBrowse: (browse: StillnessBrowse) => void;
  onWeek: () => void;
}) {
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const date = dateInZone(now, timezone);
  const day = tradingDayFor(store.records, date, timezone);
  const selected = day?.body.supportFocuses ?? [];
  const tags: string[] = selected.map((focus) => supportFocus[focus].title);
  const featured = catalogue.find((item) => item.tags.some((tag) => tags.includes(tag))) ?? catalogue[0];
  const supportCount = day?.body.stillness?.filter((item) => item.destination === "Preparation").length ?? 0;
  const writing = useRef(false);
  const [saving, setSaving] = useState(false);

  async function toggle(focus: SupportFocus) {
    if (writing.current) return;
    writing.current = true;
    setSaving(true);
    store.setError("");
    try {
      const current = tradingDayFor(await readProcess(owner), date, timezone);
      const before = current?.body.supportFocuses ?? [];
      const after = before.includes(focus) ? before.filter((item) => item !== focus) : [...before, focus];
      await store.save([
        createRecord("day", {
          ...(current?.body ?? emptyTradingDay(date, timezone)),
          supportFocuses: after,
        }, current),
      ]);
    } catch (error) {
      store.setError(error instanceof Error ? error.message : "Could not save today’s support choices.");
    } finally {
      writing.current = false;
      setSaving(false);
    }
  }

  const browse = () => onBrowse({ tags, itemId: featured.id });
  return (
    <div className="rr-home">
      <section className="rr-home-hero">
        <div>
          <p className="rr-home-date">{new Intl.DateTimeFormat("en-GB", { dateStyle: "full", timeZone: timezone }).format(now)}</p>
          <h1>A little room for you.</h1>
          <p>Less noise. More space to notice what matters.</p>
          <div className="rr-home-actions">
            <button className="ss-primary" onClick={() => onPage("Pre-Market")}>Begin preparation <span aria-hidden="true">↗</span></button>
            <button onClick={browse}>Explore Stillness <span aria-hidden="true">→</span></button>
          </div>
        </div>
        <div className="rr-home-art" aria-hidden="true"><i /><i /><i /><span>✳</span></div>
      </section>

      <section className="rr-home-focus" aria-labelledby="rr-home-focus">
        <h2 id="rr-home-focus">What would you like support with during trading?</h2>
        <p>Choose any of the Big 4 you’d like to keep in mind today.</p>
        <div className="rr-home-actions" role="group" aria-label="Big 4 support for today">
          {bigFour.map((focus) => (
            <button key={focus} aria-pressed={selected.includes(focus)} disabled={!store.loaded || saving || store.busy} onClick={() => void toggle(focus)}>
              {selected.includes(focus) && <span aria-hidden="true">✓ </span>}{supportFocus[focus].title}
            </button>
          ))}
        </div>
        {store.error && <p role="alert">{store.error}</p>}
      </section>

      <section className="rr-home-day" aria-labelledby="rr-home-day">
        <h2 id="rr-home-day">A rhythm for your day</h2>
        <div className="rr-home-grid">
          {destinations.map(([page, title, description, icon]) => (
            <button className="rr-home-card" key={page} onClick={() => onPage(page)}>
              <span className="rr-home-icon" aria-hidden="true">{icon}</span>
              <strong>{title}</strong>
              <span>{description}</span>
              <span className="rr-home-card-end">
                {page === "Pre-Market" && supportCount > 0 ? `${supportCount} ${supportCount === 1 ? "choice" : "choices"} for today` : ""}
                <span aria-hidden="true">↗</span>
              </span>
            </button>
          ))}
        </div>
      </section>

      <div className="rr-home-lower">
        <section className="rr-home-feature">
          <h2>{featured.name}</h2>
          <p>{featured.desc}</p>
          <button onClick={browse}>Preview in Stillness <span aria-hidden="true">→</span></button>
        </section>
        <section className="rr-home-week">
          <h2>What supported you?</h2>
          <p>A gentle look back at the moments you chose to keep.</p>
          <button onClick={onWeek}>Open weekly reflection <span aria-hidden="true">→</span></button>
        </section>
      </div>
    </div>
  );
}

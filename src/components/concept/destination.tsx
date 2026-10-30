"use client";
import JournalSelect from "./journal-select";
import type { JournalEntry, Session } from "@/lib/model";
import {
  isTradeSection,
  sections,
  sectionName,
  sessionTrades,
} from "@/lib/journal-routing";
import { cx, time } from "./shared";
export default function Destination({
  session,
  section,
  tradeId,
  custom,
  onSection,
  onTrade,
  onCustom,
  timezone,
}: {
  session: Session;
  section: JournalEntry["section"];
  tradeId: string;
  custom: string;
  onSection: (value: JournalEntry["section"]) => void;
  onTrade: (value: string) => void;
  onCustom: (value: string) => void;
  timezone?: string;
}) {
  return (
    <div className={cx("destinations")}>
      <label>
        Journal stage
        <JournalSelect
          aria-label="Journal section"
          value={section === "stillness" ? "" : section || ""}
          onChange={(e) =>
            onSection((e.target.value as JournalEntry["section"]) || undefined)
          }
        >
          <option value="">Neutral day reflection</option>
          {sections.map((value) => (
            <option value={value} key={value}>
              {sectionName(value)}
            </option>
          ))}
        </JournalSelect>
      </label>
      <label>
        Trade
        <JournalSelect
          aria-label="Journal trade"
          value={tradeId}
          onChange={(e) => onTrade(e.target.value)}
        >
          <option value="">
            {isTradeSection(section)
              ? "Choose a trade"
              : "Whole day · no trade required"}
          </option>
          {sessionTrades(session).map((trade, index) => (
            <option key={trade.id} value={trade.id}>
              Trade {index + 1} · {trade.symbol} · {time(trade.entry, false, timezone || session.timezone)}
            </option>
          ))}
        </JournalSelect>
      </label>
      {section === "custom" && (
        <label>
          Section name
          <input
            aria-label="Custom journal section"
            value={custom}
            maxLength={80}
            onChange={(e) => onCustom(e.target.value)}
          />
        </label>
      )}
    </div>
  );
}

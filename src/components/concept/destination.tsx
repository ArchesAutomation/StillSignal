"use client";
import type { JournalEntry, Session } from "@/lib/model";
import { isTradeSection, sections, sectionName, sessionTrades } from "@/lib/journal-routing";
import { cx, time } from "./shared";
export default function Destination({ session, section, tradeId, custom, onSection, onTrade, onCustom }: {
  session: Session; section: JournalEntry["section"]; tradeId: string; custom: string;
  onSection: (value: JournalEntry["section"]) => void;
  onTrade: (value: string) => void; onCustom: (value: string) => void;
}) {
  return <div className={cx("destinations")}>
    <label>Journal stage<select aria-label="Journal section" value={section === "stillness" ? "" : section || ""} onChange={e => onSection(e.target.value as JournalEntry["section"] || undefined)}>
      <option value="">Unsorted · assign later</option>
      {sections.map(value => <option value={value} key={value}>{sectionName(value)}</option>)}
    </select></label>
    <label>Trade<select aria-label="Journal trade" value={tradeId} onChange={e => onTrade(e.target.value)}>
      <option value="">{isTradeSection(section) ? "Choose a trade" : "Whole day / unassigned"}</option>
      {sessionTrades(session).map((trade, index) => <option key={trade.id} value={trade.id}>Trade {index + 1} · {trade.symbol} · {time(trade.entry, false)}</option>)}
    </select></label>
    {section === "custom" && <label>Section name<input aria-label="Custom journal section" value={custom} maxLength={80} onChange={e => onCustom(e.target.value)} /></label>}
  </div>;
}

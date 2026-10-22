"use client";
import type { JournalEntry, Session } from "@/lib/model";
import { isTradeSection, sections, sectionName, sessionTrades } from "@/lib/journal-routing";
import { cx, time } from "./shared";
export default function Destination({ session, section, tradeId, custom, onSection, onTrade, onCustom }: {
  session: Session; section: JournalEntry["section"]; tradeId: string; custom: string;
  onSection: (value: NonNullable<JournalEntry["section"]>) => void;
  onTrade: (value: string) => void; onCustom: (value: string) => void;
}) {
  return <div className={cx("destinations")}>
    <label>Journal section<select aria-label="Journal section" value={section || ""} onChange={e => onSection(e.target.value as NonNullable<JournalEntry["section"]>)}>
      <option value="" disabled>Choose a section</option>
      {sections.map(value => <option value={value} key={value}>{sectionName(value)}</option>)}
    </select></label>
    {isTradeSection(section) && <label>Trade<select aria-label="Journal trade" value={tradeId} onChange={e => onTrade(e.target.value)}>
      <option value="">Choose a trade</option>
      {sessionTrades(session).map((trade, index) => <option key={trade.id} value={trade.id}>Trade {index + 1} · {trade.symbol} · {time(trade.entry, false)}</option>)}
    </select></label>}
    {section === "custom" && <label>Section name<input aria-label="Custom journal section" value={custom} maxLength={80} onChange={e => onCustom(e.target.value)} /></label>}
  </div>;
}

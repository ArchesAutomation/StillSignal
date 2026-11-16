import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BOOK_PAGE,
  BOOK_SILVER_LINING,
  bookText,
  isBookEntry,
  isJournalMarker,
  splitPassages,
  syncPassages,
} from "../src/lib/journal-book";
import { filterMoments } from "../src/lib/journal-space";
import type { JournalEntry, Session } from "../src/lib/model";

const ids = () => {
  let n = 0;
  return () => `id-${++n}`;
};

test("long journal pages split into passages that rejoin exactly", () => {
  const paragraph = "I felt FOMO when price ran without me. ".repeat(30);
  const text = `${paragraph}\n\n${paragraph}\n\n${paragraph}`;
  const parts = splitPassages(text);
  assert.ok(parts.length > 1);
  assert.ok(parts.every((p) => p.length <= 2000));
  assert.equal(parts.join(""), text);
  assert.deepEqual(splitPassages("short"), ["short"]);
  const unbroken = "x".repeat(4500);
  assert.equal(splitPassages(unbroken).join(""), unbroken);
});

test("syncing a page reuses entries, adds passages and soft-deletes leftovers", () => {
  const makeId = ids();
  const long = "Name it. ".repeat(500);
  const first = syncPassages({ existing: [], text: long, part: BOOK_PAGE, now: 1000, makeId });
  assert.ok(first.length >= 2);
  assert.ok(first.every((n) => isBookEntry(n) && n.eventTime === null && n.section === "day-review"));
  const shorter = syncPassages({ existing: first, text: "One transaction.", part: BOOK_PAGE, now: 2000, makeId });
  assert.equal(shorter[0].id, first[0].id);
  assert.equal(shorter[0].text, "One transaction.");
  assert.ok(shorter.slice(1).every((n) => n.deletedAt === 2000 && n.text === ""));
  const unchanged = syncPassages({ existing: [shorter[0]], text: "One transaction.", part: BOOK_PAGE, now: 3000, makeId });
  assert.equal(unchanged.length, 0);
  const cleared = syncPassages({ existing: [shorter[0]], text: "   ", part: BOOK_PAGE, now: 4000, makeId });
  assert.equal(cleared[0].deletedAt, 4000);
});

test("book passages read back as one page and stay out of Day in Action", () => {
  const makeId = ids();
  const page = syncPassages({ existing: [], text: "Today doesn't define me.", part: BOOK_PAGE, now: 10, makeId });
  const lining = syncPassages({ existing: [], text: "I stepped away.", part: BOOK_SILVER_LINING, now: 11, makeId });
  const live: JournalEntry = { id: "live", t: 5, label: "Unlabelled", text: "Price ran", captureMode: "live" };
  const session = { journal: [live, ...page, ...lining] } as unknown as Session;
  assert.equal(bookText(session, BOOK_PAGE), "Today doesn't define me.");
  assert.equal(bookText(session, BOOK_SILVER_LINING), "I stepped away.");
  const moments = filterMoments(session, { search: "", trade: "", stage: "", capture: "" });
  assert.deepEqual(moments.map((n) => n.id), ["live"]);
});

test("mid-session writing times only the first page passage, so Day in Action shows one marker", () => {
  const makeId = ids();
  const long = "Wrote while charged. ".repeat(200);
  const live = syncPassages({ existing: [], text: long, part: BOOK_PAGE, now: 50, makeId, liveAt: 50 });
  assert.equal(live.filter(isJournalMarker).length, 1);
  assert.equal(live[0].eventTime, 50);
  assert.ok(live.slice(1).every((n) => n.eventTime === null));
  const lining = syncPassages({ existing: [], text: "Named it.", part: BOOK_SILVER_LINING, now: 60, makeId, liveAt: 60 });
  assert.equal(lining.filter(isJournalMarker).length, 0);
  const after = syncPassages({ existing: [], text: "Evening page.", part: BOOK_PAGE, now: 70, makeId });
  assert.equal(after.filter(isJournalMarker).length, 0);
});

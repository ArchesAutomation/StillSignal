"use client";
import { clock, type Session } from "@/lib/model";
import { liveNotes } from "@/lib/smart-journal";
export default function TodayReview({
  sessions,
  owner,
  onOpen,
  onClose,
}: {
  sessions: Session[];
  owner: string;
  onOpen: (session: Session) => void;
  onClose: () => void;
}) {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  const entries = sessions
    .filter((s) => s.owner === owner)
    .flatMap((s) =>
      liveNotes(s.journal)
        .filter((n) => n.t >= +start && n.t < +end)
        .map((note) => ({ session: s, note })),
    )
    .sort((a, b) => a.note.t - b.note.t);
  return (
    <section
      className="glass content-panel"
      aria-label="Today's journal review"
    >
      <div className="panel-heading">
        <div>
          <h2>Today’s review</h2>
          <p>
            {start.toLocaleDateString()} · {entries.length} self-reported
            reflections across your journals
          </p>
        </div>
        <button className="button" onClick={onClose}>
          Back to selected journal
        </button>
      </div>
      <div className="journal-grid">
        {entries.map(({ session, note }) => (
          <article className="journal-card" key={session.id + note.id}>
            <div>
              <span className="journal-label">{note.label}</span>
              <time>{clock(note.t)}</time>
            </div>
            <p>{note.text}</p>
            <button className="text-button" onClick={() => onOpen(session)}>
              {session.name} ↗
            </button>
          </article>
        ))}
      </div>
      {!entries.length && <p>No reflections recorded today.</p>}
    </section>
  );
}

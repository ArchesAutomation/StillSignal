"use client";
import {
  ArrowUpRight,
  ArrowRight,
  BookOpen,
  Activity,
  History,
} from "lucide-react";
import { type Session } from "@/lib/model";
import {
  personalQuestion,
  liveNotes,
  type personalProfile,
} from "@/lib/smart-journal";
import { isActualExecution } from "@/lib/trade-context";
import SignalCalendar from "./signal-calendar";

export default function SignalOverview({
  sessions,
  session,
  profile,
  recording,
  onOpen,
  onJournal,
  onPatterns,
  onReflect,
}: {
  sessions: Session[];
  session: Session;
  profile: ReturnType<typeof personalProfile>;
  recording: boolean;
  onOpen: (s: Session) => void;
  onJournal: () => void;
  onPatterns: () => void;
  onReflect: () => void;
}) {
  const owned = sessions.filter((s) => s.id !== "workspace");
  const executions = owned.reduce(
    (n, s) => n + s.events.filter(isActualExecution).length,
    0,
  );
  const recent = owned
    .flatMap((s) => liveNotes(s.journal).map((note) => ({ s, note })))
    .sort((a, b) => b.note.t - a.note.t)
    .slice(0, 3);
  const recurring = profile.patterns.find((p) => p.label !== "Other");
  return (
    <div className="signal-overview">
      <div className="overview-lead">
        <section className="meaning">
          <div className="eyebrow">AWARENESS BEFORE ACTION</div>
          <h2>
            You are the signal
            <br />
            behind your choices<span className="orange">.</span>
          </h2>
          <p>
            Bring your trading activity, bodily changes, and your own words into
            view. Notice what deserves your attention.
          </p>
          <button className="button primary" onClick={onJournal}>
            Open your journal <ArrowUpRight size={15} />
          </button>
        </section>
        <aside className="question-card">
          <span className="eyebrow">A QUESTION TO SIT WITH</span>
          <BookOpen size={20} />
          <h3>
            {personalQuestion(
              profile,
              session.events,
              session.endedAt || Date.now(),
            )}
          </h3>
          <p>Your interpretation gives the record its meaning.</p>
          <button className="text-button" onClick={onReflect}>
            Make space for a reflection <ArrowRight size={14} />
          </button>
        </aside>
      </div>
      <div className="section-heading">
        <div>
          <h2>A little perspective.</h2>
          <p>Grounded in the history you have recorded.</p>
        </div>
        <button className="text-button" onClick={onPatterns}>
          Explore patterns <ArrowUpRight size={14} />
        </button>
      </div>
      <div className="story-grid">
        <article className="story-card">
          <History size={17} />
          <span>Sessions recorded</span>
          <strong>{owned.length.toString().padStart(2, "0")}</strong>
          <p>{executions} execution events across your saved history.</p>
          <button className="text-button" onClick={onJournal}>
            Return to the timeline <ArrowRight size={13} />
          </button>
        </article>
        <article className="story-card">
          <BookOpen size={17} />
          <span>Moments with meaning</span>
          <strong>{profile.count.toString().padStart(2, "0")}</strong>
          <p>
            Reflections in your own words. Each one adds context a sensor
            cannot.
          </p>
          <button className="text-button" onClick={onReflect}>
            Capture a moment <ArrowRight size={13} />
          </button>
        </article>
        <article className="story-card">
          <Activity size={17} />
          <span>Your most recorded label</span>
          <strong className="word-value">
            {recurring?.label || "Still unfolding"}
          </strong>
          <p>
            {recurring
              ? `${recurring.count} self-reported reflections · ${recurring.elevated} with HR at least 10 BPM above baseline.`
              : "Your labels will appear here as you build your journal."}
          </p>
          <button className="text-button" onClick={onPatterns}>
            Inspect the evidence <ArrowRight size={13} />
          </button>
        </article>
      </div>
      <SignalCalendar
        key={session.id}
        sessions={owned}
        selected={session}
        recording={recording}
        month
        onOpen={onOpen}
      />
      <div className="section-heading">
        <div>
          <h2>Your words, revisited.</h2>
          <p>Recent reflections across your sessions.</p>
        </div>
      </div>
      {recent.length ? (
        <div className="recent-reflections">
          {recent.map(({ s, note }) => (
            <button
              className="recent-reflection"
              key={note.id + s.id}
              disabled={recording && session.id !== s.id}
              onClick={() => onOpen(s)}
            >
              <span className="eyebrow">
                {new Date(note.t).toLocaleDateString([], {
                  month: "short",
                  day: "numeric",
                })}{" "}
                · {note.label}
              </span>
              <p>{note.text || "A moment marked for reflection."}</p>
              <span className="text-button">
                Revisit session <ArrowUpRight size={13} />
              </span>
            </button>
          ))}
        </div>
      ) : (
        <div className="quiet-empty">
          <BookOpen size={22} />
          <h3>Your first reflection starts the story.</h3>
          <p>There is nothing to catch up on. Begin with what you notice.</p>
          <button className="button" onClick={onReflect}>
            Add reflection
          </button>
        </div>
      )}
    </div>
  );
}

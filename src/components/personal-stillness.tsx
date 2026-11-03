"use client";
import { useEffect, useRef, useState } from "react";
import type { JournalProfile } from "@/lib/process/journal-guide";
import { keepRoutineAudio, privateFile } from "@/lib/private-files";
import { Field } from "./command-center/shared";
type Element = JournalProfile["stillness"][number];
export function RoutineAudio({ path, owner }: { path: string; owner: string }) {
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true,
      objectUrl = "";
    void privateFile(path, owner)
      .then((blob) => {
        objectUrl = URL.createObjectURL(blob);
        if (active) setUrl(objectUrl);
        else URL.revokeObjectURL(objectUrl);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [path, owner]);
  return url ? (
    <audio controls src={url} aria-label="Your saved message" />
  ) : (
    <p role="status">{error || "Loading your recording…"}</p>
  );
}
export function StillnessBuilder({
  value,
  onChange,
  owner,
}: {
  value: Element[];
  onChange: (value: Element[]) => void;
  owner: string;
}) {
  const [recording, setRecording] = useState(false),
    [error, setError] = useState("");
  const recorder = useRef<MediaRecorder | null>(null),
    stream = useRef<MediaStream | null>(null);
  const timeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined),
    alive = useRef(true),
    current = useRef(value);
  current.current = value;
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      clearTimeout(timeout.current);
      if (recorder.current?.state === "recording") recorder.current.stop();
      stream.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);
  async function record() {
    setError("");
    try {
      if (
        !navigator.mediaDevices?.getUserMedia ||
        typeof MediaRecorder === "undefined"
      )
        throw Error(
          "Recording is unavailable in this browser. You can save your own words instead.",
        );
      const input = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!alive.current) {
        input.getTracks().forEach((t) => t.stop());
        return;
      }
      stream.current = input;
      const media = new MediaRecorder(input);
      recorder.current = media;
      const chunks: Blob[] = [];
      media.ondataavailable = (event) => {
        if (event.data.size) chunks.push(event.data);
      };
      media.onstop = async () => {
        input.getTracks().forEach((t) => t.stop());
        clearTimeout(timeout.current);
        if (!alive.current) return;
        setRecording(false);
        try {
          const audioPath = await keepRoutineAudio(
            owner,
            new Blob(chunks, { type: media.mimeType }),
          );
          if (alive.current)
            onChange([
              ...current.current,
              {
                id: crypto.randomUUID(),
                kind: "audio",
                content: "A message from me",
                context: "any",
                audioPath,
              },
            ]);
        } catch (e) {
          if (alive.current) setError((e as Error).message);
        }
      };
      media.start();
      setRecording(true);
      timeout.current = setTimeout(() => media.stop(), 120000);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <div className="guide-stillness-builder">
      <p>
        What would you want to hear from yourself after a result? Choose and
        order the elements that help you pause.
      </p>
      {value.map((item, i) => (
        <fieldset key={item.id} className="guide-routine-element">
          <legend>
            {i + 1}. {item.kind === "audio" ? "My recording" : item.kind}
          </legend>
          <Field
            label={item.kind === "words" ? "My words" : "Instructions / prompt"}
          >
            <textarea
              maxLength={8000}
              value={item.content}
              onChange={(e) =>
                onChange(
                  value.map((el) =>
                    el.id === item.id ? { ...el, content: e.target.value } : el,
                  ),
                )
              }
            />
          </Field>
          <Field label="Offer this element when I choose">
            <select
              value={item.context}
              onChange={(e) =>
                onChange(
                  value.map((el) =>
                    el.id === item.id
                      ? { ...el, context: e.target.value as Element["context"] }
                      : el,
                  ),
                )
              }
            >
              <option value="any">Any context</option>
              <option value="profit">A profit</option>
              <option value="loss">A loss</option>
              <option value="uncomfortable">I feel uncomfortable</option>
            </select>
          </Field>
          {item.audioPath && (
            <RoutineAudio path={item.audioPath} owner={owner} />
          )}
          <div className="cc-actions">
            <button
              type="button"
              disabled={i === 0}
              onClick={() => {
                const next = [...value];
                [next[i - 1], next[i]] = [next[i], next[i - 1]];
                onChange(next);
              }}
            >
              Move up
            </button>
            <button
              type="button"
              disabled={i === value.length - 1}
              onClick={() => {
                const next = [...value];
                [next[i + 1], next[i]] = [next[i], next[i + 1]];
                onChange(next);
              }}
            >
              Move down
            </button>
            <button
              type="button"
              onClick={() => onChange(value.filter((el) => el.id !== item.id))}
            >
              Remove element
            </button>
          </div>
        </fieldset>
      ))}
      <div className="cc-actions">
        {(["breathing", "grounding", "words"] as const).map((kind) => (
          <button
            key={kind}
            type="button"
            disabled={value.length >= 12 || recording}
            onClick={() =>
              onChange([
                ...value,
                {
                  id: crypto.randomUUID(),
                  kind,
                  context: "any",
                  content:
                    kind === "breathing"
                      ? "Breathe gently at a comfortable pace. Stop or switch whenever you like."
                      : kind === "grounding"
                        ? "Notice the room around you. What is one thing you can see, hear and feel?"
                        : "",
                },
              ])
            }
          >
            + {kind === "words" ? "My words" : kind}
          </button>
        ))}
        <button
          type="button"
          disabled={value.length >= 12}
          onClick={() => (recording ? recorder.current?.stop() : void record())}
        >
          {recording ? "Stop & save recording" : "Record a message"}
        </button>
      </div>
      <small>
        Recordings stay on this device. Words and routine choices sync with your
        saved routine. Recording stops after two minutes.
      </small>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
export default function PersonalStillness({
  elements,
  owner,
}: {
  elements: Element[];
  owner: string;
}) {
  const [context, setContext] = useState<Element["context"]>("any"),
    [index, setIndex] = useState(0),
    [running, setRunning] = useState(false);
  const selected = elements.filter(
    (el) => el.context === "any" || el.context === context,
  );
  const current = selected[Math.min(index, Math.max(0, selected.length - 1))];
  return (
    <section className="guide-personal-stillness">
      <span className="cc-eyebrow">Your own stillness routine</span>
      <h2>A message from you, for you</h2>
      <Field label="Choose the context, if useful">
        <select
          value={context}
          onChange={(e) => {
            setContext(e.target.value as Element["context"]);
            setIndex(0);
            setRunning(false);
          }}
        >
          <option value="any">No particular result</option>
          <option value="profit">A profit</option>
          <option value="loss">A loss</option>
          <option value="uncomfortable">I feel uncomfortable</option>
        </select>
      </Field>
      {!running ? (
        <button
          type="button"
          className="cc-primary"
          disabled={!selected.length}
          onClick={() => {
            setIndex(0);
            setRunning(true);
          }}
        >
          Preview / play my routine
        </button>
      ) : current ? (
        <div key={current.id}>
          <small>
            Element {index + 1} of {selected.length} · {current.kind}
          </small>
          <p className="guide-own-words">{current.content}</p>
          {current.audioPath && (
            <RoutineAudio path={current.audioPath} owner={owner} />
          )}
          <div className="cc-actions">
            <button type="button" onClick={() => setRunning(false)}>
              Stop
            </button>
            <button
              type="button"
              disabled={index === 0}
              onClick={() => setIndex((i) => i - 1)}
            >
              Previous
            </button>
            <button
              type="button"
              onClick={() =>
                index + 1 < selected.length
                  ? setIndex((i) => i + 1)
                  : setRunning(false)
              }
            >
              {index + 1 < selected.length
                ? "Next / skip element"
                : "Finish routine"}
            </button>
          </div>
        </div>
      ) : (
        <p>
          No elements match that context. You can choose another or continue
          journalling.
        </p>
      )}
      <p className="cc-muted">
        Choose what fits your experience. You can stop or journal at any time.
      </p>
    </section>
  );
}

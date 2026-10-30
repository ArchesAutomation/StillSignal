"use client";
import { useEffect, useRef, useState } from "react";
import {
  keepPrivateFile,
  privateFile,
  removePrivateFile,
} from "@/lib/private-files";
import type { JournalEntry } from "@/lib/model";

export function AudioPlayback({
  audio,
  owner,
  onDelete,
}: {
  audio: NonNullable<JournalEntry["audio"]>;
  owner: string;
  onDelete?: () => Promise<void>;
}) {
  const [url, setUrl] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    let live = true,
      objectUrl = "";
    const expires = setTimeout(
      () => {
        if (!live) return;
        if (objectUrl) URL.revokeObjectURL(objectUrl);
        setUrl("");
        setError("The audio retention period has ended.");
        void removePrivateFile(audio.path, owner).catch(() => {});
      },
      Math.max(0, audio.expiresAt - Date.now()),
    );
    void privateFile(audio.path, owner)
      .then((blob) => {
        objectUrl = URL.createObjectURL(blob);
        if (live) setUrl(objectUrl);
        else URL.revokeObjectURL(objectUrl);
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
      clearTimeout(expires);
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [audio.path, owner]);
  return (
    <div className="ss-audio-playback">
      {url && (
        <audio
          controls
          preload="metadata"
          src={url}
          aria-label="Original reflection audio"
        />
      )}
      {url && (
        <a
          href={url}
          download={
            "still-signal-original-audio." +
            (audio.mimeType.includes("mp4") ? "mp4" : "webm")
          }
        >
          Download original audio
        </a>
      )}
      <small>
        {error ||
          `Original audio · this device · expires ${new Date(audio.expiresAt).toLocaleDateString()}`}
      </small>
      {onDelete && (
        <button
          type="button"
          className="ss-textlink"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await removePrivateFile(audio.path, owner);
              await onDelete();
              setUrl("");
              setError("Original audio deleted. Transcript kept.");
            } catch (e) {
              setError(
                e instanceof Error ? e.message : "Could not delete audio.",
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          Delete original audio
        </button>
      )}
    </div>
  );
}

export default function AudioCapture({
  owner,
  sessionId,
  onAudio,
  onRecording,
}: {
  owner: string;
  sessionId?: string;
  onAudio: (audio: JournalEntry["audio"]) => void;
  onRecording: (active: boolean) => void;
}) {
  const [consent, setConsent] = useState(false),
    [recording, setRecording] = useState(false),
    [status, setStatus] = useState("");
  const recorder = useRef<MediaRecorder | null>(null),
    stream = useRef<MediaStream | null>(null),
    started = useRef(0),
    timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const savedPath = useRef(""),
    mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      clearTimeout(timer.current);
      if (recorder.current?.state === "recording") recorder.current.stop();
      stream.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);
  async function begin() {
    try {
      if (!consent) return;
      const media = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!mounted.current) {
        media.getTracks().forEach((t) => t.stop());
        return;
      }
      stream.current = media;
      const type = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find(
        (t) => MediaRecorder.isTypeSupported(t),
      );
      const rec = new MediaRecorder(
          media,
          type ? { mimeType: type } : undefined,
        ),
        chunks: BlobPart[] = [];
      rec.ondataavailable = (e) => {
        if (e.data.size) chunks.push(e.data);
      };
      rec.onstop = async () => {
        clearTimeout(timer.current);
        media.getTracks().forEach((t) => t.stop());
        if (!mounted.current) return;
        setRecording(false);
        try {
          const blob = new Blob(chunks, { type: rec.mimeType });
          if (!blob.size || blob.size > 10_000_000)
            throw new Error(
              "Recording is empty or exceeds 10 MB. Record a shorter reflection.",
            );
          const saved = await keepPrivateFile(
            owner,
            crypto.randomUUID(),
            "audio",
            blob,
            sessionId,
          );
          if (savedPath.current)
            await removePrivateFile(savedPath.current, owner);
          savedPath.current = saved.path;
          onAudio({
            path: saved.path,
            expiresAt: saved.expiresAt!,
            durationSeconds: Math.min(
              600,
              (Date.now() - started.current) / 1000,
            ),
            mimeType: rec.mimeType,
          });
          setStatus(
            "Original recorded. Save your reflection to keep it alongside the transcript.",
          );
        } catch (e) {
          setStatus(e instanceof Error ? e.message : "Could not save audio.");
        } finally {
          onRecording(false);
        }
      };
      recorder.current = rec;
      started.current = Date.now();
      rec.start(1000);
      setRecording(true);
      onRecording(true);
      setStatus(
        "Recording original audio. You can also start dictation for a transcript.",
      );
      timer.current = setTimeout(
        () => rec.state === "recording" && rec.stop(),
        600000,
      );
    } catch {
      setStatus(
        "Microphone unavailable. Allow access or keep a transcript-only reflection.",
      );
      stream.current?.getTracks().forEach((t) => t.stop());
    }
  }
  return (
    <div className="ss-audio-capture">
      <label>
        <input
          type="checkbox"
          checked={consent}
          disabled={recording}
          onChange={(e) => setConsent(e.target.checked)}
        />{" "}
        Save original audio on this device for 7 days
      </label>
      <small>
        Optional and separate from dictation. Audio stays on this device, is
        unavailable after 7 days and is removed the next time you open Still
        Signal. You can delete it earlier.
      </small>
      {consent && (
        <button
          type="button"
          className="button"
          onClick={() => (recording ? recorder.current?.stop() : void begin())}
        >
          {recording ? "Stop original recording" : "Record original audio"}
        </button>
      )}
      <span role="status">{status}</span>
    </div>
  );
}

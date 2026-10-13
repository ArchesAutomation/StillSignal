"use client";
import { useEffect, useRef, useState } from "react";
import { Mic, X } from "lucide-react";
import type { HrMoment } from "@/lib/smart-journal";
import type { Settings } from "@/lib/model";
import type { ReflectionDraft } from "./reflection-editor";

export default function SmartCheckins({
  owner,
  sessionId,
  settings,
  recording,
  now,
  latestSampleTime,
  moments,
  blocked,
  onOpen,
}: {
  owner: string;
  sessionId: string;
  settings: Settings;
  recording: boolean;
  now: number;
  latestSampleTime?: number;
  moments: HrMoment[];
  blocked: boolean;
  onOpen: (draft: ReflectionDraft) => void;
}) {
  const [prompt, setPrompt] = useState<HrMoment | null>(null),
    [audioError, setAudioError] = useState("");
  const seen = useRef(new Set<string>()),
    last = useRef(0),
    snooze = useRef(0),
    audio = useRef<AudioContext | null>(null),
    speakingTimer = useRef<ReturnType<typeof setTimeout> | null>(null),
    callback = useRef(onOpen),
    busy = useRef(blocked);
  callback.current = onOpen;
  busy.current = blocked;
  useEffect(() => {
    seen.current.clear();
    last.current = snooze.current = 0;
    setPrompt(null);
  }, [owner, sessionId]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (
        e.altKey &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.shiftKey &&
        !e.repeat &&
        e.key.toLowerCase() === settings.shortcutKey.toLowerCase() &&
        !busy.current
      ) {
        e.preventDefault();
        callback.current({ t: Date.now(), source: "voice", autoListen: true });
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [settings.shortcutKey]);
  useEffect(() => {
    // A real user gesture unlocks audio without ever opening the microphone.
    const unlock = () => {
      if (
        settings.sound &&
        !audio.current &&
        typeof AudioContext !== "undefined"
      ) {
        audio.current = new AudioContext();
        void audio.current.resume().catch(() => {});
      }
    };
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, [settings.sound]);
  useEffect(() => {
    const event = moments.at(-1);
    if (!settings.alerts || !recording || !event || seen.current.has(event.id))
      return;
    // Mark expired events seen, so reconnecting/replaying cannot announce old data.
    if (
      !latestSampleTime ||
      now - latestSampleTime > 10000 ||
      now - event.t > 10000 ||
      now < event.t
    ) {
      seen.current.add(event.id);
      return;
    }
    seen.current.add(event.id);
    if (
      blocked ||
      prompt ||
      now < snooze.current ||
      now - last.current < settings.cooldownSeconds * 1000
    )
      return;
    last.current = now;
    setPrompt(event);
    if (settings.sound) {
      const ctx = audio.current;
      if (ctx?.state === "running") {
        const osc = ctx.createOscillator(),
          gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = 660;
        gain.gain.setValueAtTime(0.08, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
        osc.start();
        osc.stop(ctx.currentTime + 0.22);
      } else
        setAudioError(
          "Click anywhere in Trade Pulse to enable check-in sounds.",
        );
    }
    if (
      settings.spokenPrompt &&
      typeof SpeechSynthesisUtterance !== "undefined"
    ) {
      speakingTimer.current = setTimeout(
        () => {
          window.speechSynthesis?.speak(
            new SpeechSynthesisUtterance(
              "Hey, what's going on? What are you feeling?",
            ),
          );
        },
        settings.sound ? 300 : 0,
      );
    }
  }, [
    moments,
    now,
    latestSampleTime,
    recording,
    settings.alerts,
    settings.sound,
    settings.spokenPrompt,
    settings.cooldownSeconds,
    blocked,
    prompt,
  ]);
  useEffect(() => {
    if (
      !recording ||
      !settings.alerts ||
      (latestSampleTime && now - latestSampleTime > 10000)
    )
      setPrompt(null);
    if (!recording || !settings.alerts || !settings.spokenPrompt) {
      if (speakingTimer.current) clearTimeout(speakingTimer.current);
      window.speechSynthesis?.cancel();
    }
  }, [
    recording,
    settings.alerts,
    settings.spokenPrompt,
    latestSampleTime,
    now,
  ]);
  useEffect(
    () => () => {
      if (speakingTimer.current) clearTimeout(speakingTimer.current);
      window.speechSynthesis?.cancel();
      void audio.current?.close();
    },
    [],
  );
  function dismiss() {
    setPrompt(null);
    if (speakingTimer.current) clearTimeout(speakingTimer.current);
    window.speechSynthesis?.cancel();
  }
  if (!prompt) return null;
  return (
    <aside
      className="smart-checkin glass"
      role="status"
      aria-label="Heart-rate check-in"
    >
      <div>
        <span className="eyebrow">A MOMENT TO CHECK IN</span>
        <h3>Hey, what’s going on? What are you feeling?</h3>
        <p>
          Your HR rose {Math.round(prompt.delta)} BPM above your opening
          baseline. Add your own context.
        </p>
        {audioError && <p>{audioError}</p>}
      </div>
      <div className="inline-actions">
        <button
          className="button primary"
          disabled={blocked}
          onClick={() => {
            callback.current({
              t: prompt.t,
              source: "hr-checkin",
              hrEventId: prompt.id,
              autoListen: true,
            });
            dismiss();
          }}
        >
          <Mic size={15} /> Answer
        </button>
        <button
          className="button"
          onClick={() => {
            snooze.current = Date.now() + 600000;
            dismiss();
          }}
        >
          Snooze 10 min
        </button>
        <button
          className="icon-button"
          aria-label="Dismiss check-in"
          onClick={dismiss}
        >
          <X size={17} />
        </button>
      </div>
    </aside>
  );
}

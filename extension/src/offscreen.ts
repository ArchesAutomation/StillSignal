import { Porcupine } from "@picovoice/porcupine-web";
import { audioWrite, audioRemove, type AudioRecord } from "./audio-store";
import { WAKE_CONFIG } from "./config";
import type { Destination } from "./state";
let stream: MediaStream | undefined,
  recorder: MediaRecorder | undefined,
  active: Destination | undefined;
let audio: AudioRecord | undefined,
  writing = Promise.resolve(),
  timer: ReturnType<typeof setTimeout> | undefined;
let wake: Porcupine | undefined,
  ctx: AudioContext | undefined,
  node: AudioWorkletNode | undefined,
  wakeOn = false;
let captureBusy = false,
  cancelled = false,
  wakeBusy = false;
const send = (type: string, data: unknown = {}) =>
  chrome.runtime.sendMessage({ target: "worker", type, data }).catch(() => {});
function stopTracks() {
  stream?.getTracks().forEach((t) => t.stop());
  stream = undefined;
}
async function wakeStop() {
  wakeOn = false;
  node?.disconnect();
  node = undefined;
  await ctx?.close();
  ctx = undefined;
  await wake?.release();
  wake = undefined;
  stopTracks();
}
async function wakeStart() {
  if (!WAKE_CONFIG.available)
    throw new Error(
      "Hey Journal needs a licensed Web WASM model and AccessKey. Use the microphone or shortcut.",
    );
  await wakeStop();
  wake = await Porcupine.create(
    WAKE_CONFIG.accessKey,
    {
      publicPath: chrome.runtime.getURL("wake/hey-journal.ppn"),
      label: "Hey Journal",
      sensitivity: 0.6,
    },
    () => {
      if (wakeOn && !captureBusy) {
        wakeOn = false;
        void send("wake-detected", { activationAt: Date.now() });
      }
    },
    { publicPath: chrome.runtime.getURL("wake/porcupine_params.pv") },
    {
      device: "cpu:1",
      processErrorCallback: (e) =>
        void send("capture-error", { error: String(e) }),
    },
  );
  ctx = new AudioContext({ sampleRate: wake.sampleRate });
  await ctx.resume();
  if (ctx.sampleRate !== wake.sampleRate)
    throw new Error("Wake engine sample rate is unsupported on this device.");
  await ctx.audioWorklet.addModule(chrome.runtime.getURL("wake-worklet.js"));
  stream = await navigator.mediaDevices.getUserMedia({
    audio: { channelCount: 1, echoCancellation: true },
    video: false,
  });
  stream.getAudioTracks().forEach(
    (t) =>
      (t.onended = () => {
        void wakeStop();
        void send("capture-error", {
          error:
            "Microphone access was revoked. Open microphone setup to recover.",
        });
      }),
  );
  node = new AudioWorkletNode(ctx, "wake-frames", {
    processorOptions: { frameLength: wake.frameLength },
  });
  ctx.createMediaStreamSource(stream).connect(node);
  node.connect(ctx.destination);
  node.port.onmessage = (e) => {
    if (wakeOn && !wakeBusy && wake) {
      wakeBusy = true;
      void wake.process(e.data).finally(() => {
        wakeBusy = false;
      });
    }
  };
  wakeOn = true;
}
async function start(destination: Destination) {
  if (captureBusy || active) throw new Error("A recording is already active.");
  captureBusy = true;
  cancelled = false;
  try {
    await wakeStop();
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true },
      video: false,
    });
    if (cancelled) {
      stopTracks();
      captureBusy = false;
      return;
    }
    active = { ...destination, recordingStartedAt: Date.now() };
    const mime = [
      "audio/webm;codecs=opus",
      "audio/ogg;codecs=opus",
      "audio/mp4",
    ].find((m) => MediaRecorder.isTypeSupported(m));
    if (!mime)
      throw new Error("This Chrome version cannot encode microphone audio.");
    audio = {
      id: active.noteId,
      userId: active.userId,
      chunks: [],
      mime: mime.split(";")[0],
      finished: false,
      durationMs: 0,
    };
    await audioWrite(audio);
    recorder = new MediaRecorder(stream, {
      mimeType: mime,
      audioBitsPerSecond: 48000,
    });
    stream.getAudioTracks().forEach(
      (track) =>
        (track.onended = () => {
          cancelled = true;
          recorder?.stop();
          void send("capture-error", {
            error: "Microphone access was revoked. Recording was cancelled.",
          });
        }),
    );
    recorder.ondataavailable = (e) => {
      if (e.data.size && audio) {
        audio.chunks.push(e.data);
        const snapshot = { ...audio, chunks: [...audio.chunks] };
        writing = writing.then(() => audioWrite(snapshot));
        if (audio.chunks.reduce((n, b) => n + b.size, 0) > 2900000)
          void finish(false);
      }
    };
    recorder.onerror = () => {
      cancelled = true;
      void finish(true);
      void send("capture-error", {
        error: "Microphone recording failed. Try microphone setup.",
      });
    };
    recorder.onstop = () => void finalize();
    recorder.start(1000);
    timer = setTimeout(() => void finish(false), 90000);
    void send("capture-started", active);
  } catch (e) {
    captureBusy = false;
    active = undefined;
    stopTracks();
    throw e;
  }
}
async function finalize() {
  clearTimeout(timer);
  stopTracks();
  const destination = active,
    record = audio;
  try {
    await writing;
    if (destination && record) {
      if (cancelled) await audioRemove(destination.noteId);
      else {
        record.finished = true;
        record.durationMs = Math.min(
          90000,
          Date.now() - (destination.recordingStartedAt ?? Date.now()),
        );
        await audioWrite(record);
        void send("capture-finished", destination);
      }
    }
  } catch {
    await send("capture-error", {
      error:
        "Audio could not be saved on this device. Keep the panel open and retry.",
    });
  } finally {
    recorder = undefined;
    active = undefined;
    audio = undefined;
    captureBusy = false;
  }
}
async function finish(cancel: boolean) {
  cancelled = cancel;
  clearTimeout(timer);
  if (recorder?.state === "recording") recorder.stop();
  else if (cancel) {
    await wakeStop();
    stopTracks();
  }
}
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (sender.id !== chrome.runtime.id || message?.target !== "offscreen")
    return;
  const task = async () => {
    if (message.type === "capture-start") await start(message.data);
    else if (message.type === "capture-stop") await finish(false);
    else if (message.type === "capture-cancel") await finish(true);
    else if (message.type === "wake-start") await wakeStart();
    else if (message.type === "wake-stop") await wakeStop();
    else if (message.type === "beep") {
      const a = new AudioContext(),
        o = a.createOscillator(),
        g = a.createGain();
      o.connect(g);
      g.connect(a.destination);
      g.gain.value = 0.05;
      o.frequency.value = 660;
      o.start();
      o.stop(a.currentTime + 0.16);
      o.onended = () => void a.close();
    } else if (message.type === "capture-state")
      return {
        active,
        wakeOn,
        captureBusy,
        liveTracks:
          stream?.getTracks().filter((t) => t.readyState === "live").length ??
          0,
      };
    else throw new Error("Unknown capture command.");
    return { ok: true };
  };
  void task()
    .then(respond)
    .catch((e) => {
      void wakeStop();
      stopTracks();
      respond({
        error:
          e instanceof Error
            ? e.message
            : "Microphone denied. Open microphone setup.",
      });
    });
  return true;
});

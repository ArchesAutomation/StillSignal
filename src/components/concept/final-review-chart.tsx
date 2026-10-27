"use client";
import { useState, useRef } from "react";
import type { Session } from "@/lib/model";
import type { SessionBlueprint } from "@/lib/blueprint-schema";
import { uploadScreenshot, removeScreenshot } from "@/lib/screenshots";
import { cloudConfigured } from "@/lib/cloud";
import EvidenceImage from "./evidence-image";
import { keepPrivateFile, removePrivateFile } from "@/lib/private-files";
import { validateScreenshotFile } from "@/lib/clipboard-screenshot";
import { cx } from "./shared";
export default function FinalReviewChart({
  session,
  ideaId,
  onSave,
  prepare,
}: {
  session: Session;
  ideaId: string;
  onSave: (p: Partial<SessionBlueprint>) => Promise<void>;
  prepare: (t: number) => Promise<string>;
}) {
  const [busy, setBusy] = useState(false),
    [status, setStatus] = useState("");
  const chart = session.blueprint?.finalCharts?.[ideaId];
  const fileInput = useRef<HTMLInputElement>(null);
  async function saveImage(file: File) {
    await validateScreenshotFile(file);
    const asset = cloudConfigured ? await uploadScreenshot(file,session.owner,await prepare(session.startedAt)) : await keepPrivateFile(
      session.owner,
      crypto.randomUUID(),
      "image",
      file,
      session.id,
    );
    try {
      await onSave({
        finalCharts: {
          ...session.blueprint?.finalCharts,
          [ideaId]: {
            path: asset.path,
            name: file.name,
            uploadedAt: Date.now(),
          },
        },
      });
      setStatus("Final review chart saved on this device.");
    } catch (e) {
      if(asset.path.startsWith("local-image:")) await removePrivateFile(asset.path, session.owner).catch(() => {});
      else await removeScreenshot(asset.path).catch(()=>{});
      throw e;
    }
  }
  async function screenshot() {
    setBusy(true);
    let stream: MediaStream | undefined;
    try {
      stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: false,
      });
      const video = document.createElement("video");
      video.srcObject = stream;
      video.muted = true;
      await video.play();
      if (!video.videoWidth)
        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(
            () => reject(Error("Chart did not become ready.")),
            5000,
          );
          video.onloadeddata = () => {
            clearTimeout(timer);
            resolve();
          };
        });
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const context = canvas.getContext("2d");
      if (!context) throw Error("Could not read the chart.");
      context.drawImage(video, 0, 0);
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/png"),
      );
      if (!blob) throw Error("Screenshot could not be encoded.");
      await saveImage(
        new File([blob], "final-annotated-chart.png", { type: "image/png" }),
      );
      video.srcObject = null;
    } catch (e) {
      setStatus(
        e instanceof Error
          ? e.message
          : "Screenshot not captured. You can upload an image instead.",
      );
    } finally {
      stream?.getTracks().forEach((t) => t.stop());
      setBusy(false);
    }
  }
  return (
    <section className={cx("final-review-chart")}>
      <h3>Final annotated chart</h3>
      <p>
        This completed review chart is separate from each moment’s original
        capture.
      </p>
      {chart && (
        <EvidenceImage
          owner={session.owner}
          path={chart.path}
          name="Final annotated chart"
        />
      )}
      <div className={cx("row-actions")}>
        <button disabled={busy} onClick={() => void screenshot()}>
          Take screenshot
        </button>
        <button disabled={busy} onClick={() => fileInput.current?.click()}>
          Upload image
        </button>
      </div>
      <input
        ref={fileInput}
        aria-label={`Final chart for idea ${ideaId}`}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        disabled={busy}
        hidden
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          setBusy(true);
          let uploaded:
            Awaited<ReturnType<typeof uploadScreenshot>> | undefined;
          try {
            await saveImage(file);
          } catch (err) {
            if (uploaded) await removeScreenshot(uploaded.path).catch(() => {});
            setStatus(
              err instanceof Error
                ? err.message
                : "Could not save the final chart.",
            );
          } finally {
            setBusy(false);
            e.target.value = "";
          }
        }}
      />
      {chart && (
        <button
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              const charts = { ...session.blueprint?.finalCharts };
              delete charts[ideaId];
              await onSave({ finalCharts: charts });
              if (chart.path.startsWith("local-image:"))
                await removePrivateFile(chart.path, session.owner);
              else await removeScreenshot(chart.path);
              setStatus(
                "Final chart removed. Original moment captures are kept.",
              );
            } catch (e) {
              setStatus(
                e instanceof Error ? e.message : "Could not remove the chart.",
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          Remove final chart
        </button>
      )}
      <p role="status">{status}</p>
    </section>
  );
}

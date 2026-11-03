"use client";
import { useEffect, useState } from "react";
import { keepPrivateFile } from "@/lib/private-files";
import PrivateImage from "./private-image";
export default function ThesisAttachments({ owner, initial, onChange, draftKey }: { draftKey: string; owner: string; initial: string[]; onChange: (paths: string[]) => void }) {
  const [paths, setPaths] = useState(initial), [busy, setBusy] = useState(false), [status, setStatus] = useState("");
  useEffect(() => { try { const saved = JSON.parse(localStorage.getItem(draftKey) ?? "null"); if (Array.isArray(saved) && saved.length <= 12 && saved.every(p => typeof p === "string" && /^(https:\/\/|local-image:)/.test(p))) { setPaths(saved); onChange(saved); } } catch {} }, [draftKey]);
  const update = (next: string[]) => { setPaths(next); onChange(next); try { localStorage.setItem(draftKey, JSON.stringify(next)); } catch { setStatus("Image draft storage is unavailable. Save your plan before leaving."); } };
  async function add(files: File[]) {
    if (busy) return; setBusy(true); setStatus("Saving chart image on this device…");
    try {
      const next = [...paths];
      for (const file of files) {
        if (next.length >= 12) throw Error("Keep at most 12 screenshots per plan.");
        if (file.size > 5 * 1024 * 1024) throw Error("Choose an image smaller than 5 MB.");
        const head = new Uint8Array(await file.slice(0,12).arrayBuffer());
        if (!(head[0] === 137 && head[1] === 80 && head[2] === 78 && head[3] === 71) && !(head[0] === 255 && head[1] === 216 && head[2] === 255) && !(String.fromCharCode(...head.slice(0,4)) === "RIFF" && String.fromCharCode(...head.slice(8,12)) === "WEBP")) throw Error("Choose a PNG, JPEG or WebP chart image.");
        next.push((await keepPrivateFile(owner, crypto.randomUUID(), "image", file)).path);
      }
      update(next); setStatus("Image saved on this device. Save the plan to attach it. Images remain available when you reopen here.");
    } catch (e) { setStatus((e as Error).message); } finally { setBusy(false); }
  }
  return <section className="guide-thesis-attachments" onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); void add([...e.dataTransfer.files]); }} onPaste={e => { const files = [...e.clipboardData.files]; if (files.length) { e.preventDefault(); void add(files); } }}>
    <label>Add chart screenshot<input type="file" accept="image/png,image/jpeg,image/webp" multiple disabled={busy} onChange={e => void add([...e.target.files ?? []])} /></label><p>Choose a file, drop an image here, or paste from your clipboard. Image files stay on this device; shared links remain available across devices.</p>
    <input type="hidden" name="screenshots" value={paths.join("\n")} />
    <div className="guide-thesis-images">{paths.map((path,i) => <article key={path}>{path.startsWith("local-image:") ? <PrivateImage owner={owner} path={path} name={`Chart screenshot ${i+1}`} /> : <a href={path} target="_blank" rel="noreferrer"><img src={path} alt={`Chart screenshot ${i+1}`} /></a>}<button type="button" onClick={() => update(paths.filter(p => p !== path))}>Remove screenshot {i+1}</button></article>)}</div>
    <details><summary>Use HTTPS screenshot links instead</summary><textarea aria-label="Additional screenshot links" placeholder="One HTTPS link per line" onBlur={e => { const urls = e.target.value.split(/\n/).map(s => s.trim()).filter(Boolean); if (urls.some(url => !/^https:\/\//.test(url))) { setStatus("Use a complete HTTPS link for every image."); return; } const next = [...new Set([...paths, ...urls])]; if (next.length > 12) { setStatus("Keep at most 12 screenshots per plan."); return; } update(next); e.target.value = ""; }} /></details>
    {status && <p role="status">{status}</p>}
  </section>;
}

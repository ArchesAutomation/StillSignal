"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { completedOn } from "@/lib/process/session-review";
import { Field, type Context } from "./command-center/shared";
export default function PnlSnapshot({ day, props }: Context) {
  const canvas = useRef<HTMLCanvasElement>(null),
    [currency, setCurrency] = useState("USD"),
    [selected, setSelected] = useState("all"),
    [label, setLabel] = useState(""),
    [showDate, setShowDate] = useState(true),
    [background, setBackground] = useState(""),
    [error, setError] = useState(""),
    [ready, setReady] = useState(false);
  const ideas = useMemo(
      () =>
        completedOn(
          [...props.history, props.session].filter(
            (s) => s.owner === props.pulse.owner,
          ),
          day.body.date,
          day.body.timezone,
        ),
      [
        props.history,
        props.session,
        props.pulse.owner,
        day.body.date,
        day.body.timezone,
      ],
    ),
    currencies = [...new Set(ideas.map((i) => i.currency))];
  const usedCurrency = currencies.includes(currency)
      ? currency
      : (currencies[0] ?? "USD"),
    chosen = ideas.filter(
      (i) =>
        i.currency === usedCurrency &&
        (selected === "all" || i.id === selected),
    );
  const complete =
      chosen.length > 0 && chosen.every((i) => i.pnl !== undefined),
    total = chosen.reduce((n, i) => n + (i.pnl ?? 0), 0);
  useEffect(() => {
    let alive = true;
    setReady(false);
    const node = canvas.current;
    if (!node) return;
    const ctx = node.getContext("2d");
    if (!ctx) return;
    const draw = async () => {
      const gradient = ctx.createLinearGradient(0, 0, 1000, 600);
      gradient.addColorStop(0, "#132d28");
      gradient.addColorStop(1, "#10141e");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, 1000, 600);
      if (background) {
        const image = new Image();
        image.src = background;
        await image.decode();
        if (!alive) return;
        const scale = Math.max(1000 / image.width, 600 / image.height);
        ctx.drawImage(
          image,
          (1000 - image.width * scale) / 2,
          (600 - image.height * scale) / 2,
          image.width * scale,
          image.height * scale,
        );
        ctx.fillStyle = "#07100bc9";
        ctx.fillRect(0, 0, 1000, 600);
      }
      ctx.fillStyle = "#ffffff0d";
      ctx.beginPath();
      ctx.roundRect(55, 55, 890, 490, 28);
      ctx.fill();
      ctx.strokeStyle = "#bed7c240";
      ctx.stroke();
      ctx.fillStyle = "#b5cabc";
      ctx.font = "20px system-ui";
      ctx.fillText("STILL SIGNAL  /  RECORDED REALISED P&L", 90, 115);
      ctx.fillStyle = "#f3f7ef";
      ctx.font = "68px system-ui";
      ctx.fillText(
        complete
          ? new Intl.NumberFormat("en-US", {
              style: "currency",
              currency: usedCurrency,
            }).format(total)
          : "P&L unavailable",
        90,
        270,
      );
      ctx.font = "24px system-ui";
      ctx.fillText(
        selected === "all"
          ? `${chosen.length} closed trades · ${usedCurrency}`
          : `Selected closed trade · ${usedCurrency}`,
        90,
        330,
      );
      ctx.font = "20px system-ui";
      ctx.fillStyle = "#c3d3c9";
      if (showDate)
        ctx.fillText(`${day.body.date} · ${day.body.timezone}`, 90, 435);
      if (label) ctx.fillText(label.slice(0, 70), 90, 475);
      ctx.font = "16px system-ui";
      ctx.fillText(
        "Saved trade records · excludes open positions · no performance claim",
        90,
        515,
      );
      if (alive) setReady(true);
    };
    void draw().catch(() => {
      if (alive)
        setError("That background could not be loaded. Choose another image.");
    });
    return () => {
      alive = false;
    };
  }, [
    background,
    usedCurrency,
    selected,
    total,
    complete,
    chosen.length,
    day.body.date,
    day.body.timezone,
    label,
    showDate,
  ]);
  useEffect(
    () => () => {
      if (background) URL.revokeObjectURL(background);
    },
    [background],
  );
  return (
    <details className="guide-advanced">
      <summary>Optional: preview a shareable P&amp;L snapshot</summary>
      <p>
        Preview the exact image before exporting. Only saved realised P&amp;L is
        shown; missing values remain unavailable. Your name is blank unless you
        add it.
      </p>
      <div className="cc-grid">
        <Field label="Currency">
          <select
            value={usedCurrency}
            onChange={(e) => {
              setCurrency(e.target.value);
              setSelected("all");
            }}
          >
            {(currencies.length ? currencies : ["USD"]).map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </Field>
        <Field label="Scope">
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
          >
            <option value="all">This selected day</option>
            {ideas
              .filter((i) => i.currency === usedCurrency)
              .map((i) => (
                <option key={i.id} value={i.id}>
                  {i.symbol} · {new Date(i.exit!).toLocaleTimeString()}
                </option>
              ))}
          </select>
        </Field>
        <Field label="Display name / caption (optional)">
          <input
            maxLength={70}
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
        </Field>
        <Field label="Background image (optional)">
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              if (
                file.size > 5 * 1024 * 1024 ||
                !/^image\/(png|jpeg|webp)$/.test(file.type)
              ) {
                setError("Choose a PNG, JPEG or WebP image under 5 MB.");
                return;
              }
              setError("");
              setBackground(URL.createObjectURL(file));
            }}
          />
        </Field>
      </div>
      <label>
        <input
          type="checkbox"
          checked={showDate}
          onChange={(e) => setShowDate(e.target.checked)}
        />{" "}
        Include date and timezone
      </label>
      <button onClick={() => setBackground("")}>
        Use Still Signal background
      </button>
      <canvas
        ref={canvas}
        width={1000}
        height={600}
        style={{
          width: "100%",
          maxWidth: 700,
          height: "auto",
          display: "block",
          margin: "20px 0",
          borderRadius: 18,
        }}
        aria-label="Exact export preview"
      />
      <button
        disabled={!ready || !complete}
        onClick={() =>
          canvas.current?.toBlob((blob) => {
            if (!blob) return;
            const url = URL.createObjectURL(blob),
              a = document.createElement("a");
            a.href = url;
            a.download = `still-signal-${day.body.date}.png`;
            a.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
          }, "image/png")
        }
      >
        Export this preview
      </button>
      {error && <p role="alert">{error}</p>}
    </details>
  );
}

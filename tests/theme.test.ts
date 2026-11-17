import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { themeCss } from "../scripts/generate-theme-css";
import {
  PRESETS, TEXT_PAIRS, TOKEN_NAMES, contrast, derive, parseTheme, palette, mix,
  type CustomColours, type Mode, type Palette,
} from "../src/lib/theme";

const AA = 4.5;
const modes: Mode[] = ["light", "dark"];
const failures = (p: Palette) =>
  TEXT_PAIRS.map(([fg, bg]) => ({ fg, bg, ratio: contrast(p[fg], p[bg]) })).filter(r => r.ratio < AA);

// Small seeded generator so a failing custom colour can be reproduced from the test output.
function rng(seed: number) {
  return () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}
const randomHex = (next: () => number) =>
  "#" + [0, 0, 0].map(() => Math.floor(next() * 256).toString(16).padStart(2, "0")).join("").toUpperCase();

test("Signature and Berry Sky meet WCAG AA text contrast in light and dark", () => {
  for (const [name, preset] of Object.entries(PRESETS))
    for (const mode of modes)
      assert.deepEqual(failures(preset[mode]), [], `${name} ${mode}`);
});

test("approved mockup colours are used exactly for both presets", () => {
  assert.equal(PRESETS.signature.light.accent, "#6A55A3");
  assert.equal(PRESETS.signature.dark.bg, "#1B1922");
  assert.equal(PRESETS.berry.light.doneInk, "#1F4F8C");
  assert.equal(PRESETS.berry.dark.onAccent, "#1C1219");
});

test("Stillness category hues remain consistent and readable on badges and selected filters across themes", () => {
  const colours = ["#000000", "#FFFFFF", "#FF0000", "#00FF00", "#0000FF", "#FFFF00", "#A3326E"];
  const themes = [...Object.values(PRESETS), ...colours.map(accent => derive({ accent, prep: accent, journal: accent, done: accent }))];
  const tokens = ["focusImpulse", "focusWait", "focusFear", "focusGreed"] as const;
  for (const theme of themes) for (const mode of modes) {
    const p = theme[mode];
    for (const token of tokens) for (const tint of [0, 0.1, 0.18])
      assert.ok(contrast(p[token], mix(p.surface, p[token], tint)) >= AA, `${mode} ${token}, tint ${tint}`);
    const rgb = (token: typeof tokens[number]) => [1, 3, 5].map(index => parseInt(p[token].slice(index, index + 2), 16));
    const [red, green, blue] = rgb("focusFear"); assert.ok(red > green && red > blue, "fear remains red");
    const [ir, ig, ib] = rgb("focusImpulse"); assert.ok(ir > ig && ig > ib, "impulsiveness remains orange");
    const [br, bg, bb] = rgb("focusWait"); assert.ok(bb > br && bb > bg, "impatience remains blue");
    const [gr, gg, gb] = rgb("focusGreed"); assert.ok(gg > gr && gg > gb, "greed remains green");
  }
});

test("custom colours always produce readable text, including extreme picks", () => {
  const next = rng(20261112);
  const extremes = ["#000000", "#FFFFFF", "#FFFF00", "#00FFFF", "#808080", "#FF0000", "#0000FF", "#F6F4EF", "#1B1922"];
  const cases: CustomColours[] = [
    ...extremes.map(c => ({ accent: c, prep: c, journal: c, done: c })),
    ...Array.from({ length: 300 }, () => ({ accent: randomHex(next), prep: randomHex(next), journal: randomHex(next), done: randomHex(next) })),
  ];
  for (const custom of cases) {
    const derived = derive(custom);
    for (const mode of modes) assert.deepEqual(failures(derived[mode]), [], `${mode} ${JSON.stringify(custom)}`);
  }
});

test("every token is a 6-digit hex colour in every palette", () => {
  const all = [...Object.values(PRESETS).flatMap(p => modes.map(m => p[m])), ...modes.map(m => derive({ accent: "#2A5FAF", prep: "#8FBCEB", journal: "#8FD0A4", done: "#F2B58F" })[m])];
  for (const p of all) for (const t of TOKEN_NAMES) assert.match(p[t], /^#[0-9A-F]{6}$/i, t);
});

test("saved theme settings are validated and fall back to Signature light", () => {
  assert.deepEqual(parseTheme(null).palette, "signature");
  assert.equal(parseTheme({ palette: "reading-room", mode: "dim" }).mode, "light");
  const t = parseTheme({ palette: "custom", mode: "dark", custom: { accent: "#a3326e", prep: "not-a-colour" } });
  assert.equal(t.custom.accent, "#A3326E");
  assert.equal(t.custom.prep, "#F0A8C6");
  assert.deepEqual(palette(t), derive(t.custom).dark);
});

test("theme.css is generated from src/lib/theme.ts", () => {
  // Line endings are normalised: Git may check files out with CRLF on Windows.
  assert.equal(readFileSync(new URL("../src/app/theme.css", import.meta.url), "utf8").replace(/\r\n/g, "\n"), themeCss(),
    "Run: node --import tsx scripts/generate-theme-css.ts");
});

test("app stylesheets contain no hard-coded colours outside theme.css", () => {
  const dir = new URL("../src/app/", import.meta.url);
  const literal = /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(|(?<![-\w])(?:white|black)(?![-\w])/;
  const offenders: string[] = [];
  for (const file of readdirSync(dir).filter(f => f.endsWith(".css") && f !== "theme.css")) {
    const css = readFileSync(new URL(file, dir), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    css.split("\n").forEach((line, i) => {
      // Only check declaration values, not selectors such as #id or url(#fragment).
      const value = line.includes(":") ? line.replace(/url\([^)]*\)/g, "").split(/[;{]/).map(part => part.split(":").slice(1).join(":")).join(" ") : "";
      if (literal.test(value)) offenders.push(`${file}:${i + 1}: ${line.trim().slice(0, 100)}`);
    });
  }
  assert.deepEqual(offenders, []);
});

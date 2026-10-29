"use client";
import { useRef } from "react";
import {
  createRecord,
  latest,
  recordSchema,
  type ProcessRecord,
} from "@/lib/process/model";
import type { ProcessStore } from "./use-process";
export default function TemplateTools({
  kind,
  store,
}: {
  kind: "protocol" | "playbook";
  store: ProcessStore;
}) {
  const input = useRef<HTMLInputElement>(null);
  function download() {
    const url = URL.createObjectURL(
      new Blob(
        [
          JSON.stringify(
            {
              format: `still-signal-${kind}-v1`,
              templates: latest(store.records, kind).map((r) => r.body),
            },
            null,
            2,
          ),
        ],
        { type: "application/json" },
      ),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `still-signal-${kind}-templates.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <div className="cc-actions">
      <button onClick={download}>Export templates</button>
      <button onClick={() => input.current?.click()}>Import templates</button>
      <input
        hidden
        type="file"
        accept="application/json,.json"
        ref={input}
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file) return;
          try {
            if (file.size > 256000)
              throw new Error("Template file is too large.");
            const data = JSON.parse(await file.text());
            if (
              data.format !== `still-signal-${kind}-v1` ||
              !Array.isArray(data.templates) ||
              !data.templates.length ||
              data.templates.length > 20
            )
              throw new Error(
                "Invalid template format (maximum 20 definitions).",
              );
            const rows: ProcessRecord[] = data.templates.map(
              (body: unknown) => {
                const row = recordSchema.parse(
                  createRecord(kind, body as never),
                );
                if (row.kind === "protocol")
                  return createRecord("protocol", {
                    ...row.body,
                    steps: row.body.steps.map((s) => ({
                      ...s,
                      id: crypto.randomUUID(),
                    })),
                  });
                if (row.kind === "playbook")
                  return createRecord("playbook", {
                    ...row.body,
                    rules: row.body.rules.map((s) => ({
                      ...s,
                      id: crypto.randomUUID(),
                    })),
                  });
                throw new Error("Invalid template kind.");
              },
            );
            await store.save(rows);
          } catch (error) {
            store.setError(
              error instanceof Error
                ? error.message
                : "Template import failed.",
            );
          }
        }}
      />
    </div>
  );
}

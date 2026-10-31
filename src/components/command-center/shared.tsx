"use client";
import {
  cloneElement,
  isValidElement,
  useId,
  type ReactElement,
  type ReactNode,
} from "react";
import type { BodyOf, ProcessRecord, RecordOf } from "@/lib/process/model";
import type { Props } from "../concept/shared";
import { WorkspaceModule } from "../module-workspace";
import type { ProcessStore } from "./use-process";
export type Context = {
  store: ProcessStore;
  day: RecordOf<"day">;
  props: Props;
};
export function Panel({
  title,
  detail,
  action,
  children,
  className = "",
}: {
  title: string;
  detail?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <WorkspaceModule id={"process-" + title.toLowerCase().replace(/[^a-z0-9]+/g, "-")} title={title} parts={[{id:"description",title:"Description",selector:"header p"},{id:"summary",title:"Supporting explanation",selector:".cc-muted"}]}><div className="cc-workspace ss-module-process-content"><section className={"cc-panel " + className}>
      <header>
        <div>
          <h2>{title}</h2>
          {detail && <p>{detail}</p>}
        </div>
        {action}
      </header>
      <div className="cc-panel-body">{children}</div>
    </section></div></WorkspaceModule>
  );
}
export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <div className="cc-field">
      <label htmlFor={id}>{label}</label>
      {isValidElement(children)
        ? cloneElement(children as ReactElement<{ id?: string }>, { id })
        : children}
    </div>
  );
}
export function Input({
  label,
  name,
  value = "",
  type = "text",
  required = false,
  ...rest
}: {
  label: string;
  name: string;
  value?: string | number;
  type?: string;
  required?: boolean;
  min?: number;
  max?: number;
  step?: string;
  placeholder?: string;
}) {
  return (
    <Field label={label}>
      <input
        name={name}
        defaultValue={value}
        type={type}
        required={required}
        {...rest}
      />
    </Field>
  );
}
export function Area({
  label,
  name,
  value = "",
  required = false,
}: {
  label: string;
  name: string;
  value?: string;
  required?: boolean;
}) {
  return (
    <Field label={label}>
      <textarea
        name={name}
        defaultValue={value}
        required={required}
        rows={3}
        maxLength={8000}
      />
    </Field>
  );
}
export function Empty({ children }: { children: ReactNode }) {
  return <p className="cc-empty">{children}</p>;
}
export function Save({
  store,
  children = "Save",
}: {
  store: ProcessStore;
  children?: ReactNode;
}) {
  return (
    <button className="cc-primary" disabled={store.busy} type="submit">
      {store.busy ? "Saving…" : children}
    </button>
  );
}
export function History({
  records,
  rootId,
}: {
  records: ProcessRecord[];
  rootId: string;
}) {
  const rows = records
    .filter((r) => r.rootId === rootId)
    .sort((a, b) => b.revision - a.revision);
  return (
    <details className="cc-history">
      <summary>
        History · {rows.length} revision{rows.length === 1 ? "" : "s"}
      </summary>
      {rows.map((row) => (
        <details key={row.id}>
          <summary>
            v{row.revision} · {new Date(row.createdAt).toLocaleString()}
            {row.archived ? " · archived" : ""}
          </summary>
          <pre>{JSON.stringify(row.body, null, 2)}</pre>
        </details>
      ))}
    </details>
  );
}
export const string = (f: FormData, key: string) =>
  String(f.get(key) ?? "").trim();
export const number = (f: FormData, key: string) =>
  string(f, key) === "" ? undefined : Number(string(f, key));
export const lines = (f: FormData, key: string) =>
  string(f, key)
    .split(/\n/)
    .map((s) => s.trim())
    .filter(Boolean);
export function Badge({ children }: { children: ReactNode }) {
  return <span className="cc-badge">{children}</span>;
}
export type DayBody = BodyOf<"day">;

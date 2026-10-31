"use client";
import { useState } from "react";
import { useProcess } from "./command-center/use-process";
import { createRecord, latest, type RecordOf } from "@/lib/process/model";
import { freshDashboard } from "@/lib/process/dashboard";
import type { ModuleLayout } from "@/lib/module-layout";
import { workspacePresets, presetWorkspace } from "@/lib/process/workspace-presets";

/** Apply placements to the existing board; never replace its module children. */
export default function PortableModes({owner,page,value,editing,onApply}: {owner:string;page:string;value:ModuleLayout;editing:boolean;onApply:(layout:ModuleLayout)=>void}) {
  const store = useProcess(owner,[]), [selected,setSelected] = useState<RecordOf<"layout">>(), [name,setName] = useState("Pre-Market"), [status,setStatus] = useState("");
  const modes = latest(store.records,"layout").filter(r => r.body.workspace?.page === page);
  async function save(copy:boolean) {
    if (!name.trim()) {setStatus("Enter a mode name."); return;}
    const base = copy ? undefined : selected;
    const head = modes.find(r => r.rootId === base?.rootId);
    if (base && head?.id !== base.id) {setStatus("A newer mode exists. Load it or save your draft as a copy.");return;}
    const record = createRecord("layout",{...freshDashboard(),name:name.trim(),isDefault:false,workspace:{page,definition:value}},base);
    if (await store.save([record])) {setSelected(record);setStatus("Mode saved locally; cloud sync follows the account connection.");}
  }
  return <details className="ss-portable-modes"><summary>Workspace modes</summary>
    <label>Editable starter preset <select aria-label="Workspace starter preset" disabled={editing} value="" onChange={e => {const preset=e.target.value as keyof typeof workspacePresets;if(preset in workspacePresets){onApply(presetWorkspace(value,preset));setSelected(undefined);setName(preset);setStatus("Starter applied to available modules. Customize the board and save your mode.");}}}><option value="">Choose a starting point</option>{Object.keys(workspacePresets).map(p => <option key={p}>{p}</option>)}</select></label>
    <div className="cc-actions"><label>Saved mode <select aria-label="Saved workspace mode" disabled={editing} value={selected?.rootId ?? ""} onChange={e => {const row=modes.find(r => r.rootId === e.target.value);if(row?.body.workspace){setSelected(row);setName(row.body.name);onApply(row.body.workspace.definition);setStatus("Mode loaded. Existing editors and recordings stay mounted.");}}}><option value="">Choose a saved mode</option>{modes.map(r => <option key={r.id} value={r.rootId}>{r.body.name} · v{r.revision}</option>)}</select></label>
    <label>Mode name <input maxLength={160} value={name} onChange={e => setName(e.target.value)}/></label>
    <button disabled={store.busy || !store.loaded} onClick={() => void save(true)}>Save as new mode</button>
    <button disabled={store.busy || !selected || !store.loaded} onClick={() => void save(false)}>Save mode revision</button>
    <button disabled={store.busy} onClick={() => void store.refresh()}>Refresh modes</button>
    <button disabled={store.busy || !selected} onClick={async () => {if(selected && await store.save([{...createRecord("layout",selected.body,selected),archived:true}])){setSelected(undefined);setStatus("Mode archived; history preserved.");}}}>Archive mode</button></div>
    <p role="status">{status || store.syncState}</p>{store.error && <p role="alert">{store.error} Your board draft is preserved; save a new mode to keep an independent copy.</p>}
  </details>;
}

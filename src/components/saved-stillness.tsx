"use client";
import { useState } from "react";
import { createRecord, latest } from "@/lib/process/model";
import { starterProfile } from "@/lib/process/journal-guide";
import { useProcess } from "./command-center/use-process";
import PersonalStillness, { StillnessBuilder } from "./personal-stillness";
import type { Props } from "./concept/shared";
export default function SavedStillness({ props }: { props: Props }) {
  const store = useProcess(props.pulse.owner, props.history);
  const routine = latest(store.records, "protocol").sort(
    (a, b) => b.createdAt - a.createdAt,
  )[0];
  const [editing, setEditing] = useState(false),
    [status, setStatus] = useState("");
  const [elements, setElements] = useState<
    ReturnType<typeof starterProfile>["stillness"]
  >([]);
  if (!store.loaded) return <p>Loading your saved stillness…</p>;
  return (
    <section className="guide-personal-stillness">
      <h2>Stillness in your own words</h2>
      {routine ? (
        <>
          <button
            onClick={() => {
              setElements(routine.body.profile?.stillness ?? []);
              setEditing((v) => !v);
            }}
          >
            {editing ? "Close routine editor" : "Edit my personal routine"}
          </button>
          {editing ? (
            <>
              <StillnessBuilder
                owner={props.pulse.owner}
                value={elements}
                onChange={setElements}
              />
              <button
                disabled={store.busy}
                onClick={async () => {
                  const profile = {
                    ...(routine.body.profile ?? starterProfile()),
                    stillness: elements,
                  };
                  if (
                    await store.save([
                      createRecord(
                        "protocol",
                        { ...routine.body, profile },
                        routine,
                      ),
                    ])
                  ) {
                    setEditing(false);
                    setStatus("Your stillness routine is saved.");
                  }
                }}
              >
                Save my stillness routine
              </button>
            </>
          ) : routine.body.profile?.stillness.length ? (
            <PersonalStillness
              owner={props.pulse.owner}
              elements={routine.body.profile.stillness}
            />
          ) : (
            <p>
              Add your own words, breathing guide or a recording to replay when
              you choose.
            </p>
          )}
        </>
      ) : (
        <>
          <p>
            Build a personal routine during guided setup. You can use the
            practices below now.
          </p>
          <button onClick={() => props.onPage("Pre-Market")}>
            Build my journal & stillness
          </button>
        </>
      )}
      {(store.error || status) && <p role="status">{store.error || status}</p>}
    </section>
  );
}

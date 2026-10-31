import type { ReactNode } from "react";
import type { BodyOf } from "@/lib/process/model";
type Step = BodyOf<"protocol">["steps"][number];
type Group = { name: string; children: Map<string, Group>; steps: Step[] };
export function groupedSteps(
  steps: Step[],
  render: (step: Step) => ReactNode,
): ReactNode {
  const root: Group = { name: "", children: new Map(), steps: [] };
  for (const step of steps) {
    let group = root;
    for (const name of step.groups?.length ? step.groups : [step.category]) {
      let child = group.children.get(name);
      if (!child) {
        child = { name, children: new Map(), steps: [] };
        group.children.set(name, child);
      }
      group = child;
    }
    group.steps.push(step);
  }
  const view = (group: Group, path: string): ReactNode => (
    <>
      {group.steps.map(render)}
      {[...group.children.values()].map((child) => (
        <details
          open
          key={path + "/" + child.name}
          className="cc-preparation-group"
        >
          <summary>{child.name}</summary>
          {view(child, path + "/" + child.name)}
        </details>
      ))}
    </>
  );
  return view(root, "");
}

import {
  createRecord,
  latest,
  type BodyOf,
  type ProcessRecord,
} from "../process/model";
/** Normalize actual questionnaire answers into typed observations without asking
 * the user to enter the same condition twice. Missing answers stay explicit. */
export function temperatureRecords(
  records: ProcessRecord[],
  body: BodyOf<"checkin">,
) {
  const checkin = createRecord("checkin", body),
    batch: ProcessRecord[] = [checkin];
  for (const answer of body.answers) {
    let definition = latest([...records, ...batch], "variable").find(
      (v) =>
        v.body.name === answer.question &&
        v.body.category === "Self-reported check-in" &&
        v.body.type === "scale" &&
        v.body.unit === "1–10" &&
        v.body.min === 1 &&
        v.body.max === 10 &&
        !v.body.archived,
    );
    if (!definition) {
      definition = createRecord("variable", {
        name: answer.question,
        category: "Self-reported check-in",
        type: "scale",
        unit: "1–10",
        min: 1,
        max: 10,
        choices: [],
        frequency: "event",
        phases: ["pre-market", "during", "post-session"],
        required: false,
        source: "manual",
        archived: false,
        analytics: true,
      });
      batch.push(definition);
    }
    batch.push(
      createRecord(
        "observation",
        {
          dayId: body.dayId,
          definitionId: definition.id,
          observedAt: body.observedAt,
          phase: "during",
          missing: answer.value === null ? "not-recorded" : "recorded",
          value: answer.value,
          source: "manual",
          provenance: "Self-reported temperature check: " + answer.question,
        },
        undefined,
        [{ kind: "checkin", id: checkin.id }],
      ),
    );
  }
  return batch;
}

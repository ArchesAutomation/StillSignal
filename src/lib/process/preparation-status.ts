import { catalogue } from "../stillness-catalogue";
import { arrivalCheckin } from "./daily-preparation";
import { supportFocus } from "./journal-guide";
import type { arrivalFeelings, ProcessRecord, StillnessSelection } from "./model";
import { tradingDayFor } from "./trading-day";

type Choice = Pick<StillnessSelection, "itemId" | "piece">;

/** A saved choice still names a catalogue item and, for a single piece, a step that exists. */
export function knownStillnessChoice(choice: Choice) {
  const item = catalogue.find((entry) => entry.id === choice.itemId);
  return !!item && (choice.piece === undefined || choice.piece < item.steps.length);
}

/** Title and step names exactly as the Preparation support list shows them. */
export function stillnessChoiceSummary(choice: Choice) {
  const item = catalogue.find((entry) => entry.id === choice.itemId)!;
  const steps = choice.piece === undefined ? item.steps : [item.steps[choice.piece]];
  return {
    title: choice.piece === undefined ? item.name : item.steps[choice.piece][0],
    steps: steps.map(([name]) => name),
  };
}

export type PreparationStatus = {
  date: string;
  timezone: string;
  recorded: boolean;
  arrival: (typeof arrivalFeelings)[number][];
  intention: string;
  boundary: string;
  homeFocus: string[];
  support: { title: string; steps: string[] }[];
};

/**
 * Today's saved Preparation, as the Preparation screen reads it. Shared by that screen
 * and the assistant's read-only preparation_status tool. It never creates or changes a record.
 */
export function preparationStatus(
  records: ProcessRecord[],
  date: string,
  timezone: string,
): PreparationStatus {
  const day = tradingDayFor(records, date, timezone);
  return {
    date,
    timezone,
    recorded: !!day,
    arrival: [...(arrivalCheckin(records, day?.rootId)?.body.arrival ?? [])],
    intention: day?.body.goal ?? "",
    boundary: day?.body.boundary ?? "",
    homeFocus: day?.body.supportFocuses?.map((focus) => supportFocus[focus].title) ?? [],
    support: (day?.body.stillness ?? [])
      .filter((choice) => choice.destination === "Preparation" && knownStillnessChoice(choice))
      .map(stillnessChoiceSummary),
  };
}

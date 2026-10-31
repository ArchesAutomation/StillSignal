"use client";
import { createContext, useContext } from "react";
import type { Settings } from "@/lib/model";
export const PhaseLabelsContext = createContext<Settings["phaseLabels"]>(undefined);
export const usePhaseLabels = () => useContext(PhaseLabelsContext);

/* ─── Interview Context ───
   Eliminates prop drilling of 47+ values from useInterviewEngine
   to child components. Components use useInterview() instead of
   receiving props. */

import { createContext, useContext } from "react";
import type { useInterviewEngine } from "./useInterviewEngine";

export type InterviewEngine = ReturnType<typeof useInterviewEngine>;

const InterviewContext = createContext<InterviewEngine | null>(null);

export const InterviewProvider = InterviewContext.Provider;

/** Access interview engine state/actions from any child component. */
export function useInterview(): InterviewEngine {
  const ctx = useContext(InterviewContext);
  if (!ctx) throw new Error("useInterview must be used within InterviewProvider");
  return ctx;
}

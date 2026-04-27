/**
 * Shared types used by the resume catalogue + coverage panel components.
 * Kept in a leaf file so both components import from here without a
 * dependency on DashboardResume.tsx (which would create a cycle).
 */

import type { ResumeProfile } from "../dashboardData";
import type { computeAllFitness } from "../resumeFitness";

export interface ResumeCardVersion {
  id: string;
  versionNumber: number;
  isLatest: boolean;
  fileName: string | null;
  score: number | null;
  profile: ResumeProfile | null;
  createdAt: string | null;
  resumeText: string | null;
}

export interface ResumeCardData {
  id: string;
  domain: string;
  title: string;
  latestVersion: number;
  latestVersionId: string | null;
  latestScore: number | null;
  latestProfile: ResumeProfile | null;
  latestFileName: string | null;
  updatedAt: string;
  isActive: boolean;
  versions: ResumeCardVersion[];
}

export type FitnessAll = ReturnType<typeof computeAllFitness>;

export interface NoticeState {
  kind: "ok" | "err";
  text: string;
}

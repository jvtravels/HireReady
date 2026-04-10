import { c } from "./tokens";

export type UserContext = { targetRole?: string; targetCompany?: string; industry?: string; interviewDate?: string; practiceTimestamps?: string[]; subscriptionTier?: string; subscriptionEnd?: string } | null;

export interface DashboardSession {
  id: string;
  date: string;
  dateLabel: string;
  type: string;
  role: string;
  score: number;
  change: number;
  duration: string;
  difficulty?: string;
  topStrength: string;
  topWeakness: string;
  feedback: string;
  transcript: { speaker: string; text: string; scoreNote?: string }[];
  questionScores: { question: string; score: number; notes: string }[];
}

export interface SkillData {
  name: string;
  score: number;
  prev: number;
  color: string;
}

export interface TrendPoint {
  score: number;
  date: string;
  type: string;
}

export interface InterviewEvent {
  id: string;
  title: string;
  company: string;
  type: string;
  date: string;
  time: string;
  duration: number;
  location: string;
  notes: string;
  status: "upcoming" | "completed" | "cancelled";
  reminders: boolean;
}

export interface PersistedState {
  hasCompletedFirstSession: boolean;
  dismissedNotifs: number[];
  userName: string;
  targetRole: string;
  resumeFileName: string | null;
  interviewDate: string;
  defaultDifficulty?: string;
  emailNotifs?: boolean;
  streakReminder?: boolean;
  weeklyDigest?: boolean;
}

export const sessionTypes = ["All", "Behavioral", "Strategic", "Technical Leadership", "Case Study", "Campus Placement", "HR Round", "Management", "Government & PSU", "Teaching"];

export function scoreLabel(score: number) {
  if (score >= 85) return "Strong";
  if (score >= 75) return "Good";
  return "Needs work";
}

export function scoreLabelColor(score: number) {
  if (score >= 85) return c.sage;
  if (score >= 75) return c.gilt;
  return c.ember;
}

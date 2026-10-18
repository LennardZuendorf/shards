/** Priority display config (Todoist mapping P1..P4 → urgent, high, normal, low). */
import type { Priority } from "./types";

export interface PriorityMeta {
  value: Priority;
  short: string;
  label: string;
  /** Tailwind text color class. */
  text: string;
  /** Tailwind border color class (checkbox ring). */
  border: string;
  /** Tailwind background tint class. */
  bg: string;
  /** Solid fill (checked checkbox). */
  fill: string;
  /** SVG stroke class (checkbox hover preview). */
  stroke: string;
  rank: number;
}

export const PRIORITY_META: Record<Priority, PriorityMeta> = {
  urgent: {
    value: "urgent",
    short: "P1",
    label: "Urgent",
    text: "text-priority-urgent",
    border: "border-priority-urgent",
    bg: "bg-priority-urgent/10",
    fill: "bg-priority-urgent",
    stroke: "stroke-priority-urgent",
    rank: 0,
  },
  high: {
    value: "high",
    short: "P2",
    label: "High",
    text: "text-priority-high",
    border: "border-priority-high",
    bg: "bg-priority-high/10",
    fill: "bg-priority-high",
    stroke: "stroke-priority-high",
    rank: 1,
  },
  normal: {
    value: "normal",
    short: "P3",
    label: "Normal",
    text: "text-priority-normal",
    border: "border-priority-normal",
    bg: "bg-priority-normal/10",
    fill: "bg-priority-normal",
    stroke: "stroke-priority-normal",
    rank: 2,
  },
  low: {
    value: "low",
    short: "P4",
    label: "Low",
    text: "text-muted-foreground",
    border: "border-priority-low",
    bg: "bg-transparent",
    fill: "bg-priority-low",
    stroke: "stroke-muted-foreground",
    rank: 3,
  },
};

/** Normalise any stored priority (free-form reads) to a known one; absent → normal. */
export function asPriority(p: string | null | undefined): Priority {
  return p && p in PRIORITY_META ? (p as Priority) : "normal";
}

export const priorityMeta = (p: string | null | undefined) => PRIORITY_META[asPriority(p)];

export const priorityRank = (p: string | null | undefined) => priorityMeta(p).rank;

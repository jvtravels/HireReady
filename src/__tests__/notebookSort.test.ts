import { describe, it, expect } from "vitest";
import { transformNotebookRows, type StoryNotebookDbRow } from "../dashboardData";

/**
 * Story Notebook spaced-repetition ordering. The transform was inlined in
 * fetchStoryNotebook() and had zero tests. Rule: entries ≥7 days stale
 * rise to the top (review-due bucket); everything else stays recency-sorted.
 * A regression here puts stale stories at the bottom and users never see
 * them — defeating the whole point of the notebook.
 */

const NOW = new Date("2026-04-24T14:00:00Z").getTime();
const DAY = 86_400_000;

function row(overrides: Partial<StoryNotebookDbRow>): StoryNotebookDbRow {
  return {
    id: "id",
    session_id: null,
    question_idx: null,
    title: "Story",
    question: "Q",
    answer_text: "A",
    tags: [],
    created_at: new Date(NOW).toISOString(),
    last_used_at: null,
    ...overrides,
  };
}

describe("transformNotebookRows", () => {
  it("empty input → empty output", () => {
    expect(transformNotebookRows([], NOW)).toEqual([]);
  });

  it("computes daysStale from last_used_at when present, created_at otherwise", () => {
    const rows: StoryNotebookDbRow[] = [
      row({ id: "reviewed", created_at: new Date(NOW - 30 * DAY).toISOString(), last_used_at: new Date(NOW - 2 * DAY).toISOString() }),
      row({ id: "never", created_at: new Date(NOW - 10 * DAY).toISOString(), last_used_at: null }),
    ];
    const out = transformNotebookRows(rows, NOW);
    const byId = Object.fromEntries(out.map(r => [r.id, r.daysStale]));
    expect(byId.reviewed).toBe(2);
    expect(byId.never).toBe(10);
  });

  it("stale (≥7d) rises above fresh regardless of absolute age", () => {
    const rows: StoryNotebookDbRow[] = [
      row({ id: "fresh-new",  last_used_at: new Date(NOW - 1 * DAY).toISOString() }),
      row({ id: "stale-old",  last_used_at: new Date(NOW - 8 * DAY).toISOString() }),
      row({ id: "fresh-mid",  last_used_at: new Date(NOW - 3 * DAY).toISOString() }),
      row({ id: "stale-older", last_used_at: new Date(NOW - 30 * DAY).toISOString() }),
    ];
    const out = transformNotebookRows(rows, NOW);
    // Stale bucket first (ordered oldest-first within the bucket so the
    // longest-neglected ones surface most), then fresh.
    expect(out.map(r => r.id)).toEqual(["stale-older", "stale-old", "fresh-mid", "fresh-new"]);
  });

  it("exactly 7 days stale qualifies for the due-for-review bucket (boundary)", () => {
    const rows: StoryNotebookDbRow[] = [
      row({ id: "seven", last_used_at: new Date(NOW - 7 * DAY).toISOString() }),
      row({ id: "six",   last_used_at: new Date(NOW - 6 * DAY).toISOString() }),
    ];
    const out = transformNotebookRows(rows, NOW);
    expect(out[0].id).toBe("seven"); // ≥7 means due
    expect(out[1].id).toBe("six");   // 6 is still fresh
  });

  it("falls back to 'Untitled story' when title is null/empty", () => {
    const out = transformNotebookRows([row({ title: null }), row({ id: "empty", title: "" })], NOW);
    expect(out[0].title).toBe("Untitled story");
    expect(out[1].title).toBe("Untitled story");
  });

  it("defaults tags to empty array when null", () => {
    const out = transformNotebookRows([row({ tags: null })], NOW);
    expect(out[0].tags).toEqual([]);
  });

  it("preserves tags when present — notebook UI filters by these", () => {
    const out = transformNotebookRows([row({ tags: ["coached", "top-performer"] })], NOW);
    expect(out[0].tags).toEqual(["coached", "top-performer"]);
  });
});

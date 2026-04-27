import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import CatalogueGrid from "../resume/CatalogueGrid";
import type { ResumeCardData, FitnessAll } from "../resume/types";

function makeRow(overrides: Partial<ResumeCardData> = {}): ResumeCardData {
  return {
    id: overrides.id ?? "r1",
    domain: "general",
    title: "My Resume.pdf",
    latestVersion: 1,
    latestVersionId: "v1",
    latestScore: 80,
    latestProfile: null,
    latestFileName: "My Resume.pdf",
    updatedAt: "2026-04-27T00:00:00Z",
    isActive: true,
    versions: [{ id: "v1", versionNumber: 1, isLatest: true, fileName: "My Resume.pdf", score: 80, profile: null, createdAt: "2026-04-27T00:00:00Z", resumeText: "" }],
    ...overrides,
  };
}

const noFits: Record<string, FitnessAll | null> = { r1: null, r2: null };

describe("CatalogueGrid", () => {
  it("renders one card per resume", () => {
    const resumes = [makeRow({ id: "r1", title: "Active.pdf", isActive: true }), makeRow({ id: "r2", title: "Other.pdf", isActive: false })];
    render(
      <CatalogueGrid
        resumes={resumes}
        fitsByResumeId={noFits}
        activatingId={null}
        archivingId={null}
        onMakeActive={vi.fn()}
        onArchive={vi.fn()}
        onRename={vi.fn()}
      />,
    );
    expect(screen.getByText("Active.pdf")).toBeTruthy();
    expect(screen.getByText("Other.pdf")).toBeTruthy();
  });

  it("renders the Active pill only on the active card", () => {
    const resumes = [makeRow({ id: "r1", isActive: true }), makeRow({ id: "r2", isActive: false })];
    render(
      <CatalogueGrid
        resumes={resumes}
        fitsByResumeId={noFits}
        activatingId={null}
        archivingId={null}
        onMakeActive={vi.fn()}
        onArchive={vi.fn()}
        onRename={vi.fn()}
      />,
    );
    const activeBadges = screen.getAllByText("Active");
    expect(activeBadges.length).toBe(1);
  });

  it("renders Make active button only on non-active cards", () => {
    const resumes = [makeRow({ id: "r1", isActive: true }), makeRow({ id: "r2", isActive: false })];
    render(
      <CatalogueGrid
        resumes={resumes}
        fitsByResumeId={noFits}
        activatingId={null}
        archivingId={null}
        onMakeActive={vi.fn()}
        onArchive={vi.fn()}
        onRename={vi.fn()}
      />,
    );
    const makeActiveButtons = screen.getAllByRole("button", { name: /make active/i });
    expect(makeActiveButtons.length).toBe(1);
  });

  it("Make active button passes the chosen version to the callback", () => {
    const onMakeActive = vi.fn();
    const resumes = [makeRow({ id: "r2", isActive: false, latestVersionId: "v9" })];
    render(
      <CatalogueGrid
        resumes={resumes}
        fitsByResumeId={noFits}
        activatingId={null}
        archivingId={null}
        onMakeActive={onMakeActive}
        onArchive={vi.fn()}
        onRename={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /make active/i }));
    expect(onMakeActive).toHaveBeenCalledTimes(1);
    expect(onMakeActive.mock.calls[0][0]).toBe("r2");
    expect(onMakeActive.mock.calls[0][1]).toBe("v9");
  });

  it("opens inline confirm before calling onArchive", () => {
    const onArchive = vi.fn();
    const resumes = [makeRow({ id: "r2", isActive: false })];
    render(
      <CatalogueGrid
        resumes={resumes}
        fitsByResumeId={noFits}
        activatingId={null}
        archivingId={null}
        onMakeActive={vi.fn()}
        onArchive={onArchive}
        onRename={vi.fn()}
      />,
    );
    // First click reveals the inline confirm — does NOT archive yet
    fireEvent.click(screen.getByRole("button", { name: /archive resume/i }));
    expect(onArchive).not.toHaveBeenCalled();
    // The confirm "Archive" button now appears (case-sensitive different from aria-label)
    const confirmBtn = screen.getByRole("button", { name: /^Archive$/ });
    fireEvent.click(confirmBtn);
    expect(onArchive).toHaveBeenCalledWith("r2", false);
  });

  it("rename input commits on Enter", () => {
    const onRename = vi.fn();
    const resumes = [makeRow({ id: "r1", title: "Old.pdf" })];
    render(
      <CatalogueGrid
        resumes={resumes}
        fitsByResumeId={noFits}
        activatingId={null}
        archivingId={null}
        onMakeActive={vi.fn()}
        onArchive={vi.fn()}
        onRename={onRename}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /rename resume/i }));
    const input = screen.getByLabelText(/resume title/i) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "New.pdf" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onRename).toHaveBeenCalledWith("r1", "New.pdf");
  });
});

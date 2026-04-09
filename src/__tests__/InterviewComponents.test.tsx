import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  WaveformVisualizer,
  NetworkIndicator,
  DotGridVisualizer,
  QuestionProgressBar,
  LiveCaptions,
  ControlButton,
  getInterviewerName,
  INTERVIEWER_NAMES,
  formatTime,
} from "../InterviewComponents";

describe("formatTime", () => {
  it("formats seconds as MM:SS", () => {
    expect(formatTime(0)).toBe("00:00");
    expect(formatTime(65)).toBe("01:05");
    expect(formatTime(120)).toBe("02:00");
    expect(formatTime(599)).toBe("09:59");
  });
});

describe("getInterviewerName", () => {
  it("returns a name from the list", () => {
    const name = getInterviewerName("session-123");
    expect(INTERVIEWER_NAMES).toContain(name);
  });

  it("returns the same name for the same seed", () => {
    const a = getInterviewerName("seed-abc");
    const b = getInterviewerName("seed-abc");
    expect(a).toBe(b);
  });

  it("returns different names for different seeds", () => {
    const names = new Set(
      Array.from({ length: 20 }, (_, i) => getInterviewerName(`seed-${i}`))
    );
    expect(names.size).toBeGreaterThan(1);
  });
});

describe("QuestionProgressBar", () => {
  it("renders current and total", () => {
    render(<QuestionProgressBar current={3} total={5} />);
    expect(screen.getByText("Question 3 of 5")).toBeTruthy();
    expect(screen.getByText("60%")).toBeTruthy();
  });

  it("renders correct number of bar segments", () => {
    const { container } = render(<QuestionProgressBar current={2} total={4} />);
    // The root > wrapper > bar-row (second child) contains 4 segment divs
    const wrapper = container.firstElementChild!;
    const barRow = wrapper.children[1]; // second child is the bar flex container
    expect(barRow.children.length).toBe(4);
  });
});

describe("ControlButton", () => {
  it("renders with label and fires onClick", () => {
    const onClick = vi.fn();
    render(
      <ControlButton
        icon={<span data-testid="icon">X</span>}
        label="Mute"
        onClick={onClick}
      />
    );
    const btn = screen.getByRole("button", { name: "Mute" });
    expect(btn).toBeTruthy();
    btn.click();
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("has accessible aria-label", () => {
    render(
      <ControlButton icon={<span>X</span>} label="End Interview" danger onClick={() => {}} />
    );
    expect(screen.getByLabelText("End Interview")).toBeTruthy();
  });
});

describe("WaveformVisualizer", () => {
  it("renders bars when inactive", () => {
    const { container } = render(<WaveformVisualizer active={false} color="#fff" barCount={8} />);
    // The root div contains barCount child divs
    const barContainer = container.firstElementChild!;
    expect(barContainer.children.length).toBe(8);
  });
});

describe("DotGridVisualizer", () => {
  it("renders 49 dots (7x7 grid)", () => {
    const { container } = render(<DotGridVisualizer active={false} />);
    const gridContainer = container.firstElementChild!;
    expect(gridContainer.children.length).toBe(49);
  });
});

describe("LiveCaptions", () => {
  it("returns null when not typing and no text displayed", () => {
    const { container } = render(<LiveCaptions text="" isTyping={false} />);
    expect(container.innerHTML).toBe("");
  });

  it("has aria-live region for accessibility", () => {
    const { container } = render(<LiveCaptions text="Hello" isTyping={true} />);
    const liveRegion = container.querySelector("[aria-live]");
    expect(liveRegion).toBeTruthy();
    expect(liveRegion?.getAttribute("aria-live")).toBe("polite");
  });
});

describe("NetworkIndicator", () => {
  it("renders without crashing", () => {
    const { container } = render(<NetworkIndicator />);
    expect(container.textContent).toMatch(/Excellent|Good|Poor/);
  });
});

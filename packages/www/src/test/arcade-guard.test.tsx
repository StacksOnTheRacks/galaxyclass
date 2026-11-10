import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Arcade from "../app/arcade/page";

// Guard: the Arcade page must render byte-identical markup throughout the
// studio redesign. The snapshot was committed from the unchanged code. Never
// update it (no `-u`). Any diff means an Arcade file or shared shell changed.
describe("arcade guard", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-06-01"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders the Arcade page DOM unchanged", () => {
    const { container } = render(<Arcade />);

    expect(container.innerHTML).toMatchSnapshot();
  });
});

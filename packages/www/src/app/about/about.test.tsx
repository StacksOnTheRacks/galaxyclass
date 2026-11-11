import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import About from "./page";

describe("about page", () => {
  it("explains the studio, Aphelion Run, and The Arcade", () => {
    render(<About />);

    expect(screen.getByRole("heading", { level: 1, name: "Galaxy Class" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Who we are" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Aphelion Run" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /follow aphelion run/i })).toHaveAttribute(
      "href",
      "https://aphelionrun.com",
    );
    expect(screen.getByRole("link", { name: "The Arcade" })).toHaveAttribute("href", "/arcade");
    expect(screen.queryByRole("heading", { name: "How the rooms work" })).toBeNull();
    expect(
      within(screen.getByRole("navigation", { name: "App" })).getByRole("link", { name: "About" }),
    ).toHaveAttribute("aria-current", "page");
  });

  it("does not link into a game directly", () => {
    const { container } = render(<About />);

    expect(
      container.querySelector(
        'a[href^="/riffle"], a[href^="/scribble"], a[href^="/warships"], a[href^="/whodunit"]',
      ),
    ).toBeNull();
  });
});

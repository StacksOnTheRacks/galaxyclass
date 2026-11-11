import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Home from "./page";

describe("studio home", () => {
  it("features Aphelion Run and links out to its site", () => {
    render(<Home />);

    expect(
      screen.getByRole("heading", { level: 1, name: /aphelion run/i }),
    ).toBeInTheDocument();
    const play = screen.getByRole("link", { name: /follow aphelion run/i });
    expect(play).toHaveAttribute("href", "https://aphelionrun.com");
    expect(play).toHaveAttribute("target", "_blank");
    expect(play).toHaveAttribute("rel", expect.stringContaining("noopener"));
  });

  it("points to The Arcade and does not link into a game", () => {
    const { container } = render(<Home />);

    expect(screen.getByRole("link", { name: /enter the arcade/i })).toHaveAttribute(
      "href",
      "/arcade",
    );
    expect(
      container.querySelector(
        'a[href^="/riffle"], a[href^="/scribble"], a[href^="/warships"], a[href^="/whodunit"]',
      ),
    ).toBeNull();
    expect(container.querySelectorAll("iframe")).toHaveLength(0);
    expect(screen.queryByText(/no real-money wagering/i)).toBeNull();
  });

  it("shows signed-out Sign in and Sign up, with Arcade not current", () => {
    render(<Home />);

    const nav = within(screen.getByRole("navigation", { name: "Main" }));
    expect(nav.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/sign-in");
    expect(nav.getByRole("link", { name: "Sign up" })).toHaveAttribute("href", "/sign-up");
    expect(nav.getByRole("link", { name: "Arcade" })).toHaveAttribute("href", "/arcade");
    expect(nav.getByRole("link", { name: "Arcade" })).not.toHaveAttribute("aria-current");
  });

  it("gives phones a bottom tab bar with Arcade, About, and Sign in", () => {
    render(<Home />);

    const tabs = within(screen.getByRole("navigation", { name: "App" }));
    expect(tabs.getByRole("link", { name: "Arcade" })).toHaveAttribute("href", "/arcade");
    expect(tabs.getByRole("link", { name: "Arcade" })).not.toHaveAttribute("aria-current");
    expect(tabs.getByRole("link", { name: "About" })).toHaveAttribute("href", "/about");
    expect(tabs.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/sign-in");
  });

  it("names Riffle Poker in page metadata", async () => {
    const { metadata } = await import("./layout");

    expect(metadata.description).toContain("Riffle Poker");
    expect(metadata.description).not.toMatch(/\bRiffle\b(?! Poker)/);
    expect(metadata.openGraph?.description).toContain("Riffle Poker");
    expect(metadata.openGraph?.description).not.toMatch(/\bRiffle\b(?! Poker)/);
  });
});

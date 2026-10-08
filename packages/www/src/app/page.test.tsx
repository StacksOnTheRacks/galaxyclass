import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import About from "./about/page";
import Home from "./page";

vi.mock("next/font/google", () => {
  const font = () => ({ variable: "" });
  return { Bungee: font, Chakra_Petch: font, Silkscreen: font };
});

const root = path.resolve(__dirname, "../..");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)
      ? [full]
      : [];
  });
}

describe("rooms home", () => {
  it("opens the Riffle Poker room at same-origin /riffle", () => {
    render(<Home />);

    const heading = screen.getByRole("heading", { level: 3, name: "Riffle Poker" });
    const room = within(heading.closest("article") as HTMLElement);
    expect(room.getByRole("link", { name: "Enter Riffle Poker room" })).toHaveAttribute(
      "href",
      "/riffle",
    );
  });

  it("opens the Scribble room at same-origin /scribble", () => {
    render(<Home />);

    const heading = screen.getByRole("heading", { level: 3, name: "Scribble" });
    const room = within(heading.closest("article") as HTMLElement);
    expect(room.getByText(/crossword word game/i)).toBeInTheDocument();
    expect(room.getByRole("link", { name: "Enter Scribble room" })).toHaveAttribute(
      "href",
      "/scribble",
    );
  });

  it("opens the Warships room at same-origin /warships", () => {
    render(<Home />);

    const heading = screen.getByRole("heading", { level: 3, name: "Warships" });
    const room = within(heading.closest("article") as HTMLElement);
    expect(room.getByText(/naval battle for two members/i)).toBeInTheDocument();
    expect(room.getByRole("list", { name: "Warships details" })).toHaveTextContent(/2 players/);
    expect(room.getByRole("link", { name: "Enter Warships room" })).toHaveAttribute(
      "href",
      "/warships",
    );
  });

  it("never uses the trademarked board-game name for Warships", () => {
    const { container } = render(<Home />);

    expect(container.textContent ?? "").not.toMatch(/battleship/i);
  });

  it("opens the Whodunit? room at same-origin /whodunit", () => {
    render(<Home />);

    const heading = screen.getByRole("heading", { level: 3, name: "Whodunit?" });
    const room = within(heading.closest("article") as HTMLElement);
    expect(room.getByText(/mystery at starfall manor for 3–6 members/i)).toBeInTheDocument();
    expect(room.getByRole("list", { name: "Whodunit? details" })).toHaveTextContent(/3–6 players/);
    expect(room.getByRole("link", { name: "Enter Whodunit? room" })).toHaveAttribute(
      "href",
      "/whodunit",
    );
  });

  it("never uses the trademarked board-game name or its characters for Whodunit?", () => {
    const banned = /\b(clue\w*|hasbro|scarlet|mustard|peacock|plum|colonel)\b/i;
    const { container } = render(<Home />);

    expect(container.textContent ?? "").not.toMatch(banned);
    for (const file of sourceFiles(path.join(root, "src"))) {
      expect(readFileSync(file, "utf8"), file).not.toMatch(banned);
    }
  });

  it("links into each game exactly once, from the room list", () => {
    const { container } = render(<Home />);

    for (const prefix of ["/riffle", "/scribble", "/warships", "/whodunit"]) {
      const links = Array.from(container.querySelectorAll(`a[href^="${prefix}"]`));
      expect(links, prefix).toHaveLength(1);
      expect(links[0]!.closest("#rooms"), prefix).not.toBeNull();
    }
    expect(
      within(screen.getByRole("navigation", { name: "Footer" })).queryByRole("link", {
        name: /riffle|scribble|warships|whodunit/i,
      }),
    ).toBeNull();
  });

  it("teases more rooms without anything to enter, filling out the last row", () => {
    render(<Home />);

    const heading = screen.getByRole("heading", { level: 3, name: "More rooms coming" });
    const teaser = within(heading.closest("article") as HTMLElement);
    expect(teaser.getByText("Coming soon")).toBeInTheDocument();
    expect(teaser.queryByRole("link")).toBeNull();
    expect(heading.closest("li")).toHaveClass("sm:col-span-2", "lg:col-span-2");
  });

  it("calls the game Riffle Poker everywhere users can see or hear it", () => {
    const { container } = render(<Home />);

    const text = container.textContent ?? "";
    expect(text).not.toMatch(/(?<!\/)\briffle\b/);
    expect(text).not.toMatch(/\bRiffle\b(?! Poker)/);
    for (const node of container.querySelectorAll("[aria-label]")) {
      expect(node.getAttribute("aria-label")).not.toMatch(/\b[Rr]iffle\b(?! Poker)/);
    }
    expect(text).toContain("Riffle Poker");
  });

  it("names Riffle Poker in page metadata", async () => {
    const { metadata } = await import("./layout");

    expect(metadata.description).toContain("Riffle Poker");
    expect(metadata.description).not.toMatch(/\bRiffle\b(?! Poker)/);
    expect(metadata.openGraph?.description).toContain("Riffle Poker");
    expect(metadata.openGraph?.description).not.toMatch(/\bRiffle\b(?! Poker)/);
  });

  it("renders no iframe and no host embed section", () => {
    const { container } = render(<Home />);

    expect(container.querySelectorAll("iframe")).toHaveLength(0);
    expect(container.querySelector('a[href="#hosts"]')).toBeNull();
    expect(screen.queryByText(/for hosts/i)).toBeNull();
    expect(existsSync(path.join(root, "src/components/HostEmbedSection.tsx"))).toBe(false);
  });

  it("shows signed-out Sign in and Sign up in the main nav", () => {
    render(<Home />);

    const nav = within(screen.getByRole("navigation", { name: "Main" }));
    expect(nav.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/sign-in");
    expect(nav.getByRole("link", { name: "Sign up" })).toHaveAttribute("href", "/sign-up");
    expect(nav.getByRole("link", { name: "Rooms" })).toHaveAttribute("aria-current", "page");
  });

  it("gives phones a bottom tab bar with Rooms, About, and Sign in", () => {
    render(<Home />);

    const tabs = within(screen.getByRole("navigation", { name: "App" }));
    expect(tabs.getByRole("link", { name: "Rooms" })).toHaveAttribute("href", "/");
    expect(tabs.getByRole("link", { name: "Rooms" })).toHaveAttribute("aria-current", "page");
    expect(tabs.getByRole("link", { name: "About" })).toHaveAttribute("href", "/about");
    expect(tabs.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/sign-in");
  });

  it("invites guests to sign up without requiring it", () => {
    render(<Home />);

    const prompt = within(
      screen.getByRole("heading", { name: "Playing as a guest" }).closest("section") as HTMLElement,
    );
    expect(prompt.getByRole("link", { name: "Sign up" })).toHaveAttribute("href", "/sign-up");
    expect(prompt.getByText(/no account needed/i)).toBeInTheDocument();
  });
});

describe("about page", () => {
  it("explains how the rooms work and who runs the studio", () => {
    render(<About />);

    expect(screen.getByRole("heading", { level: 1, name: "Galaxy Class Gaming" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "How the rooms work" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Social chips only" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Who we are" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /browse rooms/i })).toHaveAttribute("href", "/");
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

describe("site boundaries", () => {
  it("does not capture /riffle, /scribble, /warships, or /whodunit in Next", () => {
    expect(existsSync(path.join(root, "src/app/riffle"))).toBe(false);
    expect(existsSync(path.join(root, "src/app/scribble"))).toBe(false);
    expect(existsSync(path.join(root, "src/app/warships"))).toBe(false);
    expect(existsSync(path.join(root, "src/app/whodunit"))).toBe(false);
    const nextConfig = readFileSync(path.join(root, "next.config.ts"), "utf8");
    expect(nextConfig).toMatch(/output:\s*"export"/);
    expect(nextConfig).not.toMatch(/rewrites|redirects/);
  });

  it("leaves tables and presence to each game room", () => {
    for (const file of sourceFiles(path.join(root, "src"))) {
      const source = readFileSync(file, "utf8");
      expect(source, file).not.toMatch(/WebSocket|config\.json|list_groups|seatedCount/);
    }
  });

  it("ships no inline HTML injection, scripts, or Hosted UI", () => {
    for (const file of sourceFiles(path.join(root, "src"))) {
      const source = readFileSync(file, "utf8");
      expect(source, file).not.toMatch(/dangerouslySetInnerHTML/);
      expect(source, file).not.toMatch(/<script|<iframe/i);
      expect(source, file).not.toMatch(/hostedUI|oauth2\/authorize/);
    }
  });
});

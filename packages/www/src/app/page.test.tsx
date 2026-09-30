import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FeaturedMarquee } from "@/components/FeaturedMarquee";
import { GameLibrary } from "@/components/GameLibrary";
import Home from "./page";

const motion = vi.hoisted(() => ({ reduced: false }));

vi.mock("framer-motion", async (importOriginal) => ({
  ...(await importOriginal<typeof import("framer-motion")>()),
  useReducedMotion: () => motion.reduced,
}));

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

beforeEach(() => {
  motion.reduced = false;
});

describe("studio home", () => {
  it("links every Play Riffle control to same-origin /riffle", () => {
    render(<Home />);

    const play = screen.getAllByRole("link", { name: "Play Riffle" });
    expect(play.length).toBeGreaterThan(0);
    for (const link of play) {
      expect(link).toHaveAttribute("href", "/riffle");
    }
  });

  it("renders no iframe and no host embed section", () => {
    const { container } = render(<Home />);

    expect(container.querySelectorAll("iframe")).toHaveLength(0);
    expect(container.querySelector('a[href="#hosts"]')).toBeNull();
    expect(screen.queryByText(/for hosts/i)).toBeNull();
    expect(readFileSync(path.join(root, "src/app/page.tsx"), "utf8")).not.toMatch(
      /HostEmbedSection/,
    );
    expect(existsSync(path.join(root, "src/components/HostEmbedSection.tsx"))).toBe(
      false,
    );
  });

  it("shows signed-out Sign in and Sign up in the main nav", () => {
    render(<Home />);

    const nav = within(screen.getByRole("navigation", { name: "Main" }));
    expect(nav.getByRole("link", { name: "Sign in" })).toHaveAttribute(
      "href",
      "/sign-in",
    );
    expect(nav.getByRole("link", { name: "Sign up" })).toHaveAttribute(
      "href",
      "/sign-up",
    );
    expect(nav.queryByRole("link", { name: /for hosts/i })).toBeNull();
  });

  it("keeps the story and CTA with no animated layers under reduced motion", () => {
    motion.reduced = true;
    const { container } = render(<Home />);

    expect(container.querySelectorAll("[data-motion]")).toHaveLength(0);
    expect(
      screen.getByRole("heading", { level: 1, name: /welcome to\s+the arcade/i }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "Play Riffle" })[0]).toHaveAttribute(
      "href",
      "/riffle",
    );
  });
});

describe("featured marquee", () => {
  it("chases marquee bulbs and deals the attract screen by default", () => {
    const { container } = render(<FeaturedMarquee />);

    expect(container.querySelectorAll('[data-motion="chase"]').length).toBeGreaterThan(0);
    expect(container.querySelector('[data-motion="power-on"]')).not.toBeNull();
    expect(container.querySelectorAll('[data-motion="deal"]')).toHaveLength(5);
  });

  it("renders a still attract screen when reduced motion is preferred", () => {
    motion.reduced = true;
    const { container } = render(<FeaturedMarquee />);

    expect(container.querySelectorAll("[data-motion]")).toHaveLength(0);
    expect(
      screen.getByRole("img", { name: /riffle attract screen/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Play Riffle" })).toHaveAttribute(
      "href",
      "/riffle",
    );
  });
});

describe("game library", () => {
  it("marks placeholder cabinets as coming soon with nothing to play", () => {
    render(<GameLibrary />);

    const placeholders = screen.getAllByRole("heading", { level: 3, name: /^slot \d+$/i });
    expect(placeholders).toHaveLength(3);
    for (const heading of placeholders) {
      const cabinet = within(heading.closest("article") as HTMLElement);
      expect(cabinet.getByText("Coming soon")).toBeInTheDocument();
      expect(cabinet.queryByRole("link")).toBeNull();
    }
  });

  it("filters the shelf by status", () => {
    render(<GameLibrary />);

    fireEvent.click(screen.getByRole("button", { name: /playable now/i }));
    expect(screen.getByRole("button", { name: /playable now/i })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.queryAllByRole("heading", { level: 3, name: /^slot/i })).toHaveLength(0);
    expect(screen.getByRole("heading", { level: 3, name: "Riffle" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /coming soon/i }));
    expect(screen.queryByRole("heading", { level: 3, name: "Riffle" })).toBeNull();
    expect(screen.getAllByRole("heading", { level: 3, name: /^slot/i })).toHaveLength(3);
  });
});

describe("home boundaries", () => {
  it("does not capture /riffle in Next", () => {
    expect(existsSync(path.join(root, "src/app/riffle"))).toBe(false);
    const nextConfig = readFileSync(path.join(root, "next.config.ts"), "utf8");
    expect(nextConfig).toMatch(/output:\s*"export"/);
    expect(nextConfig).not.toMatch(/rewrites|redirects/);
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

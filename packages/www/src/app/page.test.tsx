import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Starfield } from "@/components/Starfield";
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
      screen.getByRole("heading", { level: 1, name: /games worth sitting down for/i }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "Play Riffle" })[0]).toHaveAttribute(
      "href",
      "/riffle",
    );
  });
});

describe("Starfield", () => {
  it("twinkles and drifts by default", () => {
    const { container } = render(<Starfield />);

    expect(container.querySelector('[data-motion="twinkle"]')).not.toBeNull();
    expect(container.querySelectorAll('[data-motion="drift"]').length).toBeGreaterThan(0);
  });

  it("renders a static starfield with no motion when reduced motion is preferred", () => {
    motion.reduced = true;
    const { container } = render(<Starfield />);

    expect(container.querySelectorAll("[data-motion]")).toHaveLength(0);
    const images = container.querySelectorAll("img");
    expect(images).toHaveLength(1);
    expect(images[0].getAttribute("src")).toContain("starfield-static.svg");
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

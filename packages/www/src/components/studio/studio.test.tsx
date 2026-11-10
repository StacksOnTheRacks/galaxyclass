import { readFileSync } from "node:fs";
import path from "node:path";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { SiteShell } from "../SiteShell";
import { MOTION_STORAGE_KEY, MotionToggle, Reveal } from "./motion";

describe("SiteShell themes", () => {
  it("renders the studio chrome outside the Arcade", () => {
    const { container } = render(
      <SiteShell>
        <p>content</p>
      </SiteShell>,
    );

    expect(container.querySelector(".studio")).not.toBeNull();
    expect(container.querySelector(".arcade, .app-backdrop")).toBeNull();
    expect(container.querySelector(".gc-grain")).not.toBeNull();
    expect(screen.getByRole("navigation", { name: "Main" })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Footer" })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "App" })).toBeInTheDocument();
    expect(screen.getByRole("main")).toHaveClass("pt-gc-nav");
  });

  it("drops the nav offset when the nav overlays the page", () => {
    render(
      <SiteShell overlayNav>
        <p>content</p>
      </SiteShell>,
    );

    expect(screen.getByRole("main")).not.toHaveClass("pt-gc-nav");
  });

  it("keeps the Arcade branch free of studio chrome", () => {
    const { container } = render(
      <SiteShell theme="arcade" current="arcade">
        <p>content</p>
      </SiteShell>,
    );

    expect(container.querySelector(".studio, .gc-grain")).toBeNull();
    expect(container.firstElementChild).toHaveClass("app-backdrop", "arcade");
  });

  it("never links the studio footer into a game or says wagering", () => {
    const { container } = render(
      <SiteShell>
        <p>content</p>
      </SiteShell>,
    );

    expect(
      container.querySelector(
        'a[href^="/riffle"], a[href^="/scribble"], a[href^="/warships"], a[href^="/whodunit"]',
      ),
    ).toBeNull();
    expect(screen.queryByText(/no real-money wagering/i)).toBeNull();
  });
});

describe("motion toggle", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("persists the choice and mirrors it to data-motion on .studio", () => {
    const { container } = render(
      <SiteShell>
        <MotionToggle />
      </SiteShell>,
    );
    const root = container.querySelector(".studio") as HTMLElement;
    // The footer carries one toggle too, so pick the one inside <main>.
    const toggle = screen
      .getAllByRole("button", { name: /^motion:/i })
      .find((button) => button.closest("main"))!;

    expect(toggle).toHaveAttribute("aria-pressed", "true");
    expect(root).toHaveAttribute("data-motion", "on");

    fireEvent.click(toggle);

    expect(toggle).toHaveAttribute("aria-pressed", "false");
    expect(toggle).toHaveTextContent("Motion: Off");
    expect(root).toHaveAttribute("data-motion", "off");
    expect(window.localStorage.getItem(MOTION_STORAGE_KEY)).toBe("off");
  });

  it("restores a saved Off preference", async () => {
    window.localStorage.setItem(MOTION_STORAGE_KEY, "off");
    const { container } = render(
      <SiteShell>
        <p>content</p>
      </SiteShell>,
    );
    await act(async () => {});

    expect(container.querySelector(".studio")).toHaveAttribute("data-motion", "off");
  });
});

describe("Reveal", () => {
  it("renders its content visible in static markup", () => {
    render(
      <SiteShell>
        <Reveal as="section" delay={60}>
          <p>always here</p>
        </Reveal>
      </SiteShell>,
    );

    const text = screen.getByText("always here");
    expect(text).toBeVisible();
    expect(text.closest(".gc-reveal")).not.toHaveAttribute("data-reveal", "pending");
  });
});

describe("studio.css", () => {
  const css = readFileSync(path.resolve(__dirname, "../../styles/studio.css"), "utf8");

  it("scopes every top-level selector to .studio, .gc-, [data-gc, or :root", () => {
    const stripped = css.replace(/\/\*[\s\S]*?\*\//g, "");
    const offenders = stripped
      .split("\n")
      .filter((line) => /^[^\s@}][^{]*\{/.test(line))
      .filter((line) => !/^(\.studio|\.gc-|\[data-gc|:root)/.test(line));

    expect(offenders).toEqual([]);
  });

  it("uses no Tailwind directives and only gc-* keyframes", () => {
    expect(css).not.toMatch(/@tailwind|@layer|@apply/);
    for (const [, name] of css.matchAll(/@keyframes\s+([\w-]+)/g)) {
      expect(name).toMatch(/^gc-/);
    }
  });

  it("only declares new --gc-* and --ar-* variables on :root", () => {
    const root = css.match(/^:root\s*\{[\s\S]*?\n\}/m)![0];
    for (const [, name] of root.matchAll(/^\s*(--[\w-]+)\s*:/gm)) {
      expect(name).toMatch(/^--(gc|ar)-/);
    }
  });
});

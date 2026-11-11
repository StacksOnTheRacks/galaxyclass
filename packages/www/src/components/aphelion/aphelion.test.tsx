import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MOTION_STORAGE_KEY, MotionProvider } from "@/components/studio/motion";
import { PROMO_STILLS } from "@/content/aphelion-promo";
import { AphelionFeature } from "./AphelionFeature";
import { STILL_DWELL_MS } from "./PromoStills";

afterEach(() => {
  vi.useRealTimers();
  window.localStorage.clear();
});

function stage(container: HTMLElement) {
  return container.querySelector('[aria-roledescription="carousel"]') as HTMLElement;
}

function shownLayer(container: HTMLElement) {
  return stage(container).querySelector('[data-active="true"]') as HTMLElement;
}

function shownAlt(container: HTMLElement) {
  return shownLayer(container).querySelector("img")?.getAttribute("alt");
}

describe("Aphelion Run section", () => {
  it("keeps the home page contract: section id, heading, and launch block", () => {
    const { container } = render(<AphelionFeature />);

    const section = container.querySelector("section#aphelion-run");
    expect(section).not.toBeNull();
    expect(section).toHaveAttribute("aria-labelledby", "aphelion-heading");
    expect(screen.getByRole("heading", { level: 1, name: "Aphelion Run" })).toHaveAttribute("id", "aphelion-heading");
    expect(container.querySelector("#aphelion-launch")).not.toBeNull();
  });

  it("tells the four beats under real headings", () => {
    render(<AphelionFeature />);

    for (const verb of ["Siphon", "Mine", "Sell", "Survive"]) {
      expect(screen.getByRole("heading", { level: 3, name: verb })).toBeInTheDocument();
    }
    expect(screen.getByText(/taking their energy is theft/i)).toBeInTheDocument();
    expect(screen.getByText(/solscrip buys ships/i)).toBeInTheDocument();
  });

  it("has exactly one primary call to action, an external link in the launch block", () => {
    const { container } = render(<AphelionFeature />);

    const launch = within(container.querySelector("#aphelion-launch") as HTMLElement);
    const cta = launch.getByRole("link", { name: /play aphelion run/i });
    expect(cta).toHaveAttribute("href", "https://aphelionrun.com");
    expect(cta).toHaveAttribute("target", "_blank");
    expect(cta).toHaveAttribute("rel", expect.stringContaining("noopener"));
    expect(screen.getAllByRole("link", { name: /play aphelion run/i })).toHaveLength(1);

    expect(launch.getByRole("link", { name: /read the story/i })).toHaveAttribute(
      "href",
      "https://aphelionrun.com/story",
    );
    expect(launch.getByRole("link", { name: /read the rules/i })).toHaveAttribute(
      "href",
      "https://aphelionrun.com/rules",
    );
  });

  it("states the in-development status and never uses banned wording", () => {
    const { container } = render(<AphelionFeature />);
    const text = container.textContent ?? "";

    expect(text).toMatch(/in development/i);
    expect(text).toMatch(/coming soon/i);
    expect(text).not.toMatch(/play now|early access|playable/i);
    expect(text).not.toMatch(/legacy|retro|classic|vintage|still open|\bold\b/i);
  });

  it("credits the planet maps", () => {
    render(<AphelionFeature />);

    expect(
      screen.getByText("Planet surface maps: NASA (public domain); Solar System Scope (CC BY 4.0)."),
    ).toBeInTheDocument();
  });

  it("marks the CSS planets decorative", () => {
    const { container } = render(<AphelionFeature />);

    const decorative = Array.from(container.querySelectorAll("img")).filter((img) =>
      img.getAttribute("src")?.startsWith("/studio/aphelion/"),
    );
    expect(decorative.length).toBeGreaterThan(0);
    for (const img of decorative) {
      expect(img).toHaveAttribute("alt", "");
      expect(img.closest("[aria-hidden='true']")).not.toBeNull();
    }
  });
});

/** An observer that reports every observed element as fully in view. */
class InViewObserver {
  constructor(private callback: IntersectionObserverCallback) {}
  observe(element: Element) {
    this.callback(
      [{ isIntersecting: true, intersectionRatio: 1, target: element } as IntersectionObserverEntry],
      this as unknown as IntersectionObserver,
    );
  }
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
}

describe("Aphelion Run in-engine stills", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("IntersectionObserver", InViewObserver);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("has no video player and no placeholder", () => {
    const { container } = render(<AphelionFeature />);

    expect(container.querySelector("video")).toBeNull();
    expect(container.querySelector("source[src$='.mp4'], source[src$='.webm']")).toBeNull();
    expect(screen.queryByTestId("aphelion-placeholder")).toBeNull();
    expect(screen.queryByRole("button", { name: /footage/i })).toBeNull();
  });

  it("shows the first still with explicit size, lazy, with real alt text", () => {
    const { container } = render(<AphelionFeature />);

    const layer = shownLayer(container);
    const img = layer.querySelector("img") as HTMLImageElement;
    expect(img).toHaveAttribute("src", "/media/aphelion-run/sol-system-1024.jpg");
    expect(img).toHaveAttribute("width", "1024");
    expect(img).toHaveAttribute("height", "576");
    expect(img).toHaveAttribute("loading", "lazy");
    expect(img.getAttribute("alt")?.length ?? 0).toBeGreaterThan(40);
    expect(img.getAttribute("alt")).toBe(PROMO_STILLS[0].alt);
  });

  it("gives every thumbnail explicit dimensions and a 640w JPEG", () => {
    const { container } = render(<AphelionFeature />);

    const rail = container.querySelector("ol[aria-label='Choose a beat']") as HTMLElement;
    const thumbs = Array.from(rail.querySelectorAll("img"));
    expect(thumbs).toHaveLength(PROMO_STILLS.length);
    for (const img of thumbs) {
      expect(img.getAttribute("src")).toMatch(/-640\.jpg$/);
      expect(img).toHaveAttribute("width", "640");
      expect(img).toHaveAttribute("height", "360");
      expect(img).toHaveAttribute("loading", "lazy");
    }
  });

  it("maps a rail button to each beat that has a still and shows that still when chosen", () => {
    const { container } = render(<AphelionFeature />);
    const rail = within(container.querySelector("ol[aria-label='Choose a beat']") as HTMLElement);

    for (const verb of ["Siphon", "Mine", "Survive"]) {
      expect(rail.getByRole("button", { name: new RegExp(verb, "i") })).toBeInTheDocument();
    }
    expect(rail.queryByRole("button", { name: /sell/i })).toBeNull();
    expect(rail.getByRole("button", { name: /siphon/i })).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(rail.getByRole("button", { name: /survive/i }));

    expect(shownAlt(container)).toBe(PROMO_STILLS[2].alt);
    expect(rail.getByRole("button", { name: /survive/i })).toHaveAttribute("aria-pressed", "true");
    expect(rail.getByRole("button", { name: /siphon/i })).toHaveAttribute("aria-pressed", "false");
  });

  it("crossfades to the next still on a timer, drifts the shown one, and hides the rest from assistive tech", () => {
    const { container } = render(<AphelionFeature />);

    expect(shownLayer(container)).toHaveAttribute("data-drift", "true");
    expect(shownAlt(container)).toBe(PROMO_STILLS[0].alt);

    act(() => {
      vi.advanceTimersByTime(STILL_DWELL_MS + 50);
    });
    expect(shownAlt(container)).toBe(PROMO_STILLS[1].alt);

    const hidden = stage(container).querySelectorAll('[data-active="false"]');
    expect(hidden.length).toBeGreaterThan(0);
    for (const layer of Array.from(hidden)) {
      expect(layer).toHaveAttribute("aria-hidden", "true");
      expect(layer.querySelector("img")).toHaveAttribute("alt", "");
    }
  });

  it("pauses with the toggle, and stops after a manual choice until resumed", () => {
    const { container } = render(<AphelionFeature />);

    fireEvent.click(screen.getByRole("button", { name: "Pause slideshow" }));
    expect(screen.getByRole("button", { name: "Play slideshow" })).toHaveAttribute("aria-pressed", "true");
    act(() => {
      vi.advanceTimersByTime(STILL_DWELL_MS * 3);
    });
    expect(shownAlt(container)).toBe(PROMO_STILLS[0].alt);

    fireEvent.click(screen.getByRole("button", { name: "Play slideshow" }));
    act(() => {
      vi.advanceTimersByTime(STILL_DWELL_MS + 50);
    });
    expect(shownAlt(container)).toBe(PROMO_STILLS[1].alt);

    fireEvent.click(screen.getByRole("button", { name: /mine/i }));
    act(() => {
      vi.advanceTimersByTime(STILL_DWELL_MS * 3);
    });
    expect(shownAlt(container)).toBe(PROMO_STILLS[1].alt);
  });

  it("holds one static still with Motion Off, and manual selection still works", () => {
    window.localStorage.setItem(MOTION_STORAGE_KEY, "off");
    const { container } = render(
      <MotionProvider>
        <AphelionFeature />
      </MotionProvider>,
    );

    expect(screen.queryByRole("button", { name: /slideshow/i })).toBeNull();
    expect(container.querySelector('[data-drift="true"]')).toBeNull();
    expect(container.querySelector(".gc-scan-line")).toBeNull();

    act(() => {
      vi.advanceTimersByTime(STILL_DWELL_MS * 4);
    });
    expect(shownAlt(container)).toBe(PROMO_STILLS[0].alt);

    fireEvent.click(screen.getByRole("button", { name: /survive/i }));
    expect(shownAlt(container)).toBe(PROMO_STILLS[2].alt);
    expect(container.querySelector('[data-drift="true"]')).toBeNull();
  });
});

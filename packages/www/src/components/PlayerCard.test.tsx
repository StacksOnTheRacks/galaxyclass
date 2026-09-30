import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PlayerCard } from "./PlayerCard";

vi.mock("@/lib/auth/session", () => ({
  useSession: () => ({
    status: "signed-in",
    email: "player@example.com",
    profile: { gamerTag: "River_Rat", avatarId: 7 },
    profileStatus: "ready",
  }),
}));

describe("player card", () => {
  it("offers the account but no direct Riffle Poker link when signed in", () => {
    const { container } = render(<PlayerCard />);

    expect(screen.getByRole("heading", { name: "Your player card" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open account" })).toHaveAttribute(
      "href",
      "/account",
    );
    expect(container.querySelector('a[href^="/riffle"]')).toBeNull();
    expect(screen.queryByRole("link", { name: /riffle/i })).toBeNull();
  });
});

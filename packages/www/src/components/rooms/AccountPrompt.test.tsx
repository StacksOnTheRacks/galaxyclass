import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AccountPrompt } from "./AccountPrompt";

vi.mock("@/lib/auth/session", () => ({
  playerLabel: (profile: { gamerTag?: string } | null) => profile?.gamerTag ?? "Player 1",
  useSession: () => ({
    status: "signed-in",
    email: "player@example.com",
    profile: { gamerTag: "River_Rat", avatarId: 7 },
    profileStatus: "ready",
  }),
}));

describe("account prompt", () => {
  it("offers the account but no direct Riffle Poker link when signed in", () => {
    const { container } = render(<AccountPrompt />);

    expect(screen.getByRole("heading", { name: "Playing as River_Rat" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Account" })).toHaveAttribute("href", "/account");
    expect(container.querySelector('a[href^="/riffle"]')).toBeNull();
    expect(screen.queryByRole("link", { name: /riffle/i })).toBeNull();
  });
});

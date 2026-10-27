import type { Metadata } from "next";
import { HouseRules } from "@/components/about/HouseRules";
import { Frame, HudLabel } from "@/components/primitives";
import { AccountPrompt } from "@/components/rooms/AccountPrompt";
import { RoomList } from "@/components/rooms/RoomList";
import { SiteShell } from "@/components/SiteShell";

export const metadata: Metadata = {
  title: "The Arcade — Galaxy Class",
  description:
    "The Arcade at Galaxy Class: play Riffle Poker, Scribble, Warships, or Whodunit? in your browser. Social chips only — nothing to buy.",
};

export default function Arcade() {
  return (
    <SiteShell current="arcade" theme="arcade">
      <Frame className="flex flex-col gap-6 pt-6 md:gap-8 md:pt-10">
        <header className="flex flex-col gap-2">
          <HudLabel tone="cyan">Galaxy Class · The Arcade</HudLabel>
          <h1 className="font-display text-display-l uppercase">Pick a room</h1>
          <p className="max-w-[56ch] text-ink-muted md:text-body-l">
            Every room is a different game. Step inside, choose a table, and play
            in your browser.
          </p>
        </header>

        <RoomList />
        <AccountPrompt />
        <HouseRules />
      </Frame>
    </SiteShell>
  );
}

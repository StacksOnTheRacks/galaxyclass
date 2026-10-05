import type { CSSProperties, ReactNode } from "react";
import {
  buttonClass,
  Chip,
  HudLabel,
  PLAY_RIFFLE_HREF,
  PLAY_SCRIBBLE_HREF,
} from "../primitives";
import { RiffleRoomArt, RiffleWordmark } from "../RiffleScreen";
import { ScribbleRoomArt, ScribbleWordmark } from "../ScribbleScreen";

type Room = {
  id: string;
  name: string;
  href: string;
  accent: string;
  blurb: string;
  tags: string[];
  art: ReactNode;
  wordmark: ReactNode;
};

// Each room is its own app with its own table list; the studio site only opens the door.
const rooms: Room[] = [
  {
    id: "riffle",
    name: "Riffle Poker",
    href: PLAY_RIFFLE_HREF,
    accent: "var(--c-riffle)",
    blurb: "No-limit Texas Hold’em. Pick your stakes, take a seat, and play with strangers, friends, or family.",
    tags: ["Cards", "2–8 players", "Social chips"],
    art: <RiffleRoomArt className="aspect-[16/9]" />,
    wordmark: <RiffleWordmark className="text-[26px] leading-none" />,
  },
  {
    id: "scribble",
    name: "Scribble",
    href: PLAY_SCRIBBLE_HREF,
    accent: "var(--c-scribble)",
    blurb: "A crossword word game. Draw your tiles, build off the board, and outscore the table.",
    tags: ["Words", "2–4 players", "Turn-based"],
    art: <ScribbleRoomArt className="aspect-[16/9]" />,
    wordmark: <ScribbleWordmark className="text-[24px]" />,
  },
];

function RoomCard({ room }: { room: Room }) {
  const headingId = `room-${room.id}`;

  return (
    <article
      aria-label={room.name}
      className="room-card h-full"
      style={{ "--room": room.accent } as CSSProperties}
    >
      <div className="p-2 pb-0 sm:p-3 sm:pb-0">{room.art}</div>
      <div className="flex flex-1 flex-col gap-3 p-4 sm:p-5">
        <h3 id={headingId} className="leading-none">
          <span className="sr-only">{room.name}</span>
          {room.wordmark}
        </h3>
        <p className="text-small text-ink-muted">{room.blurb}</p>
        <ul aria-label={`${room.name} details`} className="flex flex-wrap gap-1.5">
          {room.tags.map((tag) => (
            <li key={tag}>
              <Chip>{tag}</Chip>
            </li>
          ))}
        </ul>
        <a
          href={room.href}
          className={buttonClass(
            "primary",
            "lg",
            "mt-auto w-full after:absolute after:inset-0 after:content-['']",
          )}
        >
          Enter <span className="sr-only">{room.name}</span> room
          <span aria-hidden="true" className="font-body text-[1.1em] leading-none">
            →
          </span>
        </a>
      </div>
    </article>
  );
}

function ComingSoonCard() {
  return (
    <article
      aria-labelledby="room-coming-soon"
      className="flex h-full flex-col justify-center gap-3 rounded-lg border-2 border-dashed border-bezel bg-floor/60 p-6"
    >
      <HudLabel tone="muted">Coming soon</HudLabel>
      <h3 id="room-coming-soon" className="font-display text-title uppercase text-ink-muted">
        More rooms coming
      </h3>
      <p className="max-w-[40ch] text-small text-ink-muted">
        The next game is in the workshop. Your Galaxy Class account will work in
        every room.
      </p>
    </article>
  );
}

export function RoomList() {
  return (
    <section id="rooms" aria-labelledby="rooms-heading" className="flex flex-col gap-4">
      <h2 id="rooms-heading" className="sr-only">
        Rooms
      </h2>
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 lg:gap-6">
        {rooms.map((room) => (
          <li key={room.id}>
            <RoomCard room={room} />
          </li>
        ))}
        <li className="sm:col-span-2 lg:col-span-1">
          <ComingSoonCard />
        </li>
      </ul>
    </section>
  );
}

/**
 * Aphelion Run promo: in-engine stills, beat mapping, and section copy.
 *
 * The stage shows in-engine stills of the ranger. Files live in `public/media/aphelion-run/`
 * as `<id>-1024.jpg` and `<id>-640.jpg`. A beat with no still has no rail button.
 *
 * Status wording: Aphelion Run is in development. Say "In development" or "Coming soon".
 * Never say it is playable now and never say early access.
 */

export const STILLS_DIR = "/media/aphelion-run";
export const STILL_WIDTH = 1024;
export const STILL_HEIGHT = 576;
export const THUMB_WIDTH = 640;
export const THUMB_HEIGHT = 360;

export type BeatId = "siphon" | "mine" | "sell" | "survive";

export type PromoStill = {
  id: string;
  beat: BeatId;
  /** Real, descriptive alt text for the full-size still. */
  alt: string;
  /** Mono readout in the frame's lower left. */
  readout: string;
  /** Ken Burns drift end point, as a percentage of the still. */
  drift: { x: number; y: number };
};

/** Playback order. A beat's first still is the one its rail button selects. */
export const PROMO_STILLS: readonly PromoStill[] = [
  {
    id: "sol-system",
    beat: "siphon",
    alt: "The Sol System map in Aphelion Run: faint orbit rings around the Sun, with gold-framed labels for Mercury, Venus, Earth, Mars, Jupiter, Saturn, Uranus, Neptune and Pluto showing the resources each world holds.",
    readout: "Sol System · Plotting the route",
    drift: { x: -2, y: -1 },
  },
  {
    id: "carbon-mine",
    beat: "mine",
    alt: "The ranger ship firing a mining beam into a dark carbon mine, with a cratered brown world filling the left of the frame.",
    readout: "Carbon mine · Ranger drawing ore",
    drift: { x: 2, y: -1.2 },
  },
  {
    id: "nereid",
    beat: "survive",
    alt: "A close view of the ranger ship over Nereid, its engine ring glowing white and a gold course line running off into deep space.",
    readout: "Nereid · Outer orbit, far from home",
    drift: { x: 2.2, y: -1.4 },
  },
] as const;

export const PROMO_COPY = {
  eyebrow: "Now in development · Coming soon",
  title: "Aphelion Run",
  tagline: "The long way around the Sun.",
  logline:
    "Fly one ship out of your home base in Sol. Siphon light from the company’s collectors, mine the worlds, sell energy on Earth’s black market, and get your cargo home before someone in outer orbit takes it.",
  stage: {
    label: "In-engine · Work in progress",
    caption: "In-engine stills. Work in progress.",
    groupAria: "Aphelion Run in-engine stills",
    railAria: "Choose a beat",
    pause: "Pause slideshow",
    play: "Play slideshow",
  },
  facts: [
    { term: "Setting", detail: "Sol, on a real star map" },
    { term: "Ships", detail: "Miner · Warship · Explorer · Hauler" },
    { term: "Currency", detail: "Solscrip" },
    { term: "Built for", detail: "Phone and desktop, in the browser" },
  ],
  status: "In development · Coming soon",
  cta: "Play Aphelion Run",
  storyLink: "Read the story",
  rulesLink: "Read the rules",
  credit: "Planet surface maps: NASA (public domain); Solar System Scope (CC BY 4.0).",
} as const;

export type BeatPlanet =
  { kind: "sun" } | { kind: "strip"; tone: "moon" | "earth" | "mars"; src: string; spinSeconds: number };

export type AphelionBeat = {
  id: BeatId;
  index: string;
  verb: string;
  body: string;
  planet: BeatPlanet;
};

export const APHELION_BEATS: readonly AphelionBeat[] = [
  {
    id: "siphon",
    index: "01",
    verb: "Siphon",
    body: "The Sun’s inner orbit is crowded with collectors owned by one galaxy-wide company. Taking their energy is theft. It’s also how you fly.",
    planet: { kind: "sun" },
  },
  {
    id: "mine",
    index: "02",
    verb: "Mine",
    body: "Every world has something worth digging. Mine it, load it, and fly it home, and every burn is paid in energy.",
    planet: { kind: "strip", tone: "moon", src: "/studio/aphelion/moon-1024.jpg", spinSeconds: 90 },
  },
  {
    id: "sell",
    index: "03",
    verb: "Sell",
    body: "Earth buys energy and nothing else. Its black market pays in Solscrip, and Solscrip buys ships.",
    planet: { kind: "strip", tone: "earth", src: "/studio/aphelion/earth-day-1024.jpg", spinSeconds: 60 },
  },
  {
    id: "survive",
    index: "04",
    verb: "Survive",
    body: "Out past the inner worlds, a full hold makes a heavy ship, and a heavy ship makes a target.",
    planet: { kind: "strip", tone: "mars", src: "/studio/aphelion/mars-1024.jpg", spinSeconds: 75 },
  },
] as const;

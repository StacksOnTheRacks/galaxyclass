/**
 * Studio site content: links, names, and copy shared by the studio pages and
 * chrome. Studio pages import from here, never from `components/primitives`,
 * for Aphelion Run hrefs.
 *
 * The Arcade is an active, growing library of online board and table games.
 * Describe it that way everywhere. Always "Riffle Poker" (never bare "Riffle"),
 * "Warships", "Whodunit?".
 */

export const STUDIO_NAME = "Galaxy Class Gaming";
export const SITE_NAME = "Galaxy Class";

export const APHELION_HREF = "https://aphelionrun.com";
export const APHELION_STORY_HREF = "https://aphelionrun.com/story";
export const APHELION_RULES_HREF = "https://aphelionrun.com/rules";

/** The code lives in `galaxyclass`, not `galaxyclass-www`. */
export const GITHUB_HREF = "https://github.com/StacksOnTheRacks/galaxyclass";

/** Internal routes the studio chrome and pages link to. Never a game path. */
export const STUDIO_LINKS = {
  home: "/",
  aphelion: "/#aphelion-run",
  arcade: "/arcade",
  about: "/about",
  signIn: "/sign-in",
  signUp: "/sign-up",
  account: "/account",
} as const;

/** Center links in the studio nav (md and up). The index is decorative. */
export const STUDIO_NAV_LINKS = [
  { index: "01", label: "Aphelion Run", href: STUDIO_LINKS.aphelion, section: null },
  { index: "02", label: "Arcade", href: STUDIO_LINKS.arcade, section: "arcade" },
  { index: "03", label: "About", href: STUDIO_LINKS.about, section: "about" },
] as const;

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

export const SITE_TITLE = "Galaxy Class — Independent game studio";
export const SITE_DESCRIPTION =
  "Galaxy Class is an independent game studio making deep games that open in a browser tab. Now building Aphelion Run. The Arcade is open: Riffle Poker, Scribble, Warships, and Whodunit?.";
export const SITE_OG_DESCRIPTION =
  "Deep games that open in a tab. Now building Aphelion Run, and The Arcade is open: Riffle Poker, Scribble, Warships, and Whodunit?.";

// ---------------------------------------------------------------------------
// The Arcade
// ---------------------------------------------------------------------------

export type ArcadeGameId = "riffle" | "scribble" | "warships" | "whodunit";

export type ArcadeGame = {
  id: ArcadeGameId;
  name: string;
  line: string;
  genre: string;
  players: string;
  /** Chips shown on the card, e.g. "Cards", "2–8 players". */
  chips: readonly string[];
  /** CSS value for the card's `--room` channel triplet (an Arcade token). */
  roomChannel: string;
  /** Cards link to the Arcade (never to a game path). */
  href: string;
};

export const ARCADE_GAMES: readonly ArcadeGame[] = [
  {
    id: "riffle",
    name: "Riffle Poker",
    line: "No-limit Texas Hold’em with friends, family, or strangers.",
    genre: "Cards",
    players: "2–8 players",
    chips: ["Cards", "2–8 players"],
    roomChannel: "var(--c-riffle)",
    href: "/arcade#room-riffle",
  },
  {
    id: "scribble",
    name: "Scribble",
    line: "A crossword word game. Outscore your friends tile by tile.",
    genre: "Words",
    players: "2–4 players",
    chips: ["Words", "2–4 players"],
    roomChannel: "var(--c-scribble)",
    href: "/arcade#room-scribble",
  },
  {
    id: "warships",
    name: "Warships",
    line: "Hide your fleet, call your shots, sink theirs first.",
    genre: "Strategy",
    players: "2 players",
    chips: ["Strategy", "2 players"],
    roomChannel: "var(--c-warships)",
    href: "/arcade#room-warships",
  },
  {
    id: "whodunit",
    name: "Whodunit?",
    line: "Prowl Starfall Manor and name who did it, with what, and where.",
    genre: "Deduction",
    players: "3–6 players",
    chips: ["Deduction", "3–6 players"],
    roomChannel: "var(--c-whodunit)",
    href: "/arcade#room-whodunit",
  },
] as const;

export const ARCADE_COPY = {
  eyebrow: "The Arcade · Open now",
  headline: "Pull up a chair.",
  sub: "The Arcade is our library of online board and table games: poker nights, word battles, naval duels, and a murder at Starfall Manor. Tables are open right now, in your browser, with friends or strangers.",
  footnote: "Free to play. Social chips only, with nothing to buy.",
  cta: "Enter The Arcade",
  railLabel: "Arcade games",
} as const;

// ---------------------------------------------------------------------------
// Home
// ---------------------------------------------------------------------------

export const HOME_COPY = {
  hero: {
    eyebrow: "Galaxy Class · Independent game studio",
    lineOne: "Big worlds.",
    lineTwo: "One tab away.",
    sub: "We make deep, systemic games that run wherever a browser does. No installs, no launchers: open a tab and play. Our first world is Aphelion Run.",
    primaryCta: "See Aphelion Run",
    secondaryCta: "Visit The Arcade",
    hudTopRight: "GC-01 · DEEP FIELD",
    hudBottomLeft: "RA 14h 29m 43s  DEC −62° 40′ 46″",
    hudBottomRight: "SCROLL TO DEPART",
  },
  manifesto: {
    eyebrow: "Studio log — 001",
    /** Words in `keywords` are lit in flare with the text glow. */
    statement:
      "We build games with real systems to master and real places to work in. Nothing to install. Every one opens in a tab, on a phone or a desk, and rewards the hours you give it.",
    keywords: ["systems", "places"],
  },
  pillars: {
    eyebrow: "How we work",
    headline: "Made to be played, not installed.",
    items: [
      {
        index: "01",
        title: "Systems you can master",
        body: "Economies, orbits, odds, and bluffs. Our games reward learning how things actually work.",
      },
      {
        index: "02",
        title: "Open anywhere",
        body: "Phone or desk, the same game in the same tab. Nothing to download, nothing to update.",
      },
      {
        index: "03",
        title: "One player card",
        body: "A free Galaxy Class account carries your gamer tag and avatar into every game we make.",
      },
    ],
  },
  account: {
    headline: "Claim your gamer tag.",
    body: "One free account for every Galaxy Class game. Pick a tag, choose an avatar, and you’re in.",
    createCta: "Create your account",
    signInCta: "Sign in",
    signedInCta: "Open your player card",
    previewAvatarId: 42,
    previewTag: "YOUR_TAG",
  },
} as const;

// ---------------------------------------------------------------------------
// About
// ---------------------------------------------------------------------------

export const ABOUT_COPY = {
  eyebrow: "About the studio",
  title: "Galaxy Class",
  serif: "A small studio with a long range.",
  lead: "Galaxy Class is an independent game studio. We build deep games that open in a browser tab: the big, systemic kind with economies and orbits, and the social kind you play around a table with friends.",
  metaDescription:
    "Galaxy Class is an independent game studio. Now building Aphelion Run. The Arcade is open: Riffle Poker, Scribble, Warships, and Whodunit?, playable in your browser.",
  story: {
    heading: "Who we are",
    paragraphs: [
      "We started with games you play together: cards, words, warships, and a whodunit, all running in the browser with one account for everything. Those tables are busy, and The Arcade keeps growing.",
      "Now we’re also building Aphelion Run, a space strategy game about one ship, one solar system, and the long way home.",
    ],
    sheet: [
      { term: "Studio", detail: "Galaxy Class Gaming" },
      { term: "Now building", detail: "Aphelion Run" },
      { term: "Open now", detail: "The Arcade: 4 games" },
      { term: "Plays in", detail: "Any modern browser" },
      { term: "Account", detail: "One for every game" },
    ],
  },
  make: {
    worlds: {
      label: "Worlds",
      title: "Aphelion Run",
      body: "Fly one ship out of your home base in Sol. Siphon the Sun, mine the worlds, sell energy on Earth’s black market, and survive the trip home.",
      cta: "Play Aphelion Run",
    },
    tables: {
      label: "Tables",
      title: "The Arcade",
      body: "Our library of online board and table games: Riffle Poker, Scribble, Warships, and Whodunit?. Tables are open around the clock. Social chips only, with nothing to buy.",
      cta: "The Arcade",
    },
  },
  principlesHeading: "What we believe",
  principles: [
    {
      title: "The browser is the console.",
      body: "If it has a browser, it plays our games. Phone, laptop, or desktop: same game, same account.",
    },
    {
      title: "Systems over scripts.",
      body: "We’d rather hand you a working economy than a cutscene. The stories come from what you do with it.",
    },
    {
      title: "Built for company.",
      body: "Tables for friends, gamer tags for strangers, and one account that follows you into every game.",
    },
    {
      title: "Nothing to buy at the table.",
      body: "Arcade play uses social chips. No cashier, no real-money wagering.",
    },
  ],
  closing: {
    headline: "Come play.",
    arcadeCta: "Enter The Arcade",
    aphelionCta: "Visit aphelionrun.com",
  },
} as const;

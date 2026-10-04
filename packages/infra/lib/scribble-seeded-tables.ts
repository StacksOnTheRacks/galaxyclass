export interface ScribbleSeededTableSpec {
  /** CloudFormation construct id. Stays stable so deploys do not remint the table id. */
  constructId: string;
  name: string;
  blurb: string;
}

/** v1 lobby: public tables only. Order is lobby order. */
export const SCRIBBLE_SEEDED_TABLES: readonly ScribbleSeededTableSpec[] = [
  {
    constructId: 'SeededScribbleInkwell',
    name: 'Inkwell',
    blurb: 'A quiet table for a full game, two to four players.',
  },
  {
    constructId: 'SeededScribbleMargins',
    name: 'Margins',
    blurb: 'Drop in, play a few words, drop out between turns.',
  },
  {
    constructId: 'SeededScribbleNightOwls',
    name: 'Night Owls',
    blurb: 'Late games and long words.',
  },
];

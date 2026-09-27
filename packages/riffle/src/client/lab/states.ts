export type LabState =
  | 'lab-idle'
  | 'lab-starting'
  | 'lab-ready'
  | 'lab-two-seats'
  | 'lab-harness-error';

export interface LabSeatAttach {
  seatId: string;
  playUrl: string;
  capabilityToken: string;
}

export interface LabSessionAttach {
  matchId: string;
  seats: LabSeatAttach[];
}

export const LAB_STATE_ANNOUNCEMENTS: Record<LabState, string> = {
  'lab-idle': 'Play lab idle. Start session to attach two seat iframes.',
  'lab-starting': 'Starting lab session.',
  'lab-ready': 'Lab session ready. Attaching seat iframes.',
  'lab-two-seats': 'Both lab seats are live.',
  'lab-harness-error': 'Lab harness error. Session could not be started.',
};

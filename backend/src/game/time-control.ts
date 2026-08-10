// Time control bands. Framework-independent, like the engine — just data plus a
// resolver, no NestJS/socket dependencies.

export type TimeControlName = 'bullet' | 'blitz' | 'rapid' | 'correspondence';

export interface TimeControl {
  name: TimeControlName;
  baseSeconds: number;
  incrementSeconds: number; // added to the mover's clock after each of their moves
}

export const TIME_CONTROLS: Record<TimeControlName, TimeControl> = {
  bullet: { name: 'bullet', baseSeconds: 120, incrementSeconds: 1 },
  blitz: { name: 'blitz', baseSeconds: 300, incrementSeconds: 3 },
  rapid: { name: 'rapid', baseSeconds: 600, incrementSeconds: 5 },
  // Not a live per-second clock in any practical sense, but it uses the exact same
  // mechanism (a large starting bank, incremented per move) rather than a special case.
  correspondence: { name: 'correspondence', baseSeconds: 86400, incrementSeconds: 0 },
};

export function resolveTimeControl(name?: string): TimeControl {
  if (name && Object.prototype.hasOwnProperty.call(TIME_CONTROLS, name)) {
    return TIME_CONTROLS[name as TimeControlName];
  }
  return TIME_CONTROLS.blitz;
}

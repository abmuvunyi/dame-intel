import { Move } from '../game/engine/engine.service';

export function sameMove(a: Move, b: Move): boolean {
  return a.from.row === b.from.row && a.from.col === b.from.col && a.to.row === b.to.row && a.to.col === b.to.col;
}

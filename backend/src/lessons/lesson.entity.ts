import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';

// Real, curated instructional content — deliberately NOT generated the way puzzles
// are (self-play + eval-gap detection): a lesson is claiming to teach a correct,
// established idea, so it has to be written and checked by hand, not mined. Seeded
// once at boot by LessonsService (see LESSON_CONTENT there) the same "only seed an
// empty table" way PuzzlesService already seeds puzzles, just with fixed authored
// content instead of self-play output.
export type LessonCategory = 'opening' | 'middlegame' | 'endgame' | 'tactics';

@Entity()
export class Lesson {
  @PrimaryGeneratedColumn()
  id: number;

  // URL-safe, human-readable identifier (e.g. "the-bridge") — used in the frontend
  // route (/learn/:slug) instead of a raw numeric id, so a shared/bookmarked link
  // stays meaningful and stable even if lessons are ever re-seeded in a different order.
  @Column({ unique: true })
  slug: string;

  @Column()
  title: string;

  @Column({ type: 'text' })
  category: LessonCategory;

  // Coarse difficulty band, same "human-assigned, not computed" spirit as
  // Puzzle.difficulty — 1 (beginner) .. 3 (advanced).
  @Column({ default: 1 })
  difficulty: number;

  // One-sentence hook shown on the /learn index card, before a reader opens the
  // lesson itself.
  @Column({ type: 'text' })
  summary: string;

  // The lesson body — an array of paragraphs (plain text, one entry per paragraph)
  // rather than a single markdown blob: this app has no markdown renderer anywhere
  // else, and a plain paragraph array is trivial to render safely without pulling in
  // one just for this.
  @Column('simple-json')
  body: string[];

  // An optional real position to illustrate the lesson (e.g. the classic "two kings
  // vs one king" first-position win, or the bridge formation) — reuses the exact
  // same board-diagram shape Puzzle.board already does, so the frontend can render it
  // with the same read-only Board component used elsewhere. Nullable: a purely
  // conceptual lesson (e.g. "control the center") doesn't need one.
  @Column('simple-json', { nullable: true })
  exampleBoard: any; // null when the lesson has no diagram

  @Column({ default: 8 })
  exampleBoardSize: number; // only meaningful when exampleBoard is set

  // Display order within a category (lower first) — independent of id/slug so the
  // reading order can be curated (e.g. "control the center" before "the shot") rather
  // than accidentally following insertion order.
  @Column({ default: 0 })
  orderIndex: number;
}

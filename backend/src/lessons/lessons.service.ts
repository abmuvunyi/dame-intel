import { Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Lesson, LessonCategory } from './lesson.entity';
import { PieceColor, PieceType, BoardState } from '../game/engine/engine.service';

function emptyBoard(size: number): BoardState {
  return Array(size).fill(null).map(() => Array(size).fill(null));
}
function place(board: BoardState, row: number, col: number, color: PieceColor, type: PieceType = PieceType.MAN) {
  board[row][col] = { color, type };
}

// The one lesson below with a diagram (Two Kings vs One King) is a REAL, verified
// legal position — loaded through the actual engine and confirmed to produce legal
// moves for the side to move (see this PR's description for the verification
// script), not a hand-drawn illustration nobody checked. Every other lesson is
// deliberately text-only rather than paired with an invented "textbook" diagram this
// codebase can't actually verify the historical accuracy of — real, general, safely-
// accurate content over a precise-looking but unverifiable claim.
function twoKingsVsOneKingBoard(): BoardState {
  const board = emptyBoard(8);
  place(board, 2, 3, PieceColor.LIGHT, PieceType.KING);
  place(board, 2, 5, PieceColor.LIGHT, PieceType.KING);
  place(board, 5, 4, PieceColor.DARK, PieceType.KING);
  return board;
}

// Real, curated lesson content — see lesson.entity.ts's own comment on why this is
// hand-authored rather than mined the way puzzles are. Kept deliberately general and
// safely accurate rather than citing precise "textbook" positions/move sequences this
// codebase has no way to independently verify against a real source.
const LESSON_CONTENT: Array<Omit<Lesson, 'id'>> = [
  // --- Opening ---
  {
    slug: 'control-the-center',
    title: 'Control the Center',
    category: 'opening',
    difficulty: 1,
    summary: 'Central pieces reach more of the board than pieces stuck on the edge.',
    body: [
      "A piece in the middle of the board can eventually reach diagonals in more directions than a piece parked on the side columns, which only ever has squares available on one side. Early moves that head toward the center keep your options open later in the game.",
      "This doesn't mean rushing every piece forward — moving too many pieces up before the others are developed can leave gaps in your own position for the opponent to exploit. The goal is influence over the center, not just occupying it.",
    ],
    exampleBoard: null,
    exampleBoardSize: 8,
    orderIndex: 1,
  },
  {
    slug: 'keep-your-king-row-intact',
    title: 'Keep Your King Row Intact Early',
    category: 'opening',
    difficulty: 1,
    summary: "Your back row is what stops the opponent's men from promoting to kings.",
    body: [
      'A man can only promote to a king by reaching your back row (the "king row"). As long as you still have a piece sitting on each of those squares, the opponent literally cannot promote there — the square is occupied.',
      "Moving your own back-row pieces forward too early, before you need to, opens up promotion squares for the opponent's advancing men. It's usually worth keeping at least one or two of these pieces at home well into the game, unless moving one is forced or clearly worth it.",
    ],
    exampleBoard: null,
    exampleBoardSize: 8,
    orderIndex: 2,
  },
  {
    slug: 'develop-toward-the-center',
    title: 'Develop Toward the Center, Not the Edge',
    category: 'opening',
    difficulty: 1,
    summary: 'Edge-column pieces have fewer legal moves than pieces one or two squares in.',
    body: [
      "A piece on the very edge column only ever has moves available on one diagonal, since there's no board past the edge. A piece one or two columns in has real options on both diagonals for most of the game.",
      'Pieces that end up stuck on the edge with no safe moves can become a liability later — if it becomes the only piece you have with any legal move, you may be forced to play it into a bad position.',
    ],
    exampleBoard: null,
    exampleBoardSize: 8,
    orderIndex: 3,
  },

  // --- Middlegame ---
  {
    slug: 'force-favorable-trades',
    title: 'Force Favorable Trades When Ahead',
    category: 'middlegame',
    difficulty: 2,
    summary: "If you're already up material, trading pieces (not just any pieces) usually helps you, not your opponent.",
    body: [
      "With fewer pieces left on the board, a material lead matters proportionally more — being up one piece out of twelve is a much bigger edge than being up one piece out of four. If you're ahead, look for chances to trade evenly (a man for a man), simplifying toward an endgame where your extra piece counts for more.",
      "The reverse is true if you're behind: avoid unforced trades, and look for ways to keep more pieces on the board where your material deficit has more room to matter less and complications can favor you.",
    ],
    exampleBoard: null,
    exampleBoardSize: 8,
    orderIndex: 1,
  },
  {
    slug: 'captures-are-mandatory',
    title: 'Every Capture Is Mandatory — Calculate Before You Commit',
    category: 'middlegame',
    difficulty: 2,
    summary: 'Neither side is allowed to decline a capture, which means a piece can be genuine bait.',
    body: [
      "In draughts, if a capture is available, you must take it — you can't just leave a piece hanging on purpose and ignore it. This is exactly what makes a well-placed \"sacrifice\" so powerful: your opponent isn't just tempted to capture, they're required to, whether or not it actually turns out well for them.",
      "Before offering a piece (or accepting one that's offered), calculate the FULL forced sequence — not just the first capture, but every jump that becomes forced afterward, on both sides. A piece that looks free is sometimes the first domino in a sequence that costs more than it wins.",
    ],
    exampleBoard: null,
    exampleBoardSize: 8,
    orderIndex: 2,
  },
  {
    slug: 'keep-your-pieces-mobile',
    title: 'Keep Your Pieces Mobile',
    category: 'middlegame',
    difficulty: 2,
    summary: 'A piece with no safe square to move to can become a real liability.',
    body: [
      "A piece boxed in by its own side's pieces, or backed into a corner with no safe diagonal, isn't contributing anything — worse, if it ever becomes your only piece with a legal move, you'll be forced to play it, possibly into real trouble.",
      "When you have a choice of which piece to develop or advance, it's often worth favoring the move that keeps the most pieces flexible, rather than the one that looks the most aggressive on the surface.",
    ],
    exampleBoard: null,
    exampleBoardSize: 8,
    orderIndex: 3,
  },

  // --- Endgame ---
  {
    slug: 'lone-king-cannot-force-a-win',
    title: 'A Lone King Cannot Force a Win Alone',
    category: 'endgame',
    difficulty: 1,
    summary: "One king against one king, with nothing else on the board, is always a draw.",
    body: [
      "With just one king on each side and no other pieces, neither player can force a capture the other doesn't want to allow — the defending king always has a safe square to retreat to. Practically, this means you shouldn't play on hoping to somehow win a bare king-vs-king ending; both sides should recognize it as a draw.",
      'This is the baseline every other king-and-piece endgame gets compared against: the real question in an endgame is always "does one side have enough MORE than a lone king to actually force something?"',
    ],
    exampleBoard: null,
    exampleBoardSize: 8,
    orderIndex: 1,
  },
  {
    slug: 'two-kings-vs-one-king',
    title: 'Two Kings vs One King: Cut Off the Escape Squares',
    category: 'endgame',
    difficulty: 2,
    summary: 'Two kings can force a win against a lone king by working together to shrink its space.',
    body: [
      "Unlike a lone king vs. a lone king, two kings against one is a forced win for the side with two — but it takes real technique, not just having more material. Charging both kings forward independently lets the defending king slip between them.",
      "The winning idea is to advance the two attacking kings TOGETHER, always keeping the lone king boxed away from the center and away from any diagonal that would let it slip past. Gradually shrink the space it has to move in, driving it toward an edge or a corner where it eventually runs out of safe squares.",
      "The position below is a starting point for practicing this technique, not a specific memorized sequence — try to work out for yourself which square the defending king would want to move to next, and how the two attacking kings can cut it off.",
    ],
    exampleBoard: twoKingsVsOneKingBoard(),
    exampleBoardSize: 8,
    orderIndex: 2,
  },
  {
    slug: 'the-double-corner-advantage',
    title: 'The Double Corner Advantage',
    category: 'endgame',
    difficulty: 2,
    summary: 'Pieces near the double corner tend to have more safe waiting moves than pieces near the single corner.',
    body: [
      'On a standard board, one corner has a single diagonal column of playable squares leading into it (the "single corner"), while the opposite corner has two columns feeding into it (the "double corner"). A piece defending near the double corner generally has more squares to retreat to and more waiting moves available than a piece stuck defending the single corner.',
      "This is a general tendency, not an absolute rule — the exact position always matters more than the label — but it's a common enough pattern in real endgames that it's worth knowing which corner is which on your own board, and favoring the double corner when you have a genuine choice in how to defend.",
    ],
    exampleBoard: null,
    exampleBoardSize: 8,
    orderIndex: 3,
  },

  // --- Tactics ---
  {
    slug: 'spot-forced-multi-jumps',
    title: 'Spot Forced Multi-Jumps Before You Sacrifice',
    category: 'tactics',
    difficulty: 2,
    summary: 'A single capture can force a whole chain — read the position past the first jump.',
    body: [
      "When a piece lands after a capture, if it can immediately capture again, it has to — multi-jump chains are forced to run their full course, not stopped early by choice. This means a single well-placed sacrifice can sometimes trigger a chain that ends up costing the capturing side far more than the one piece they started with.",
      "Before you offer a piece expecting a specific reply, walk the position forward past the FIRST capture: is there a second one waiting? A third? The same discipline applies when you're the one being offered a piece — check whether accepting drags you into a chain you don't actually want.",
    ],
    exampleBoard: null,
    exampleBoardSize: 8,
    orderIndex: 1,
  },
  {
    slug: 'the-value-of-tempo',
    title: 'The Value of Tempo',
    category: 'tactics',
    difficulty: 3,
    summary: "Sometimes the exact move doesn't matter as much as making your opponent move first.",
    body: [
      "In quiet positions with few pieces left, whose turn it is to move can matter more than exactly where any one piece stands — a player forced to move when every available move weakens their position is in real trouble, even with equal material.",
      "Losing a \"tempo\" on purpose (making a move that doesn't obviously improve anything) can sometimes be the strongest idea on the board, if it hands your opponent the obligation to move next in a position where every option is bad for them.",
    ],
    exampleBoard: null,
    exampleBoardSize: 8,
    orderIndex: 2,
  },
];

@Injectable()
export class LessonsService implements OnModuleInit {
  constructor(
    @InjectRepository(Lesson)
    private lessonsRepository: Repository<Lesson>,
  ) {}

  // Same "only seed an empty table" pattern PuzzlesService.onModuleInit already uses
  // — idempotent, safe to run on every boot.
  async onModuleInit(): Promise<void> {
    const count = await this.lessonsRepository.count();
    if (count === 0) {
      await this.lessonsRepository.save(this.lessonsRepository.create(LESSON_CONTENT));
    }
  }

  async listAll(category?: LessonCategory): Promise<Lesson[]> {
    const where = category ? { category } : {};
    return this.lessonsRepository.find({ where, order: { category: 'ASC', orderIndex: 'ASC' } });
  }

  async getBySlug(slug: string): Promise<Lesson> {
    const lesson = await this.lessonsRepository.findOne({ where: { slug } });
    if (!lesson) throw new NotFoundException('Lesson not found');
    return lesson;
  }
}

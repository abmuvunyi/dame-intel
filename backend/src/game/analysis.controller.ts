import { Controller, Post, Body } from '@nestjs/common';
import { AiService } from './ai/ai/ai.service';
import { DraughtsEngine, BoardState, PieceColor, GameRules } from './engine/engine.service';

@Controller('analysis')
export class AnalysisController {
  constructor(private readonly aiService: AiService) {}

  @Post()
  analyze(@Body() body: { board: BoardState, turn: PieceColor, depth: number, rules?: Partial<GameRules> }) {
    // The board size (and with it, flying-kings/majority-capture/etc.) must match the
    // position being analyzed, not the engine's bare default (8x8). The caller may pass
    // `rules` explicitly; failing that, the submitted board's own dimensions are the
    // most reliable signal of which variant it belongs to.
    const boardSize = body.rules?.boardSize ?? body.board.length;
    const engine = new DraughtsEngine({ ...body.rules, boardSize });
    engine.loadBoard(body.board, body.turn);

    // Default to depth 4 for quick analysis
    const depth = body.depth || 4;

    const evaluations = this.aiService.analyzePosition(engine, depth);

    return evaluations;
  }
}

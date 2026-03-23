import { Controller, Post, Body } from '@nestjs/common';
import { AiService } from './ai/ai/ai.service';
import { DraughtsEngine, BoardState, PieceColor, GameVariant } from './engine/engine.service';

@Controller('analysis')
export class AnalysisController {
  constructor(private readonly aiService: AiService) {}

  @Post()
  analyze(@Body() body: { board: BoardState, turn: PieceColor, depth: number, variant?: GameVariant }) {
    const variant = body.variant || GameVariant.STANDARD;
    const engine = new DraughtsEngine(variant);
    engine.loadBoard(body.board, body.turn);

    // Default to depth 4 for quick analysis
    const depth = body.depth || 4;

    const evaluations = this.aiService.analyzePosition(engine, depth);

    return evaluations;
  }
}

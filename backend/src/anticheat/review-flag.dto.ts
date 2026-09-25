import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export const MODERATOR_ACTIONS = ['DISMISS', 'WARN', 'RATING_RESET_FLAG', 'TEMP_BAN', 'PERMA_BAN'] as const;
export type ModeratorAction = (typeof MODERATOR_ACTIONS)[number];

export class ReviewFlagDto {
  @IsIn(MODERATOR_ACTIONS)
  action: ModeratorAction;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(365)
  tempBanDays?: number;
}

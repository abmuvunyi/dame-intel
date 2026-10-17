import { IsIn, IsInt, IsNumber, IsOptional, IsString, Length, Max, Min } from 'class-validator';

export class CreateTournamentDto {
  @IsString()
  @Length(3, 100)
  name: string;

  @IsString()
  @Length(1, 20)
  format: string;

  @IsOptional() @IsInt() @Min(1) @Max(30)
  totalRounds?: number;

  @IsOptional() @IsInt() @Min(2) @Max(1000)
  maxParticipants?: number;

  @IsOptional() @IsString() @Length(1, 30)
  timeControl?: string;

  @IsOptional() @IsIn([8, 10])
  boardSize?: number;

  @IsOptional() @IsString() @Length(1, 30)
  variant?: string;

  @IsOptional() @IsNumber() @Min(0) @Max(10)
  pointsWin?: number;

  @IsOptional() @IsNumber() @Min(0) @Max(10)
  pointsDraw?: number;

  @IsOptional() @IsNumber() @Min(0) @Max(10)
  pointsLoss?: number;
}

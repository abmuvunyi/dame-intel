import { IsOptional, IsString, Length, MaxLength } from 'class-validator';

export class CreateClubDto {
  @IsString()
  @Length(3, 60)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}

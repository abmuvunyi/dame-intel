import { IsString, Length, Matches, MaxLength, MinLength } from 'class-validator';

// Phase 14: validated request bodies for the two unauthenticated write endpoints
// (previously `Record<string, any>`). Login is intentionally lenient on shape — it
// must keep accepting accounts created before these registration rules existed.
export class LoginDto {
  @IsString()
  @Length(1, 64)
  username: string;

  @IsString()
  @Length(1, 128)
  password: string;
}

export class RegisterDto {
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{3,20}$/, {
    message: 'Username must be 3-20 characters: letters, numbers, "_" or "-".',
  })
  username: string;

  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters.' })
  @MaxLength(128)
  password: string;
}

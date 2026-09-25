import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsIn, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { ROLES } from '../access/roles';

export class SetRolesDto {
  @IsArray()
  @ArrayMaxSize(ROLES.length)
  @IsIn(ROLES, { each: true })
  roles: string[];

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class AuditQueryDto {
  @IsOptional() @IsString() @MaxLength(64)
  action?: string;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  actorUserId?: number;

  @IsOptional() @IsString() @MaxLength(32)
  targetType?: string;

  @IsOptional() @IsString() @MaxLength(64)
  targetId?: string;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  page?: number;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  pageSize?: number;
}

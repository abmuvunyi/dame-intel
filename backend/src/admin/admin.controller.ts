import { BadRequestException, Body, Controller, Get, NotFoundException, Param, ParseIntPipe, Put, Query, Request, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { PermissionsGuard, RequirePermissions } from '../access/permissions.guard';
import { PERMISSIONS, ROLES, ROLE_DESCRIPTIONS, ROLE_PERMISSIONS, normalizeRoles } from '../access/roles';
import { UsersService } from '../users/users.service';
import { AuditService } from '../audit/audit.service';
import { User } from '../users/user.entity';
import { AuditQueryDto, SetRolesDto } from './admin.dto';

// Staff administration: role management and the audit trail. Every route requires a
// specific permission (see access/roles.ts); nothing here is reachable by players.
@Controller('admin')
@UseGuards(AuthGuard, PermissionsGuard)
export class AdminController {
  constructor(
    private readonly usersService: UsersService,
    private readonly audit: AuditService,
  ) {}

  private summary(user: User) {
    const access = this.usersService.accessFor(user);
    return {
      id: user.id,
      username: user.username,
      roles: this.usersService.getRoles(user),
      plan: access.plan,
      planSource: access.source,
      moderationStatus: user.moderationStatus,
      createdAt: user.createdAt,
    };
  }

  @Get('roles')
  @RequirePermissions(PERMISSIONS.USERS_READ)
  listRoles() {
    return ROLES.map((role) => ({ role, description: ROLE_DESCRIPTIONS[role], permissions: ROLE_PERMISSIONS[role] }));
  }

  @Get('users')
  @RequirePermissions(PERMISSIONS.USERS_READ)
  async searchUsers(@Query('search') search?: string) {
    return (await this.usersService.searchUsers(search)).map((u) => this.summary(u));
  }

  @Get('staff')
  @RequirePermissions(PERMISSIONS.USERS_READ)
  async listStaff() {
    return (await this.usersService.listStaff()).map((u) => this.summary(u));
  }

  @Put('users/:id/roles')
  @RequirePermissions(PERMISSIONS.ROLES_MANAGE)
  async setRoles(@Request() req: any, @Param('id', ParseIntPipe) id: number, @Body() body: SetRolesDto) {
    const target = await this.usersService.findOneById(id);
    if (!target) throw new NotFoundException('User not found');
    const next = normalizeRoles(body.roles);
    // Never allow the platform to end up with no administrator.
    if (this.usersService.isAdmin(target) && !next.includes('ADMIN') && (await this.usersService.countAdmins()) <= 1) {
      throw new BadRequestException('Cannot remove the last administrator.');
    }
    const updated = await this.usersService.setRoles(id, next, { actorUserId: req.user.sub, reason: body.reason, req });
    return this.summary(updated!);
  }

  @Get('audit')
  @RequirePermissions(PERMISSIONS.AUDIT_READ)
  listAudit(@Query() query: AuditQueryDto) {
    return this.audit.list(query);
  }
}

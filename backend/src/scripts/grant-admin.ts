// Grant or revoke a staff role from the command line (bootstrap the first admin, or
// recover if every admin is locked out). Every change is written to the audit trail.
//
//   npm run admin:grant -- <username>                      (grant ADMIN)
//   npm run admin:grant -- <username> MODERATOR            (grant another role)
//   npm run admin:grant -- <username> MODERATOR --revoke   (revoke it)
//
// Roles: ADMIN, MODERATOR, ORGANIZER, CONTENT_EDITOR. Uses the same database
// configuration as the app itself.
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { UsersService } from '../users/users.service';
import { ROLES, isRole } from '../access/roles';

async function main() {
  process.env.PUZZLE_SEED_ON_BOOT = 'false'; // a one-off CLI run must never start seeding
  const args = process.argv.slice(2);
  const revoke = args.includes('--revoke');
  const [username, roleArg] = args.filter((a) => !a.startsWith('--'));
  const role = (roleArg ?? 'ADMIN').toUpperCase();
  if (!username || !isRole(role)) {
    console.error(`Usage: npm run admin:grant -- <username> [${ROLES.join('|')}] [--revoke]`);
    process.exit(2);
  }
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  try {
    const users = app.get(UsersService);
    const user = await users.findOneByUsername(username);
    if (!user) {
      console.error(`No user named "${username}".`);
      process.exitCode = 1;
      return;
    }
    const current = users.getRoles(user);
    const next = revoke ? current.filter((r) => r !== role) : [...current, role];
    const updated = await users.setRoles(user.id, next, { actorType: 'CLI', reason: 'admin:grant CLI' });
    console.log(`"${username}" roles: [${users.getRoles(updated).join(', ') || 'none'}]`);
  } finally {
    await app.close();
  }
}

void main();

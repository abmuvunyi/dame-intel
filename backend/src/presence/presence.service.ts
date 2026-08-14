import { Injectable } from '@nestjs/common';

// Minimal in-memory online-status registry, shared between GameGateway (the only
// thing that actually knows who's connected) and any REST-side consumer that wants
// to show it (FriendsService's "online" indicator, Phase 10). Deliberately just a
// Set, not persisted anywhere — "online" only ever means "has a live socket right
// now", which by definition can't survive a server restart, so there's nothing
// worth persisting.
@Injectable()
export class PresenceService {
  private onlineUserIds = new Set<number>();

  markOnline(userId: number): void {
    this.onlineUserIds.add(userId);
  }

  markOffline(userId: number): void {
    this.onlineUserIds.delete(userId);
  }

  isOnline(userId: number): boolean {
    return this.onlineUserIds.has(userId);
  }

  getOnlineUserIds(): number[] {
    return Array.from(this.onlineUserIds);
  }
}

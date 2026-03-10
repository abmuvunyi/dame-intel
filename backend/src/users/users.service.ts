import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './user.entity';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private usersRepository: Repository<User>,
  ) {}

  findOneByUsername(username: string): Promise<User | null> {
    return this.usersRepository.findOneBy({ username });
  }

  findOneById(id: number): Promise<User | null> {
    return this.usersRepository.findOneBy({ id });
  }

  async create(username: string, passwordHash: string): Promise<User> {
    const user = this.usersRepository.create({ username, passwordHash });
    return this.usersRepository.save(user);
  }

  async updateRating(id: number, ratingDelta: number, result: 'win' | 'loss' | 'draw'): Promise<User | null> {
      const user = await this.usersRepository.findOneBy({ id });
      if (!user) return null;

      user.rating += ratingDelta;
      user.gamesPlayed += 1;
      if (result === 'win') user.wins += 1;
      else if (result === 'loss') user.losses += 1;
      else if (result === 'draw') user.draws += 1;

      return this.usersRepository.save(user);
  }
}

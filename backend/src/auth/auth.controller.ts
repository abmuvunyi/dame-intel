import { Body, Controller, Post, Get, UseGuards, Request } from '@nestjs/common';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { AuthGuard } from './auth.guard';

@Controller('auth')
export class AuthController {
  constructor(
      private authService: AuthService,
      private usersService: UsersService
    ) {}

  @Post('login')
  signIn(@Body() signInDto: Record<string, any>) {
    return this.authService.signIn(signInDto.username, signInDto.password);
  }

  @Post('register')
  signUp(@Body() signUpDto: Record<string, any>) {
    return this.authService.signUp(signUpDto.username, signUpDto.password);
  }

  @UseGuards(AuthGuard)
  @Get('profile')
  async getProfile(@Request() req: any) {
    const user = await this.usersService.findOneById(req.user.sub);
    if (!user) return null;
    const { passwordHash, ...result } = user;
    return result;
  }
}

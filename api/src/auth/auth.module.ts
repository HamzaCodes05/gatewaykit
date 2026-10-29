import {
  Body, CanActivate, Controller, ExecutionContext, Global, Injectable, Module, Post, UnauthorizedException,
} from '@nestjs/common';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { IsEmail, IsString } from 'class-validator';

class LoginDto {
  @IsEmail() email: string;
  @IsString() password: string;
}

@Controller('auth')
class AuthController {
  constructor(private readonly jwt: JwtService) {}

  /** Single admin account from env, for the dashboard. Swap for real users in production. */
  @Post('login')
  async login(@Body() dto: LoginDto) {
    const ok =
      dto.email.toLowerCase() === (process.env.ADMIN_EMAIL ?? 'admin@gatewaykit.dev') &&
      dto.password === (process.env.ADMIN_PASSWORD ?? 'admin1234');
    if (!ok) throw new UnauthorizedException('Invalid credentials');
    return { accessToken: await this.jwt.signAsync({ sub: 'admin', email: dto.email }) };
  }
}

@Injectable()
export class JwtGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest();
    const [type, token] = (req.headers.authorization ?? '').split(' ');
    if (type !== 'Bearer' || !token) throw new UnauthorizedException();
    try {
      req.user = await this.jwt.verifyAsync(token);
      return true;
    } catch {
      throw new UnauthorizedException();
    }
  }
}

@Global()
@Module({
  imports: [JwtModule.register({ secret: process.env.JWT_SECRET ?? 'dev-secret', signOptions: { expiresIn: '12h' } })],
  controllers: [AuthController],
  providers: [JwtGuard],
  exports: [JwtModule, JwtGuard],
})
export class AuthModule {}

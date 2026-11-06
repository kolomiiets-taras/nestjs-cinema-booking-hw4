import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { IS_PUBLIC_KEY } from '../../common/decorators/public.decorator';
import { isUserRole } from '../../users/user-role.enum';
import { AuthRequest } from '../interfaces/auth-user.interface';
import { JwtPayload } from '../interfaces/jwt-payload.interface';

const BEARER = /^Bearer (\S+)$/i;

/**
 * Global guard (APP_GUARD): every route needs a valid access token
 * unless it is marked with @Public(). The token is checked by its
 * signature and `exp` only — no database query per request.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwtService: JwtService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean | undefined>(
      IS_PUBLIC_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthRequest>();
    const token = BEARER.exec(request.headers.authorization ?? '')?.[1];
    if (!token) {
      throw new UnauthorizedException(
        'Access token is required: Authorization: Bearer <token>',
      );
    }

    let payload: JwtPayload;
    try {
      payload = await this.jwtService.verifyAsync<JwtPayload>(token);
    } catch {
      throw new UnauthorizedException('Access token is invalid or expired');
    }
    if (typeof payload.sub !== 'string' || !isUserRole(payload.role)) {
      throw new UnauthorizedException('Access token is invalid or expired');
    }

    request.user = { id: payload.sub, role: payload.role };
    return true;
  }
}

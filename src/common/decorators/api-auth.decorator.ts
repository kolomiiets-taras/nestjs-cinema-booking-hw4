import { applyDecorators } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { ErrorResponseDto } from '../dto/error-response.dto';

/**
 * Swagger description of a protected route: Bearer scheme + 401,
 * and 403 with the given reason when access can be forbidden.
 */
export function ApiAuth(forbiddenReason?: string) {
  const decorators = [
    ApiBearerAuth(),
    ApiUnauthorizedResponse({
      type: ErrorResponseDto,
      description:
        'Немає заголовка Authorization: Bearer <token>, формат зіпсований, підпис недійсний або токен прострочений',
    }),
  ];
  if (forbiddenReason) {
    decorators.push(
      ApiForbiddenResponse({
        type: ErrorResponseDto,
        description: forbiddenReason,
      }),
    );
  }
  return applyDecorators(...decorators);
}

export const ADMIN_ONLY = 'Маршрут лише для адміністратора (роль user)';

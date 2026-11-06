import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { ApiAuth } from '../common/decorators/api-auth.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { ErrorResponseDto } from '../common/dto/error-response.dto';
import { User } from '../users/entities/user.entity';
import { AuthService } from './auth.service';
import { CurrentUserDto } from './dto/current-user.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { RegisterDto } from './dto/register.dto';
import { TokenPairDto } from './dto/token-pair.dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('register')
  @ApiCreatedResponse({
    type: User,
    description: 'Користувача створено з роллю user (без пароля та його хеша)',
  })
  @ApiBadRequestResponse({
    type: ErrorResponseDto,
    description: 'Некоректна пошта або пароль коротший за 8 символів',
  })
  @ApiConflictResponse({
    type: ErrorResponseDto,
    description: 'Користувач з такою поштою вже існує',
  })
  register(@Body() dto: RegisterDto): Promise<User> {
    return this.authService.register(dto);
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: TokenPairDto, description: 'Пара токенів' })
  @ApiBadRequestResponse({
    type: ErrorResponseDto,
    description: 'Поле відсутнє або не рядок',
  })
  @ApiUnauthorizedResponse({
    type: ErrorResponseDto,
    description:
      'Неправильна пошта або пароль (повідомлення однакове в обох випадках)',
  })
  login(@Body() dto: LoginDto): Promise<TokenPairDto> {
    return this.authService.login(dto);
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({
    type: TokenPairDto,
    description: 'Нова пара токенів; переданий refresh-токен більше не діє',
  })
  @ApiBadRequestResponse({
    type: ErrorResponseDto,
    description: 'refreshToken відсутній',
  })
  @ApiUnauthorizedResponse({
    type: ErrorResponseDto,
    description:
      'Refresh-токен не знайдено, він прострочений або вже використаний',
  })
  refresh(@Body() dto: RefreshTokenDto): Promise<TokenPairDto> {
    return this.authService.refresh(dto.refreshToken);
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiAuth()
  @ApiNoContentResponse({ description: 'Refresh-токен відкликано' })
  @ApiBadRequestResponse({
    type: ErrorResponseDto,
    description: 'refreshToken відсутній',
  })
  @ApiNotFoundResponse({
    type: ErrorResponseDto,
    description: 'Refresh-токен не належить поточному користувачу або не існує',
  })
  logout(
    @CurrentUser('id') userId: string,
    @Body() dto: RefreshTokenDto,
  ): Promise<void> {
    return this.authService.logout(userId, dto.refreshToken);
  }

  @Get('me')
  @ApiAuth()
  @ApiOkResponse({ type: CurrentUserDto, description: 'Поточний користувач' })
  me(@CurrentUser('id') userId: string): Promise<CurrentUserDto> {
    return this.authService.me(userId);
  }
}

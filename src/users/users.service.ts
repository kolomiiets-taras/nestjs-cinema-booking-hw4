import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './entities/user.entity';
import { UserRole } from './user-role.enum';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
  ) {}

  /** Role is never taken from the request: every new account is a user. */
  create(email: string, passwordHash: string): Promise<User> {
    return this.usersRepository.save(
      this.usersRepository.create({
        email,
        passwordHash,
        role: UserRole.User,
      }),
    );
  }

  findById(id: string): Promise<User | null> {
    return this.usersRepository.findOneBy({ id });
  }

  findByEmail(email: string): Promise<User | null> {
    return this.usersRepository.findOneBy({ email });
  }

  existsByEmail(email: string): Promise<boolean> {
    return this.usersRepository.existsBy({ email });
  }
}

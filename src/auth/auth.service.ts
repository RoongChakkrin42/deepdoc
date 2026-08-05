import {
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { EnvironmentVariables } from '../common/config/env.validation';
import { UsersRepository } from '../users/users.repository';

const BCRYPT_ROUNDS = 12;

export interface AuthenticatedUser {
  userId: string;
  username: string;
}

export interface TokenPair {
  access_token: string;
  refresh_token: string;
  token_type: 'Bearer';
}

interface JwtPayload {
  sub: string;
  username: string;
  type: 'access' | 'refresh';
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly users: UsersRepository,
    private readonly jwt: JwtService,
    private readonly config: ConfigService<EnvironmentVariables, true>,
  ) {}

  /** Used by the local passport strategy. Returns null on any failure. */
  async validateCredentials(
    username: string,
    password: string,
  ): Promise<AuthenticatedUser | null> {
    const user = await this.users.findByUsernameWithPassword(username);

    if (!user) {
      // Spend the same time as a real comparison so the response time does not
      // reveal whether the username exists.
      await bcrypt.compare(password, `$2b$${BCRYPT_ROUNDS}$${'.'.repeat(53)}`);
      return null;
    }

    const matches = await bcrypt.compare(password, user.password);
    // `_id` rather than the `id` virtual: Mongoose types the virtual as `any`.
    return matches
      ? { userId: String(user._id), username: user.username }
      : null;
  }

  issueTokens(user: AuthenticatedUser): TokenPair {
    const base = { sub: user.userId, username: user.username };
    return {
      access_token: this.jwt.sign(
        { ...base, type: 'access' } satisfies JwtPayload,
        { expiresIn: this.config.get('JWT_ACCESS_TTL', { infer: true }) },
      ),
      refresh_token: this.jwt.sign(
        { ...base, type: 'refresh' } satisfies JwtPayload,
        { expiresIn: this.config.get('JWT_REFRESH_TTL', { infer: true }) },
      ),
      token_type: 'Bearer',
    };
  }

  /** Exchanges a valid refresh token for a fresh pair. */
  async refresh(refreshToken: string): Promise<TokenPair> {
    let payload: JwtPayload;
    try {
      payload = this.jwt.verify<JwtPayload>(refreshToken);
    } catch {
      throw new UnauthorizedException('Refresh token is invalid or expired');
    }

    if (payload.type !== 'refresh') {
      throw new UnauthorizedException('Not a refresh token');
    }

    const user = await this.users.findByUsername(payload.username);
    if (!user) {
      throw new UnauthorizedException('User no longer exists');
    }

    return this.issueTokens({
      userId: String(user._id),
      username: user.username,
    });
  }

  async register(
    username: string,
    password: string,
  ): Promise<{ username: string }> {
    const existing = await this.users.findByUsername(username);
    if (existing) {
      throw new ConflictException('Username is already taken');
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const user = await this.users.create(username, passwordHash);
    this.logger.log(`Registered reviewer "${user.username}"`);

    return { username: user.username };
  }
}

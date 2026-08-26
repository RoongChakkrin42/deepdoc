import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module';
import { validateEnv } from '../common/config/env.validation';
import { mongooseOptions } from '../common/config/mongoose.options';

/**
 * The smallest module that can register a reviewer: config, a database
 * connection, and `AuthService`.
 *
 * Booting `AppModule` here would be a real mistake rather than merely wasteful.
 * It pulls in `SubmissionsModule`, whose `onApplicationBootstrap` selects every
 * `pending`/`processing` submission and starts grading each one — so seeding an
 * account against a running cluster would re-run analyses the live pod is
 * already running, pay Gemini twice for each, and race the two writers on the
 * same document. `AuthModule` reaches only `UsersModule`, `PassportModule` and
 * `JwtModule`, none of which start background work.
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
      cache: true,
    }),
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: mongooseOptions,
    }),
    AuthModule,
  ],
})
export class SeedModule {}

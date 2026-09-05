import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { ThrottlerModule } from '@nestjs/throttler';
import { AnalysisModule } from './analysis/analysis.module';
import { AuthModule } from './auth/auth.module';
import { validateEnv } from './common/config/env.validation';
import { mongooseOptions } from './common/config/mongoose.options';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { ProxyAwareThrottlerGuard } from './common/guards/proxy-aware-throttler.guard';
import { HealthModule } from './health/health.module';
import { StorageModule } from './storage/storage.module';
import { SubmissionsModule } from './submissions/submissions.module';
import { UsersModule } from './users/users.module';

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
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 60 }]),
    HealthModule,
    UsersModule,
    AuthModule,
    StorageModule,
    AnalysisModule,
    SubmissionsModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ProxyAwareThrottlerGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}

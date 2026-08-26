import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';

/**
 * No imports: `MongooseCoreModule` is global, so `@InjectConnection()` resolves
 * from whatever `MongooseModule.forRootAsync` set up in `AppModule`.
 */
@Module({ controllers: [HealthController] })
export class HealthModule {}

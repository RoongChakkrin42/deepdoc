import { ConfigService } from '@nestjs/config';
import { MongooseModuleFactoryOptions } from '@nestjs/mongoose';
import { EnvironmentVariables } from './env.validation';

/**
 * Shared by the API and the seed script so their connection behaviour cannot
 * drift — the retry settings matter most in exactly the situation the seed
 * script runs in, against a cluster that may still be starting.
 */
export const mongooseOptions = (
  config: ConfigService<EnvironmentVariables, true>,
): MongooseModuleFactoryOptions => ({
  uri: config.get('MONGODB_URI', { infer: true }),
  // Defaults are 3 attempts, 3s apart, then the whole app fails to bootstrap.
  // In Kubernetes the API pod routinely starts before its database is
  // accepting connections, and a hard failure there means CrashLoopBackOff —
  // which backs off to five minutes and makes a healthy cluster look broken.
  // Wait it out instead.
  retryAttempts: 20,
  retryDelay: 3000,
  serverSelectionTimeoutMS: 10_000,
});

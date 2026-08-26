import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { EnvironmentVariables } from './common/config/env.validation';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Behind an ingress every request arrives from the proxy, so without this
  // `req.ip` is one constant address for the entire internet — and the
  // throttler keys on `req.ip`. The 5-uploads-per-hour and 5-logins-per-minute
  // limits would then apply globally rather than per client, on two endpoints
  // that are unauthenticated by design with rate limiting as their only
  // protection. This is half the fix; the ingress must also preserve the
  // client address (`externalTrafficPolicy: Local` on the Traefik Service).
  app.set('trust proxy', 1);
  const config = app.get(ConfigService<EnvironmentVariables, true>);
  const logger = new Logger('Bootstrap');

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );

  // Allowed browser origins come from CORS_ORIGINS rather than a hardcoded list.
  app.enableCors({
    origin: config.get('CORS_ORIGINS', { infer: true }),
    credentials: true,
  });

  app.enableShutdownHooks();

  const port = config.get('PORT', { infer: true });
  // Explicit host: the default already binds every interface, but in a
  // container that is load-bearing rather than incidental, so say it.
  await app.listen(port, '0.0.0.0');
  logger.log(`DeepDoc API listening on port ${port}`);
}

void bootstrap();

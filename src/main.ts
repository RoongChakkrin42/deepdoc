import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.useStaticAssets(join(__dirname, '..', 'uploads'));
  app.enableCors({
    origin: 'http://localhost:3000', // ✅ allow frontend
    credentials: true,               // ✅ if using cookies or auth headers
  });
  await app
    .listen(process.env.PORT ?? 3000)
    .then(() => console.log('App listening at port ', process.env.PORT || 3000));
}
bootstrap();

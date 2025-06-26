import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.useStaticAssets(join(__dirname, '..', 'uploads'));
  await app
    .listen(process.env.PORT ?? 3000)
    .then(() => console.log('App listening at port ', process.env.PORT || 3000));
}
bootstrap();

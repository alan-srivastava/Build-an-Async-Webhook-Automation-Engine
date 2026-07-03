import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  // rawBody:true makes NestJS's underlying body-parser stash the raw
  // request buffer on req.rawBody *in addition to* parsing req.body as
  // JSON. We need the raw bytes to verify HMAC signatures correctly -
  // verifying a signature against a re-serialized JSON.stringify(body)
  // would break the moment key order or whitespace differs from what the
  // sender actually signed.
  const app = await NestFactory.create(AppModule, { rawBody: true });

  app.enableCors();
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true }),
  );

  const port = process.env.PORT || 3000;
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`Debales webhook engine listening on http://localhost:${port}`);
}
bootstrap();

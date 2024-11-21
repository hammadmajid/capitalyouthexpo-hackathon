import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
export function createApiDocument(app: INestApplication) {
  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('HSM API')
      .setVersion('1')
      .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'bearer')
      .addCookieAuth('hsm_access', { type: 'apiKey', in: 'cookie' }, 'cookie')
      .build(),
  );
  document.openapi = '3.1.0';
  return document;
}

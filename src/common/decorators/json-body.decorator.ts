import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';

/**
 * Reads one field out of a multipart body, to be handed to `ParseJsonPipe`.
 *
 * Why not plain `@Body('data', new ParseJsonPipe(Dto))`: the parameter's
 * declared type becomes its metatype, so the **global** `ValidationPipe` runs
 * first and tries to `plainToInstance(Dto, "<raw json string>")`. Transforming
 * a string into a class yields an empty instance, so every field then fails
 * validation and the request 400s before the parse pipe is ever reached.
 *
 * `ValidationPipe` skips parameters built with `createParamDecorator` unless
 * `validateCustomDecorators` is enabled, so routing the value through this
 * decorator lets `ParseJsonPipe` do the parsing and validation itself.
 */
export const JsonBody = createParamDecorator(
  (key: string, ctx: ExecutionContext): unknown => {
    const request = ctx.switchToHttp().getRequest<Request>();
    return (request.body as Record<string, unknown> | undefined)?.[key];
  },
);

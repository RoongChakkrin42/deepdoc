import {
  Controller,
  Get,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { SkipThrottle } from '@nestjs/throttler';
import { Connection, ConnectionStates } from 'mongoose';

/**
 * Probe endpoints for the orchestrator.
 *
 * `@SkipThrottle()` is not optional here. The global `ThrottlerGuard` allows 60
 * requests a minute per IP, and every probe from the kubelet shares one source
 * address — without this the pod starts answering 429, which a probe reads as
 * "dead" and answers by restarting a perfectly healthy container.
 *
 * The split between the two routes is the whole point:
 *
 *  - **liveness** asks "is this process wedged?" and must answer from the
 *    process alone. If it checked MongoDB, a database blip would make every
 *    replica fail liveness and be killed — turning a recoverable outage into a
 *    restart loop that cannot recover, because restarting does not fix Mongo.
 *  - **readiness** asks "should traffic come here *now*?", and traffic is
 *    useless without the database, so this one does check it. A pod that fails
 *    it is pulled out of the Service and left running to recover.
 */
@SkipThrottle()
@Controller()
export class HealthController {
  private readonly logger = new Logger(HealthController.name);

  constructor(@InjectConnection() private readonly connection: Connection) {}

  @Get('healthz')
  live(): { status: string } {
    return { status: 'ok' };
  }

  @Get('readyz')
  ready(): { status: string; database: string } {
    if (this.connection.readyState !== ConnectionStates.connected) {
      const state = ConnectionStates[this.connection.readyState];
      this.logger.warn(`Not ready: MongoDB connection is "${state}"`);
      throw new ServiceUnavailableException(`MongoDB connection is "${state}"`);
    }

    return { status: 'ok', database: 'connected' };
  }
}

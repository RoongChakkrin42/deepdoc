import { ServiceUnavailableException } from '@nestjs/common';
import { Connection, ConnectionStates } from 'mongoose';
import { HealthController } from './health.controller';

const controllerWith = (readyState: ConnectionStates) =>
  new HealthController({ readyState } as Connection);

describe('HealthController', () => {
  it('reports liveness without consulting the database', () => {
    // Disconnected on purpose: liveness that depends on Mongo turns a database
    // outage into a restart loop, because restarting does not fix Mongo.
    const controller = controllerWith(ConnectionStates.disconnected);

    expect(controller.live()).toEqual({ status: 'ok' });
  });

  it('reports readiness when the database is connected', () => {
    const controller = controllerWith(ConnectionStates.connected);

    expect(controller.ready()).toEqual({
      status: 'ok',
      database: 'connected',
    });
  });

  it.each([
    ConnectionStates.disconnected,
    ConnectionStates.connecting,
    ConnectionStates.disconnecting,
  ])('refuses traffic while the connection is %s', (state) => {
    const controller = controllerWith(state);

    expect(() => controller.ready()).toThrow(ServiceUnavailableException);
  });
});

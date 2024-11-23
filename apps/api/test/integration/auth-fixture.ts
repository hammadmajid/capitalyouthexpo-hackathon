import { EmailAssociationRepository } from '../../src/auth/email-association.repository.js';
import { EmailAssociationService } from '../../src/auth/email-association.service.js';
import { ProfileDetailsRepository } from '../../src/auth/profile-details.repository.js';
import { ProfileDetailsService } from '../../src/auth/profile-details.service.js';
import { InvitationRepository } from '../../src/management/invitation.repository.js';
import { InvitationService } from '../../src/management/invitation.service.js';
import { HostelSetupRepository } from '../../src/management/hostel-setup.repository.js';
import { HostelSetupService } from '../../src/management/hostel-setup.service.js';
import { ManagerAcceptanceRepository } from '../../src/auth/manager-acceptance.repository.js';
import { ManagerAcceptanceService } from '../../src/auth/manager-acceptance.service.js';
import { ManagementService } from '../../src/management/service.js';
import { ManagementReadRepository } from '../../src/management/read.repository.js';
import { StaffRepository } from '../../src/management/staff.repository.js';
import { IdempotencyRepository } from '../../src/idempotency/repository.js';
import { IdempotencyService } from '../../src/idempotency/service.js';
import { testKeys } from '../keys.js';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { Controller, Get, type Type } from '@nestjs/common';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { GenericContainer, Wait, type StartedTestContainer } from 'testcontainers';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { createDatabase } from '@hsm/db';
import { createApplication } from '../../src/app.js';
import { Self } from '../../src/access.js';
import { parseEnvironment } from '../../src/config.js';
import { LiveInfrastructure } from '../../src/infrastructure.js';
import { AuthCrypto, hashPassword } from '../../src/auth/crypto.js';
import { AuthTransport } from '../../src/auth/transport.js';
import { SessionRepository } from '../../src/auth/session.repository.js';
import { SessionService } from '../../src/auth/session.service.js';
import { IdentityRepository } from '../../src/auth/identity.repository.js';
import { IdentityService } from '../../src/auth/identity.service.js';
import { OtpRepository } from '../../src/auth/otp.repository.js';
import { OwnerProfileRepository } from '../../src/auth/owner-profile.repository.js';
import { OwnerProfileService } from '../../src/auth/owner-profile.service.js';
import { CustomerProfileRepository } from '../../src/auth/customer-profile.repository.js';
import { CustomerProfileService } from '../../src/auth/customer-profile.service.js';
import { RegistrationRepository } from '../../src/auth/registration.repository.js';
import { RegistrationService } from '../../src/auth/registration.service.js';
import { OtpService } from '../../src/auth/otp.service.js';
import { ManagerRepository } from '../../src/auth/manager.repository.js';
import { ManagerService } from '../../src/auth/manager.service.js';
import { ProfileRepository } from '../../src/auth/profile.repository.js';
import { ScopeRepository } from '../../src/authorization/repository.js';
@Controller('protected-probe')
class ProtectedProbe {
  @Self() @Get() read() {
    return { authenticated: true };
  }
}
export async function authFixture(
  crypto: AuthCrypto,
  now: Date,
  rateLimits: { AUTH_IP_RATE_LIMIT?: number; AUTH_IDENTIFIER_RATE_LIMIT?: number } = {},
  controllers: Type[] = [],
  features?: (
    database: ReturnType<typeof createDatabase>['db'],
    idempotency: IdempotencyService,
  ) => NonNullable<Parameters<typeof createApplication>[4]>,
) {
  let postgres: StartedTestContainer | undefined;
  let redis: StartedTestContainer | undefined;
  let connection: ReturnType<typeof createDatabase> | undefined;
  let infrastructure: LiveInfrastructure | undefined;
  let application: NestFastifyApplication | undefined;
  const close = async () => {
    await application?.close();
    if (!application) await infrastructure?.close();
    await connection?.close();
    await redis?.stop();
    await postgres?.stop();
  };
  try {
    const password = randomBytes(24).toString('hex');
    postgres = await new GenericContainer('postgis/postgis:17-3.5')
      .withEnvironment({ POSTGRES_DB: 'auth', POSTGRES_USER: 'auth', POSTGRES_PASSWORD: password })
      .withExposedPorts(5432)
      .withWaitStrategy(Wait.forLogMessage(/database system is ready to accept connections/, 2))
      .withStartupTimeout(180000)
      .start();
    const databaseUrl = `postgres://auth:${password}@${postgres.getHost()}:${postgres.getMappedPort(5432)}/auth`;
    connection = createDatabase(databaseUrl);
    await migrate(connection.db, {
      migrationsFolder: fileURLToPath(
        new URL('../../../../packages/db/migrations', import.meta.url),
      ),
    });
    redis = await new GenericContainer('redis:7.4-alpine').withExposedPorts(6379).start();
    const config = parseEnvironment({
      ...testKeys(),
      APP_ENV: 'test',
      LOG_LEVEL: 'silent',
      DATABASE_URL: databaseUrl,
      REDIS_URL: `redis://${redis.getHost()}:${redis.getMappedPort(6379)}`,
      CORS_ORIGINS: 'http://localhost:3000',
      // Isolate persisted attempt-policy suites; dedicated rate tests use explicit low limits.
      AUTH_IP_RATE_LIMIT: 1000,
      AUTH_IDENTIFIER_RATE_LIMIT: 100,
      ...rateLimits,
    });
    infrastructure = new LiveInfrastructure(config);
    await infrastructure.connect();
    const repository = new SessionRepository(connection.db);
    const service = new SessionService(repository, crypto, () => now);
    const otp = new OtpService(new OtpRepository(connection.db), crypto, () => now);
    const profiles = new ProfileRepository(connection.db);
    const owner = new OwnerProfileService(
      new OwnerProfileRepository(connection.db, 'auth-private-fixture', undefined, () => now),
      crypto,
      profiles,
      () => now,
    );
    const customer = new CustomerProfileService(
      new CustomerProfileRepository(connection.db, 'auth-private-fixture', undefined, () => now),
      profiles,
      () => now,
    );
    const registration = new RegistrationService(
      new RegistrationRepository(connection.db),
      crypto,
      service,
      profiles,
      () => now,
    );
    const managerAcceptance = new ManagerAcceptanceService(
      new ManagerAcceptanceRepository(connection.db, undefined, () => now),
      profiles,
    );
    const dummyHash = await hashPassword(randomBytes(48).toString('hex'));
    const managers = new ManagerService(
      new ManagerRepository(connection.db),
      service,
      profiles,
      dummyHash,
      () => now,
    );
    const identity = new IdentityService(
      new IdentityRepository(connection.db),
      service,
      otp,
      crypto,
      profiles,
      dummyHash,
      () => now,
    );
    const idempotency = new IdempotencyService(new IdempotencyRepository(connection.db), () => now);
    application = await createApplication(
      config,
      infrastructure,
      [ProtectedProbe, ...controllers],
      {
        sessions: service,
        transport: new AuthTransport(crypto, false),
        otp,
        emailAssociation: new EmailAssociationService(
          new EmailAssociationRepository(connection.db, undefined, () => now),
          otp,
          profiles,
          () => now,
        ),
        registration,
        customer,
        owner,
        profileDetails: new ProfileDetailsService(
          new ProfileDetailsRepository(connection.db, () => now),
        ),
        identity,
        profiles,
        managers,
        managerAcceptance,
        scopes: new ScopeRepository(connection.db),
      },
      {
        idempotency,
        ...features?.(connection.db, idempotency),
        invitations: new InvitationService(
          new InvitationRepository(connection.db),
          crypto,
          () => now,
        ),
        hostelSetup: new HostelSetupService(
          new HostelSetupRepository(connection.db, 'auth-private-fixture', undefined, () => now),
          idempotency,
          () => now,
        ),
        management: new ManagementService(
          new ManagementReadRepository(connection.db, () => now),
          new StaffRepository(connection.db, () => now),
        ),
      },
    );
    return {
      connection,
      application,
      repository,
      service,
      otp,
      identity,
      config,
      infrastructure,
      close,
    };
  } catch (error) {
    await close();
    throw error;
  }
}

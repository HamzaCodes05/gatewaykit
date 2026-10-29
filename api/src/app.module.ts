import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from './auth/auth.module';
import { ApiKey, UsageLog } from './entities';
import { GatewayModule } from './gateway/gateway.module';
import { RedisModule } from './redis.module';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',
      url: process.env.DATABASE_URL ?? 'postgresql://gatewaykit:gatewaykit@localhost:5432/gatewaykit',
      entities: [ApiKey, UsageLog],
      synchronize: true, // demo only; use migrations in production
      retryAttempts: 10,
      retryDelay: 3000,
    }),
    RedisModule,
    AuthModule,
    GatewayModule,
  ],
})
export class AppModule {}

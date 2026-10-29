import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ApiKey, UsageLog } from '../entities';
import { AdminController } from './admin.controller';
import { ApiKeyGuard } from './api-key.guard';
import { CacheService } from './cache.service';
import { GatewayController } from './gateway.controller';
import { GatewayService } from './gateway.service';
import { KeysService } from './keys.service';
import { ProviderRegistry } from './providers';
import { RateLimitService } from './rate-limit.service';
import { UsageService } from './usage.service';

@Module({
  imports: [TypeOrmModule.forFeature([ApiKey, UsageLog])],
  controllers: [GatewayController, AdminController],
  providers: [GatewayService, ProviderRegistry, CacheService, KeysService, UsageService, RateLimitService, ApiKeyGuard],
})
export class GatewayModule {}

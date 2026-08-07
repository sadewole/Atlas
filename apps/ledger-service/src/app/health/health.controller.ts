import { DatabaseHealthService } from '@atlas/database';
import { Controller, Get, Inject } from '@nestjs/common';

interface HealthStatus {
  status: 'ok' | 'unavailable';
  service: string;
  checks: { database: 'up' | 'down' };
  timestamp: string;
}

@Controller()
export class HealthController {
  private readonly serviceName = 'ledger-service';

  constructor(
    @Inject(DatabaseHealthService)
    private readonly databaseHealth: DatabaseHealthService,
  ) {}

  @Get('health')
  getHealth(): HealthStatus {
    return {
      status: 'ok',
      service: this.serviceName,
      checks: { database: 'up' },
      timestamp: new Date().toISOString(),
    };
  }

  @Get('ready')
  async getReady(): Promise<HealthStatus> {
    const databaseUp = await this.databaseHealth.isHealthy();
    return {
      status: databaseUp ? 'ok' : 'unavailable',
      service: this.serviceName,
      checks: { database: databaseUp ? 'up' : 'down' },
      timestamp: new Date().toISOString(),
    };
  }

  @Get('live')
  getLive(): HealthStatus {
    return this.getHealth();
  }
}

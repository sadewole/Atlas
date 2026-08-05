import { Controller, Get } from '@nestjs/common';

interface HealthStatus {
  status: 'ok';
  service: string;
  timestamp: string;
}

@Controller()
export class HealthController {
  private readonly serviceName = 'gateway';

  @Get('health')
  getHealth(): HealthStatus {
    return {
      status: 'ok',
      service: this.serviceName,
      timestamp: new Date().toISOString(),
    };
  }

  @Get('ready')
  getReady(): HealthStatus {
    return this.getHealth();
  }

  @Get('live')
  getLive(): HealthStatus {
    return this.getHealth();
  }
}

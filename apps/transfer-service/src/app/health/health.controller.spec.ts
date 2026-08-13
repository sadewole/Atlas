import { DatabaseHealthService } from '@atlas/database';
import { Test, TestingModule } from '@nestjs/testing';
import { HealthController } from './health.controller.js';

describe('HealthController', () => {
  let controller: HealthController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        {
          provide: DatabaseHealthService,
          useValue: { isHealthy: jest.fn().mockResolvedValue(true) },
        },
      ],
    }).compile();

    controller = module.get<HealthController>(HealthController);
  });

  describe('health checks', () => {
    it('should return ok status with service name', () => {
      const result = controller.getHealth();
      expect(result.status).toEqual('ok');
      expect(result.service).toEqual('transfer-service');
      expect(result.timestamp).toBeTruthy();
    });

    it('should report ready', async () => {
      await expect(controller.getReady()).resolves.toMatchObject({
        status: 'ok',
      });
    });

    it('should report live', () => {
      expect(controller.getLive().status).toEqual('ok');
    });
  });
});

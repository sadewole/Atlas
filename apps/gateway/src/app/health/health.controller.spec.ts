import { Test, TestingModule } from '@nestjs/testing';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  let controller: HealthController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
    }).compile();

    controller = module.get<HealthController>(HealthController);
  });

  describe('health checks', () => {
    it('should return ok status with service name', () => {
      const result = controller.getHealth();
      expect(result.status).toEqual('ok');
      expect(result.service).toEqual('gateway');
      expect(result.timestamp).toBeTruthy();
    });

    it('should report ready', () => {
      expect(controller.getReady().status).toEqual('ok');
    });

    it('should report live', () => {
      expect(controller.getLive().status).toEqual('ok');
    });
  });
});

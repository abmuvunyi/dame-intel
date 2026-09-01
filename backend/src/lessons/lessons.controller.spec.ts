import { Test, TestingModule } from '@nestjs/testing';
import { LessonsController } from './lessons.controller';
import { LessonsService } from './lessons.service';

describe('LessonsController', () => {
  let controller: LessonsController;
  const listAll = jest.fn();
  const getBySlug = jest.fn();

  beforeEach(async () => {
    listAll.mockReset();
    getBySlug.mockReset();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [LessonsController],
      providers: [{ provide: LessonsService, useValue: { listAll, getBySlug } }],
    }).compile();

    controller = module.get<LessonsController>(LessonsController);
  });

  it('passes an optional category query param through to the service', async () => {
    listAll.mockResolvedValue([{ slug: 'x' }]);
    await controller.listAll('endgame' as any);
    expect(listAll).toHaveBeenCalledWith('endgame');
  });

  it('passes no category through when none is given (lists everything)', async () => {
    listAll.mockResolvedValue([]);
    await controller.listAll(undefined);
    expect(listAll).toHaveBeenCalledWith(undefined);
  });

  it('fetches a single lesson by slug', async () => {
    getBySlug.mockResolvedValue({ slug: 'control-the-center' });
    const result = await controller.getBySlug('control-the-center');
    expect(getBySlug).toHaveBeenCalledWith('control-the-center');
    expect(result).toEqual({ slug: 'control-the-center' });
  });
});

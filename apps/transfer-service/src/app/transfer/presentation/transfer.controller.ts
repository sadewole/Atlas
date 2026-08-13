import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
} from '@nestjs/common';
import { CreateTransferUseCase } from '../application/create-transfer.use-case.js';
import { createTransferSchema } from './transfer.dto.js';
import { TransferRepository } from '../infrastructure/transfer-repository.js';

/**
 * The Transfer Service's public API. The Transfer Service ORCHESTRATES money
 * movement — it never moves money itself (Wallet reserves/captures, Ledger
 * posts journals).
 *
 *   POST /v1/transfers         create + run a transfer (Saga orchestration)
 *   GET  /v1/transfers/:id     read a transfer and its status
 *
 * A transfer is idempotent via its `idempotencyKey`.
 */
@Controller('v1/transfers')
export class TransferController {
  constructor(
    private readonly createTransferUseCase: CreateTransferUseCase,
    private readonly repository: TransferRepository,
  ) {}

  /**
   * Create a transfer and run the Saga: reserve (wallet) → post journal
   * (ledger) → capture (wallet). On failure, compensation releases any
   * reservation and the transfer ends FAILED.
   */
  @Post()
  async create(@Body() body: unknown) {
    const parsed = createTransferSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        error: {
          code: 'VALIDATION_FAILED',
          message: 'Request validation failed.',
          details: parsed.error.issues.map((i) => ({
            field: i.path.join('.'),
            reason: i.message,
          })),
        },
      });
    }
    const { transfer, journalId } = await this.createTransferUseCase.execute(
      parsed.data,
    );
    return {
      data: {
        id: transfer.id,
        reference: transfer.reference,
        status: transfer.status,
        currency: transfer.currency,
        amount: transfer.amount,
        sourceWalletId: transfer.sourceWalletId,
        destinationWalletId: transfer.destinationWalletId,
        journalId,
      },
    };
  }

  /** Read a transfer's current state. */
  @Get(':id')
  async get(@Param('id') id: string) {
    const transfer = await this.repository.findById(id);
    if (!transfer) {
      throw new BadRequestException({
        error: {
          code: 'TRANSFER_NOT_FOUND',
          message: `Transfer not found: ${id}`,
          details: [],
        },
      });
    }
    return {
      data: {
        id: transfer.id,
        reference: transfer.reference,
        type: transfer.type,
        status: transfer.status,
        currency: transfer.currency,
        amount: transfer.amount,
        sourceWalletId: transfer.sourceWalletId,
        destinationWalletId: transfer.destinationWalletId,
      },
    };
  }
}

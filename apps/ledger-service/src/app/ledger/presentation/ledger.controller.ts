import { BadRequestException, Controller, Get, Param, Post, Body } from '@nestjs/common';
import { CreateAccountUseCase } from '../application/create-account.use-case.js';
import { GetBalanceUseCase } from '../application/get-balance.use-case.js';
import { PostJournalUseCase } from '../application/post-journal.use-case.js';
import { createAccountSchema, postJournalSchema } from './ledger.dto.js';

@Controller('v1/ledger')
export class LedgerController {
  constructor(
    private readonly createAccountUseCase: CreateAccountUseCase,
    private readonly postJournalUseCase: PostJournalUseCase,
    private readonly getBalanceUseCase: GetBalanceUseCase,
  ) {}

  @Post('accounts')
  async createAccount(@Body() body: unknown) {
    const parsed = createAccountSchema.safeParse(body);
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
    const { account } = await this.createAccountUseCase.execute(parsed.data);
    return {
      data: {
        id: account.id,
        accountCode: account.accountCode,
        name: account.name,
        type: account.type,
        currency: account.currency,
        status: account.status,
      },
    };
  }

  @Post('journals')
  async postJournal(@Body() body: unknown) {
    const parsed = postJournalSchema.safeParse(body);
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
    const result = await this.postJournalUseCase.execute(parsed.data);
    return { data: result };
  }

  @Get('accounts/:id/balance')
  async getBalance(@Param('id') accountId: string) {
    const result = await this.getBalanceUseCase.execute({ accountId });
    return {
      data: {
        accountId: result.account.id,
        accountCode: result.account.accountCode,
        currency: result.account.currency,
        balance: result.balance,
        updatedAt: result.updatedAt,
      },
    };
  }
}

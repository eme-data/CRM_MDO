import {
  Body, Controller, Get, Param, Post, Res, StreamableFile, UploadedFile,
  UseGuards, UseInterceptors,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { ExpensesService } from './expenses.service';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { DecideExpenseDto } from './dto/decide-expense.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, JwtUser } from '../common/decorators/current-user.decorator';

@ApiTags('Notes de frais (SIRH)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('expenses')
export class ExpensesController {
  constructor(private readonly service: ExpensesService) {}

  @Get('categories')
  categories(@CurrentUser() user: JwtUser) {
    return this.service.listCategories(user);
  }

  @Get('mine')
  mine(@CurrentUser() user: JwtUser) {
    return this.service.listMine(user);
  }

  @Post()
  create(@Body() dto: CreateExpenseDto, @CurrentUser() user: JwtUser) {
    return this.service.create(dto, user);
  }

  @Post(':id/cancel')
  cancel(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.service.cancel(id, user);
  }

  @Post(':id/receipt')
  @UseInterceptors(FileInterceptor('file'))
  attachReceipt(@Param('id') id: string, @UploadedFile() file: any, @CurrentUser() user: JwtUser) {
    return this.service.attachReceipt(id, file, user);
  }

  @Get(':id/receipt')
  async receipt(@Param('id') id: string, @CurrentUser() user: JwtUser, @Res({ passthrough: true }) res: Response) {
    const r = await this.service.getReceipt(id, user);
    res.set({
      'Content-Type': r.mimeType,
      'Content-Disposition': 'attachment; filename="' + r.filename.replace(/"/g, '') + '"',
      'Content-Length': String(r.sizeBytes),
    });
    return new StreamableFile(r.stream);
  }

  // ----- Valideurs (ADMIN / MANAGER) -----
  @Roles('ADMIN', 'MANAGER')
  @Get('pending')
  pending(@CurrentUser() user: JwtUser) {
    return this.service.listPending(user);
  }

  @Roles('ADMIN', 'MANAGER')
  @Get('to-reimburse')
  toReimburse(@CurrentUser() user: JwtUser) {
    return this.service.listToReimburse(user);
  }

  @Roles('ADMIN', 'MANAGER')
  @Post(':id/decide')
  decide(@Param('id') id: string, @Body() dto: DecideExpenseDto, @CurrentUser() user: JwtUser) {
    return this.service.decide(id, dto, user);
  }

  @Roles('ADMIN', 'MANAGER')
  @Post(':id/reimburse')
  reimburse(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.service.markReimbursed(id, user);
  }
}

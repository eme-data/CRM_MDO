import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { QuoteStatus } from '@prisma/client';
import { QuotesService } from './quotes.service';
import { CreateQuoteDto } from './dto/create-quote.dto';
import { UpdateQuoteDto } from './dto/update-quote.dto';
import { ConvertQuoteDto } from './dto/convert-quote.dto';
import { PdfService } from '../pdf/pdf.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, JwtUser } from '../common/decorators/current-user.decorator';

@ApiTags('Quotes')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('quotes')
export class QuotesController {
  constructor(
    private readonly service: QuotesService,
    private readonly pdf: PdfService,
  ) {}

  @Get('stats')
  stats(@CurrentUser() user: JwtUser) {
    return this.service.stats(user.tenantId);
  }

  @Get(':id/pdf')
  async downloadPdf(@Param('id') id: string, @Res() res: Response, @CurrentUser() user: JwtUser) {
    const q = await this.service.findOne(id, user.tenantId);
    const buf = await this.pdf.quote({
      quote: {
        reference: q.reference,
        title: q.title,
        issueDate: q.issueDate,
        validUntil: q.validUntil,
        vatRate: Number(q.vatRate),
        notes: q.notes,
        terms: q.terms,
        subtotalHt: Number(q.subtotalHt),
        globalDiscountPct: Number(q.globalDiscountPct ?? 0),
        vatAmount: Number(q.vatAmount),
        totalTtc: Number(q.totalTtc),
        lines: q.lines.map((l) => ({
          description: l.description,
          quantity: Number(l.quantity),
          unitPriceHt: Number(l.unitPriceHt),
          discountPct: Number(l.discountPct),
          lineTotalHt: Number(l.lineTotalHt),
        })),
      },
      client: {
        name: q.company.name,
        address: q.company.address ?? undefined,
        postalCode: q.company.postalCode ?? undefined,
        city: q.company.city ?? undefined,
        siret: q.company.siret ?? undefined,
      },
    });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="' + q.reference + '.pdf"');
    res.send(buf);
  }

  @Get()
  findAll(
    @CurrentUser() user: JwtUser,
    @Query('search') search?: string,
    @Query('status') status?: QuoteStatus,
    @Query('companyId') companyId?: string,
    @Query('ownerId') ownerId?: string,
  ) {
    return this.service.findAll({ search, status, companyId, ownerId }, user.tenantId);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.service.findOne(id, user.tenantId);
  }

  @Roles('ADMIN', 'MANAGER', 'SALES')
  @Post()
  create(@Body() dto: CreateQuoteDto, @CurrentUser() user: JwtUser) {
    return this.service.create(dto, user.id, user.tenantId);
  }

  @Roles('ADMIN', 'MANAGER', 'SALES')
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateQuoteDto, @CurrentUser() user: JwtUser) {
    return this.service.update(id, dto, user.id, user.tenantId);
  }

  @Roles('ADMIN', 'MANAGER')
  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.service.remove(id, user.id, user.tenantId);
  }

  // ============ Workflow ============
  @Roles('ADMIN', 'MANAGER', 'SALES')
  @Post(':id/send')
  send(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.service.send(id, user.id, user.tenantId);
  }

  @Roles('ADMIN', 'MANAGER', 'SALES')
  @Post(':id/accept')
  accept(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.service.accept(id, user.id, user.tenantId);
  }

  @Roles('ADMIN', 'MANAGER', 'SALES')
  @Post(':id/reject')
  reject(
    @Param('id') id: string,
    @Body() body: { reason?: string },
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.reject(id, body.reason, user.id, user.tenantId);
  }

  @Roles('ADMIN', 'MANAGER', 'SALES')
  @Post(':id/convert')
  convert(
    @Param('id') id: string,
    @Body() dto: ConvertQuoteDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.convertToContract(id, dto, user.id, user.tenantId);
  }
}

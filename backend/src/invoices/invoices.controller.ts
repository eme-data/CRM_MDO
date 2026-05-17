import {
  Body, Controller, Delete, Get, Param, Patch, Post, Query, Res, UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { InvoiceStatus } from '@prisma/client';
import { InvoicesService } from './invoices.service';
import { PdfService } from '../pdf/pdf.service';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, JwtUser } from '../common/decorators/current-user.decorator';

@ApiTags('Invoices')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('invoices')
export class InvoicesController {
  constructor(
    private readonly service: InvoicesService,
    private readonly pdf: PdfService,
  ) {}

  @Get()
  findAll(
    @CurrentUser() user: JwtUser,
    @Query('status') status?: InvoiceStatus,
    @Query('companyId') companyId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.service.findAll({ status, companyId, from, to }, user.tenantId);
  }

  // Aging report : factures impayees groupees par anciennete de la dueDate.
  // Placee avant /:id pour ne pas etre interceptee par la route /:id.
  @Get('aging')
  aging(@CurrentUser() user: JwtUser) {
    return this.service.aging(user.tenantId);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.service.findOne(id, user.tenantId);
  }

  @Get(':id/pdf')
  async pdfDownload(@Param('id') id: string, @Res() res: Response, @CurrentUser() user: JwtUser) {
    const inv = await this.service.findOne(id, user.tenantId);
    const buffer = await this.pdf.invoice({
      reference: inv.contract?.reference ?? '',
      number: inv.number,
      issueDate: inv.issueDate,
      dueDate: inv.dueDate,
      client: {
        name: inv.company.name,
        address: inv.company.address ?? undefined,
        postalCode: inv.company.postalCode ?? undefined,
        city: inv.company.city ?? undefined,
        siret: inv.company.siret ?? undefined,
      },
      lines: inv.lines.map((l) => ({
        description: l.description,
        quantity: Number(l.quantity),
        unitPriceHt: Number(l.unitPriceHt),
      })),
      vatRate: Number(inv.vatRate),
    });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="facture_' + inv.number + '.pdf"');
    res.send(buffer);
  }

  @Roles('ADMIN', 'MANAGER')
  @Post()
  create(@Body() body: CreateInvoiceDto, @CurrentUser() user: JwtUser) {
    return this.service.create({
      ...body,
      issueDate: body.issueDate ? new Date(body.issueDate) : undefined,
      dueDate: body.dueDate ? new Date(body.dueDate) : undefined,
    }, user.tenantId);
  }

  @Roles('ADMIN', 'MANAGER')
  @Patch(':id/status')
  setStatus(
    @Param('id') id: string,
    @Body() body: { status: InvoiceStatus },
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.setStatus(id, body.status, user.tenantId);
  }

  @Roles('ADMIN', 'MANAGER')
  @Post('generate-monthly')
  generateMonthly() {
    return this.service.generateMonthlyInvoicesAuto();
  }

  @Roles('ADMIN', 'MANAGER')
  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.service.remove(id, user.tenantId);
  }
}

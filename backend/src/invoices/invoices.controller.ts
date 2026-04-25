import {
  Body, Controller, Delete, Get, Param, Patch, Post, Query, Res, UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { InvoiceStatus } from '@prisma/client';
import { InvoicesService } from './invoices.service';
import { PdfService } from '../pdf/pdf.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';

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
    @Query('status') status?: InvoiceStatus,
    @Query('companyId') companyId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.service.findAll({ status, companyId, from, to });
  }

  @Get(':id')
  findOne(@Param('id') id: string) { return this.service.findOne(id); }

  @Get(':id/pdf')
  async pdfDownload(@Param('id') id: string, @Res() res: Response) {
    const inv = await this.service.findOne(id);
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
  create(@Body() body: any) {
    return this.service.create(body);
  }

  @Roles('ADMIN', 'MANAGER')
  @Patch(':id/status')
  setStatus(@Param('id') id: string, @Body() body: { status: InvoiceStatus }) {
    return this.service.setStatus(id, body.status);
  }

  @Roles('ADMIN', 'MANAGER')
  @Post('generate-monthly')
  generateMonthly() {
    return this.service.generateMonthlyInvoicesAuto();
  }

  @Roles('ADMIN', 'MANAGER')
  @Delete(':id')
  remove(@Param('id') id: string) { return this.service.remove(id); }
}

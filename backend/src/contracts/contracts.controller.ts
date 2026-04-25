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
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Response } from 'express';
import { ContractStatus } from '@prisma/client';
import { ContractsService } from './contracts.service';
import { PdfService } from '../pdf/pdf.service';
import { CreateContractDto } from './dto/create-contract.dto';
import { UpdateContractDto } from './dto/update-contract.dto';
import { RenewContractDto } from './dto/renew-contract.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, JwtUser } from '../common/decorators/current-user.decorator';

@ApiTags('Contracts')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('contracts')
export class ContractsController {
  constructor(
    private readonly service: ContractsService,
    private readonly pdf: PdfService,
  ) {}

  @Get(':id/pdf')
  async downloadPdf(@Param('id') id: string, @Res() res: Response) {
    const c = await this.service.findOne(id);
    const buffer = await this.pdf.contract({
      contract: {
        reference: c.reference,
        title: c.title,
        offer: c.offer,
        startDate: c.startDate,
        endDate: c.endDate,
        engagementMonths: c.engagementMonths,
        unitPriceHt: Number(c.unitPriceHt),
        quantity: c.quantity,
        monthlyAmountHt: Number(c.monthlyAmountHt),
        vatRate: Number(c.vatRate),
        description: c.description,
      },
      client: {
        name: c.company.name,
        address: c.company.address ?? undefined,
        postalCode: c.company.postalCode ?? undefined,
        city: c.company.city ?? undefined,
        siret: c.company.siret ?? undefined,
      },
    });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="' + c.reference + '.pdf"');
    res.send(buffer);
  }

  @Get()
  findAll(
    @Query('search') search?: string,
    @Query('status') status?: ContractStatus,
    @Query('companyId') companyId?: string,
    @Query('expiringInDays') expiringInDays?: string,
  ) {
    return this.service.findAll({
      search,
      status,
      companyId,
      expiringInDays: expiringInDays ? parseInt(expiringInDays, 10) : undefined,
    });
  }

  @Get('stats')
  stats() {
    return this.service.stats();
  }

  @Get('expiring-soon')
  expiringSoon(@Query('days') days?: string) {
    return this.service.expiringSoon(days ? parseInt(days, 10) : 90);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Roles('ADMIN', 'MANAGER', 'SALES')
  @Post()
  create(@Body() dto: CreateContractDto, @CurrentUser() user: JwtUser) {
    return this.service.create(dto, user.id);
  }

  @Roles('ADMIN', 'MANAGER', 'SALES')
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateContractDto, @CurrentUser() user: JwtUser) {
    return this.service.update(id, dto, user.id);
  }

  @Roles('ADMIN', 'MANAGER', 'SALES')
  @Post(':id/terminate')
  terminate(
    @Param('id') id: string,
    @Body() body: { reason: string },
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.terminate(id, body.reason, user.id);
  }

  @Roles('ADMIN', 'MANAGER', 'SALES')
  @Post(':id/renew')
  renew(@Param('id') id: string, @Body() dto: RenewContractDto, @CurrentUser() user: JwtUser) {
    return this.service.renew(id, dto, user.id);
  }

  @Roles('ADMIN', 'MANAGER')
  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.service.remove(id, user.id);
  }
}

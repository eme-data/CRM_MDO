import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PurchasingService } from './purchasing.service';
import { CreatePoDto, ReceivePoDto } from './dto/purchasing.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser, JwtUser } from '../common/decorators/current-user.decorator';

@ApiTags('Stock - Approvisionnement')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('stock/purchase-orders')
export class PurchasingController {
  constructor(private readonly service: PurchasingService) {}

  @Get()
  list(@CurrentUser() u: JwtUser) { return this.service.list(u); }

  @Post()
  create(@Body() dto: CreatePoDto, @CurrentUser() u: JwtUser) { return this.service.create(u, dto); }

  @Get(':id')
  get(@Param('id') id: string, @CurrentUser() u: JwtUser) { return this.service.get(u, id); }

  @Post(':id/status')
  setStatus(@Param('id') id: string, @Body() body: { status: 'ORDERED' | 'CANCELLED' | 'DRAFT' }, @CurrentUser() u: JwtUser) {
    return this.service.setStatus(u, id, body.status);
  }

  @Post(':id/receive')
  receive(@Param('id') id: string, @Body() dto: ReceivePoDto, @CurrentUser() u: JwtUser) {
    return this.service.receive(u, id, dto);
  }
}

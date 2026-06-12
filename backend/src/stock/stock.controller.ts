import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { StockService } from './stock.service';
import {
  CreateItemDto, UpdateItemDto, MovementDto, TransferDto, AdjustDto,
  CreateSupplierDto, UpdateSupplierDto, CreateLocationDto, UpdateLocationDto,
  CreateSerialDto, UpdateSerialDto, ConsumeDto,
} from './dto/stock.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser, JwtUser } from '../common/decorators/current-user.decorator';

@ApiTags('Stock')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('stock')
export class StockController {
  constructor(private readonly service: StockService) {}

  @Get('dashboard')
  dashboard(@CurrentUser() u: JwtUser) { return this.service.dashboard(u); }

  // ----- Emplacements -----
  @Get('locations')
  locations(@CurrentUser() u: JwtUser) { return this.service.listLocations(u); }
  @Post('locations')
  createLocation(@Body() dto: CreateLocationDto, @CurrentUser() u: JwtUser) { return this.service.createLocation(u, dto); }
  @Patch('locations/:id')
  updateLocation(@Param('id') id: string, @Body() dto: UpdateLocationDto, @CurrentUser() u: JwtUser) { return this.service.updateLocation(u, id, dto); }

  // ----- Fournisseurs -----
  @Get('suppliers')
  suppliers(@CurrentUser() u: JwtUser) { return this.service.listSuppliers(u); }
  @Post('suppliers')
  createSupplier(@Body() dto: CreateSupplierDto, @CurrentUser() u: JwtUser) { return this.service.createSupplier(u, dto); }
  @Patch('suppliers/:id')
  updateSupplier(@Param('id') id: string, @Body() dto: UpdateSupplierDto, @CurrentUser() u: JwtUser) { return this.service.updateSupplier(u, id, dto); }

  // ----- Mouvements -----
  @Get('movements')
  movements(@CurrentUser() u: JwtUser, @Query('itemId') itemId?: string) { return this.service.listMovements(u, itemId); }
  @Post('movements')
  move(@Body() dto: MovementDto, @CurrentUser() u: JwtUser) { return this.service.move(u, dto); }
  @Post('transfer')
  transfer(@Body() dto: TransferDto, @CurrentUser() u: JwtUser) { return this.service.transfer(u, dto); }
  @Post('adjust')
  adjust(@Body() dto: AdjustDto, @CurrentUser() u: JwtUser) { return this.service.adjust(u, dto); }

  // ----- Consommation sur intervention (decrement de stock) -----
  @Get('consumptions')
  consumptions(@Query('interventionId') interventionId: string, @CurrentUser() u: JwtUser) { return this.service.listConsumptions(u, interventionId); }
  @Post('consume')
  consume(@Body() dto: ConsumeDto, @CurrentUser() u: JwtUser) { return this.service.consume(u, dto); }
  @Delete('consumptions/:id')
  deleteConsumption(@Param('id') id: string, @CurrentUser() u: JwtUser) { return this.service.deleteConsumption(u, id); }

  // ----- Numeros de serie -----
  @Post('serials')
  createSerial(@Body() dto: CreateSerialDto, @CurrentUser() u: JwtUser) { return this.service.createSerial(u, dto); }
  @Patch('serials/:id')
  updateSerial(@Param('id') id: string, @Body() dto: UpdateSerialDto, @CurrentUser() u: JwtUser) { return this.service.updateSerial(u, id, dto); }

  // ----- Articles ----- (apres les routes statiques pour ne pas capturer)
  @Get('items')
  items(@CurrentUser() u: JwtUser) { return this.service.listItems(u); }
  @Post('items')
  createItem(@Body() dto: CreateItemDto, @CurrentUser() u: JwtUser) { return this.service.createItem(u, dto); }
  @Get('items/:id')
  item(@Param('id') id: string, @CurrentUser() u: JwtUser) { return this.service.getItem(u, id); }
  @Patch('items/:id')
  updateItem(@Param('id') id: string, @Body() dto: UpdateItemDto, @CurrentUser() u: JwtUser) { return this.service.updateItem(u, id, dto); }
}

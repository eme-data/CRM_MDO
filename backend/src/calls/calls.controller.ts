import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { CallDirection } from '@prisma/client';
import { CallsService } from './calls.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser, JwtUser } from '../common/decorators/current-user.decorator';

@ApiTags('Calls')
@Controller('calls')
export class CallsController {
  constructor(private readonly service: CallsService) {}

  // Webhook public (HMAC verifie cote service)
  @Public()
  @Post('webhook/:provider')
  webhook(
    @Param('provider') provider: string,
    @Req() req: Request,
    @Headers('x-freepro-signature') sig?: string,
  ) {
    const raw = (req as any).rawBody ?? (req.body as Buffer);
    if (!raw || !Buffer.isBuffer(raw)) return { ok: false, reason: 'missing_raw_body' };
    return this.service.handleWebhook(provider, raw, sig);
  }

  // -------- Endpoints proteges --------
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Get()
  list(
    @Query('contactId') contactId?: string,
    @Query('companyId') companyId?: string,
    @Query('userId') userId?: string,
    @Query('direction') direction?: CallDirection,
  ) {
    return this.service.findAll({ contactId, companyId, userId, direction });
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Get('stats')
  stats() {
    return this.service.stats();
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Get(':id')
  get(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  // Click-to-call (initie un appel sortant)
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Post('click')
  click(@Body() body: { number: string }, @CurrentUser() user: JwtUser) {
    return this.service.clickToCall(body.number, user.id);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Patch(':id/notes')
  addNote(@Param('id') id: string, @Body() body: { notes: string }) {
    return this.service.addNote(id, body.notes);
  }
}

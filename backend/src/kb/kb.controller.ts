import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { KbScope } from '@prisma/client';
import { KbService } from './kb.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser, JwtUser } from '../common/decorators/current-user.decorator';

@ApiTags('Knowledge Base')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('kb')
export class KbController {
  constructor(private readonly service: KbService) {}

  @Get()
  list(
    @Query('q') q?: string,
    @Query('scope') scope?: KbScope,
    @Query('companyId') companyId?: string,
    @Query('category') category?: string,
    @Query('publishedOnly') publishedOnly?: string,
  ) {
    return this.service.search({
      q,
      scope,
      companyId,
      category,
      publishedOnly: publishedOnly === 'true',
    });
  }

  @Get('categories')
  categories() {
    return this.service.categories();
  }

  @Get(':id')
  get(@Param('id') id: string, @Query('view') view?: string) {
    return this.service.findOne(id, view === 'true');
  }

  @Post()
  create(@Body() body: any, @CurrentUser() user: JwtUser) {
    return this.service.create(body, user.id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: any) {
    return this.service.update(id, body);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }

  @Post(':id/helpful')
  helpful(@Param('id') id: string) {
    return this.service.markHelpful(id);
  }

  @Post('from-ticket/:ticketId')
  fromTicket(@Param('ticketId') ticketId: string, @CurrentUser() user: JwtUser) {
    return this.service.draftFromTicket(ticketId, user.id);
  }
}

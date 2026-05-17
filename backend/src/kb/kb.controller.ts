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
import { CreateKbArticleDto } from './dto/create-kb-article.dto';
import { UpdateKbArticleDto } from './dto/update-kb-article.dto';

@ApiTags('Knowledge Base')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('kb')
export class KbController {
  constructor(private readonly service: KbService) {}

  @Get()
  list(
    @CurrentUser() user: JwtUser,
    @Query('q') q?: string,
    @Query('scope') scope?: KbScope,
    @Query('companyId') companyId?: string,
    @Query('category') category?: string,
    @Query('publishedOnly') publishedOnly?: string,
  ) {
    return this.service.search(user, {
      q,
      scope,
      companyId,
      category,
      publishedOnly: publishedOnly === 'true',
    });
  }

  @Get('categories')
  categories(@CurrentUser() user: JwtUser) {
    return this.service.categories(user);
  }

  @Get(':id')
  get(@Param('id') id: string, @CurrentUser() user: JwtUser, @Query('view') view?: string) {
    return this.service.findOne(id, user, view === 'true');
  }

  @Post()
  create(@Body() body: CreateKbArticleDto, @CurrentUser() user: JwtUser) {
    return this.service.create(body, user);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: UpdateKbArticleDto, @CurrentUser() user: JwtUser) {
    return this.service.update(id, body, user);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.service.remove(id, user);
  }

  @Post(':id/helpful')
  helpful(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.service.markHelpful(id, user);
  }

  @Post('from-ticket/:ticketId')
  fromTicket(@Param('ticketId') ticketId: string, @CurrentUser() user: JwtUser) {
    return this.service.draftFromTicket(ticketId, user);
  }
}

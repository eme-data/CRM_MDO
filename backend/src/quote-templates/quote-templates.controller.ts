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
import { QuoteTemplatesService } from './quote-templates.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, JwtUser } from '../common/decorators/current-user.decorator';
import { CreateQuoteTemplateDto, UpdateQuoteTemplateDto } from './dto/quote-template.dto';

@ApiTags('Quote templates')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('quote-templates')
export class QuoteTemplatesController {
  constructor(private readonly service: QuoteTemplatesService) {}

  @Get()
  list(@CurrentUser() user: JwtUser, @Query('includeInactive') includeInactive?: string) {
    return this.service.list(user, includeInactive === 'true');
  }

  @Get(':id')
  get(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.service.findOne(id, user);
  }

  // Endpoint cote frontend "nouveau devis" : transforme un template en lignes
  // pretes a injecter dans le formulaire (champs identiques a QuoteLineDto).
  @Get(':id/expand')
  expand(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.service.expand(id, user);
  }

  @Roles('ADMIN', 'MANAGER')
  @Post()
  create(@Body() body: CreateQuoteTemplateDto, @CurrentUser() user: JwtUser) {
    return this.service.create(body, user);
  }

  @Roles('ADMIN', 'MANAGER')
  @Patch(':id')
  update(@Param('id') id: string, @Body() body: UpdateQuoteTemplateDto, @CurrentUser() user: JwtUser) {
    return this.service.update(id, body, user);
  }

  @Roles('ADMIN', 'MANAGER')
  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.service.remove(id, user);
  }
}

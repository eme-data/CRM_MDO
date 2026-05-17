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
import { CreateQuoteTemplateDto, UpdateQuoteTemplateDto } from './dto/quote-template.dto';

@ApiTags('Quote templates')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('quote-templates')
export class QuoteTemplatesController {
  constructor(private readonly service: QuoteTemplatesService) {}

  @Get()
  list(@Query('includeInactive') includeInactive?: string) {
    return this.service.list(includeInactive === 'true');
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  // Endpoint cote frontend "nouveau devis" : transforme un template en lignes
  // pretes a injecter dans le formulaire (champs identiques a QuoteLineDto).
  @Get(':id/expand')
  expand(@Param('id') id: string) {
    return this.service.expand(id);
  }

  @Roles('ADMIN', 'MANAGER')
  @Post()
  create(@Body() body: CreateQuoteTemplateDto) {
    return this.service.create(body);
  }

  @Roles('ADMIN', 'MANAGER')
  @Patch(':id')
  update(@Param('id') id: string, @Body() body: UpdateQuoteTemplateDto) {
    return this.service.update(id, body);
  }

  @Roles('ADMIN', 'MANAGER')
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}

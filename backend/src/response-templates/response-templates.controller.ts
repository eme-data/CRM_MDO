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
import { ResponseTemplatesService } from './response-templates.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser, JwtUser } from '../common/decorators/current-user.decorator';

@ApiTags('ResponseTemplates')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('response-templates')
export class ResponseTemplatesController {
  constructor(private readonly service: ResponseTemplatesService) {}

  @Get()
  list(@CurrentUser() user: JwtUser, @Query('category') category?: string) {
    return this.service.listForUser(user.id, category);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.service.findOne(id, user.id);
  }

  @Post()
  create(
    @Body() dto: { name: string; body: string; subject?: string; category?: string; shared?: boolean },
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.create(user.id, dto);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: any,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.update(id, user.id, user.role, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.service.remove(id, user.id, user.role);
  }
}

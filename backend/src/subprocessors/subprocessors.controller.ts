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
import { SubprocessorRole } from '@prisma/client';
import { SubprocessorsService } from './subprocessors.service';
import { UpsertSubprocessorDto } from './dto/upsert-subprocessor.dto';
import { UpdateSubprocessorDto } from './dto/update-subprocessor.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, JwtUser } from '../common/decorators/current-user.decorator';

@ApiTags('Subprocessors (DPA)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('subprocessors')
export class SubprocessorsController {
  constructor(private readonly service: SubprocessorsService) {}

  @Get()
  list(
    @CurrentUser() user: JwtUser,
    @Query('includeInactive') includeInactive?: string,
    @Query('role') role?: SubprocessorRole,
  ) {
    return this.service.list(user, { includeInactive: includeInactive === 'true', role });
  }

  @Get(':id')
  get(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.service.findOne(id, user);
  }

  @Roles('ADMIN', 'MANAGER')
  @Post()
  create(@Body() body: UpsertSubprocessorDto, @CurrentUser() user: JwtUser) {
    return this.service.create(body, user);
  }

  @Roles('ADMIN', 'MANAGER')
  @Patch(':id')
  update(@Param('id') id: string, @Body() body: UpdateSubprocessorDto, @CurrentUser() user: JwtUser) {
    return this.service.update(id, body, user);
  }

  @Roles('ADMIN', 'MANAGER')
  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.service.remove(id, user);
  }
}

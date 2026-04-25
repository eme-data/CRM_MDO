import {
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CompanyLookupService } from './company-lookup.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser, JwtUser } from '../common/decorators/current-user.decorator';

@ApiTags('CompanyLookup')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('companies/lookup')
export class CompanyLookupController {
  constructor(private readonly service: CompanyLookupService) {}

  @Get()
  async search(@Query('q') q: string) {
    const items = await this.service.search(q ?? '');
    return { items, providersAvailable: await this.service.hasAnyProvider() };
  }

  @Get('siren/:siren')
  getBySiren(@Param('siren') siren: string) {
    return this.service.getBySiren(siren);
  }
}

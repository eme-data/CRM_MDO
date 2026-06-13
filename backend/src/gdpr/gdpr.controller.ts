import {
  Controller,
  Get,
  Header,
  Param,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Response } from 'express';
import { GdprService } from './gdpr.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, JwtUser } from '../common/decorators/current-user.decorator';

@ApiTags('GDPR')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('gdpr')
export class GdprController {
  constructor(private readonly gdpr: GdprService) {}

  // Export JSON downloadable - l'admin / manager peut le transmettre au contact.
  @Roles('ADMIN', 'MANAGER')
  @Get('contacts/:id/export')
  @Header('Content-Type', 'application/json')
  async exportContact(
    @Param('id') id: string,
    @Res() res: Response,
    @CurrentUser() user: JwtUser,
  ) {
    const data = await this.gdpr.exportContact(id, user.tenantId);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="rgpd_contact_${id}.json"`,
    );
    res.send(JSON.stringify(data, null, 2));
  }

  // Anonymisation - reservee a l'admin (action irreversible).
  @Roles('ADMIN')
  @Post('contacts/:id/anonymize')
  anonymizeContact(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.gdpr.anonymizeContact(id, user.id, user.tenantId);
  }
}

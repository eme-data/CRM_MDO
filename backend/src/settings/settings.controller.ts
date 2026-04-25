import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
  Logger,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import * as nodemailer from 'nodemailer';
import { ImapFlow } from 'imapflow';
import { SettingsService } from './settings.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, JwtUser } from '../common/decorators/current-user.decorator';

@ApiTags('Settings')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@Controller('admin/settings')
export class SettingsController {
  private readonly logger = new Logger(SettingsController.name);

  constructor(private readonly service: SettingsService) {}

  @Get()
  list() {
    return this.service.listForAdmin();
  }

  @Patch(':key')
  update(
    @Param('key') key: string,
    @Body() body: { value: string | null },
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.update(key, body.value, user.id);
  }

  @Post('test/smtp')
  async testSmtp(@Body() body: { to?: string }) {
    const host = await this.service.get('smtp.host');
    const port = await this.service.getInt('smtp.port', 587);
    const secure = await this.service.getBool('smtp.secure');
    const user = await this.service.get('smtp.user');
    const pass = await this.service.get('smtp.password');
    const from = (await this.service.get('smtp.from')) || user || '';

    if (!host || !user || !pass) {
      throw new HttpException('Config SMTP incomplete', HttpStatus.BAD_REQUEST);
    }

    const transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: { user, pass },
    });

    try {
      await transporter.verify();
    } catch (err: any) {
      throw new HttpException('Echec connexion SMTP : ' + err.message, HttpStatus.BAD_GATEWAY);
    }

    if (body.to) {
      try {
        await transporter.sendMail({
          from,
          to: body.to,
          subject: '[CRM MDO] Test SMTP',
          text: 'Ceci est un email de test depuis le CRM MDO Services. La configuration SMTP fonctionne correctement.',
          html: '<p>Ceci est un email de test depuis le CRM MDO Services.</p><p>La configuration SMTP fonctionne correctement.</p>',
        });
        return { ok: true, message: 'Email de test envoye a ' + body.to };
      } catch (err: any) {
        throw new HttpException('Verify OK mais envoi a echoue : ' + err.message, HttpStatus.BAD_GATEWAY);
      }
    }

    return { ok: true, message: 'Connexion SMTP verifiee' };
  }

  @Post('test/imap')
  async testImap() {
    const host = await this.service.get('imap.host');
    const port = await this.service.getInt('imap.port', 993);
    const secure = (await this.service.get('imap.secure')) !== 'false';
    const user = await this.service.get('imap.user');
    const pass = await this.service.get('imap.password');
    const folder = (await this.service.get('imap.folder')) || 'INBOX';

    if (!host || !user || !pass) {
      throw new HttpException('Config IMAP incomplete', HttpStatus.BAD_REQUEST);
    }

    const client = new ImapFlow({
      host,
      port,
      secure,
      auth: { user, pass },
      logger: false,
    });

    try {
      await client.connect();
      const mailbox = await client.mailboxOpen(folder, { readOnly: true });
      const result = {
        ok: true,
        message:
          'Connexion IMAP OK - dossier ' + folder + ' ouvert (' + mailbox.exists + ' messages)',
      };
      await client.logout().catch(() => {});
      return result;
    } catch (err: any) {
      await client.logout().catch(() => {});
      throw new HttpException('Echec connexion IMAP : ' + err.message, HttpStatus.BAD_GATEWAY);
    }
  }
}

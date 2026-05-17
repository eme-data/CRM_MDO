import { IsArray, IsEnum, IsOptional, IsString, IsUrl, MaxLength } from 'class-validator';
import { WebhookEvent } from '@prisma/client';

export class CreateWebhookDto {
  // Le service WebhooksService.create() rejette deja les URLs non-HTTPS et
  // les IPs privees via assertSafePublicUrl, mais on filtre une 1ere fois
  // ici pour eviter des paylods invalides qui transitent en interne.
  @IsUrl({ protocols: ['https'], require_protocol: true, require_tld: true })
  url!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  // Au moins 1 event — verifie en plus dans le service.
  @IsArray()
  @IsEnum(WebhookEvent, { each: true })
  events!: WebhookEvent[];

  @IsOptional()
  @IsString()
  companyId?: string;
}

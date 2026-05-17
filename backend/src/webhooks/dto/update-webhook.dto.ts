import { IsArray, IsBoolean, IsEnum, IsOptional, IsString, IsUrl, MaxLength } from 'class-validator';
import { WebhookEvent } from '@prisma/client';

export class UpdateWebhookDto {
  @IsOptional()
  @IsUrl({ protocols: ['https'], require_protocol: true, require_tld: true })
  url?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string | null;

  @IsOptional()
  @IsArray()
  @IsEnum(WebhookEvent, { each: true })
  events?: WebhookEvent[];

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

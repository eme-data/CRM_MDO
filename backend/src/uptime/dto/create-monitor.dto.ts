import { IsBoolean, IsInt, IsNotEmpty, IsOptional, IsString, IsUrl, Max, Min } from 'class-validator';

export class CreateMonitorDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @IsUrl({ require_protocol: true })
  url!: string;

  @IsOptional()
  @IsString()
  method?: string;

  @IsOptional()
  @IsInt()
  @Min(100)
  @Max(599)
  expectedStatus?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(60)
  intervalMinutes?: number;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;

  @IsOptional()
  @IsString()
  companyId?: string;
}

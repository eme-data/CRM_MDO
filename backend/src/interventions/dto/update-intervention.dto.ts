import { PartialType } from '@nestjs/mapped-types';
import { CreateInterventionDto } from './create-intervention.dto';
import { IsDateString, IsOptional, IsString } from 'class-validator';

export class UpdateInterventionDto extends PartialType(CreateInterventionDto) {
  @IsOptional()
  @IsDateString()
  startedAt?: string;

  @IsOptional()
  @IsDateString()
  endedAt?: string;

  @IsOptional()
  @IsString()
  report?: string;
}

import { PartialType } from '@nestjs/mapped-types';
import { CreateContractDto } from './create-contract.dto';
import { IsDateString, IsOptional, IsString } from 'class-validator';

export class UpdateContractDto extends PartialType(CreateContractDto) {
  @IsOptional()
  @IsDateString()
  terminatedAt?: string;

  @IsOptional()
  @IsString()
  terminationReason?: string;
}

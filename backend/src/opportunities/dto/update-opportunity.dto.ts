import { PartialType } from '@nestjs/mapped-types';
import { CreateOpportunityDto } from './create-opportunity.dto';
import { IsDateString, IsEnum, IsOptional, IsString } from 'class-validator';
import { OpportunityLossReason, OpportunityWinReason } from '@prisma/client';

export class UpdateOpportunityDto extends PartialType(CreateOpportunityDto) {
  @IsOptional()
  @IsDateString()
  closedAt?: string;

  @IsOptional()
  @IsString()
  lostReason?: string;

  @IsOptional()
  @IsEnum(OpportunityLossReason)
  lossReasonCode?: OpportunityLossReason;

  @IsOptional()
  @IsEnum(OpportunityWinReason)
  winReasonCode?: OpportunityWinReason;

  @IsOptional()
  @IsString()
  competitorName?: string;
}

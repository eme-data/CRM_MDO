import {
  IsBoolean,
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  MaxLength,
} from 'class-validator';
import { WorkflowTrigger, WorkflowAction } from '@prisma/client';

// Note : la validation fine de triggerParams / actionParams se fait cote service
// via les helpers (validateTriggerParams / validateActionParams), pas via
// class-validator — car la forme du JSON depend du trigger/action choisi.

export class CreateWorkflowRuleDto {
  @IsString()
  @Length(2, 120)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsEnum(WorkflowTrigger)
  trigger!: WorkflowTrigger;

  @IsObject()
  triggerParams!: Record<string, unknown>;

  @IsEnum(WorkflowAction)
  action!: WorkflowAction;

  @IsObject()
  actionParams!: Record<string, unknown>;

  @IsOptional()
  @IsUUID()
  assigneeId?: string;
}

export class UpdateWorkflowRuleDto {
  @IsOptional()
  @IsString()
  @Length(2, 120)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string | null;

  @IsOptional()
  @IsEnum(WorkflowTrigger)
  trigger?: WorkflowTrigger;

  @IsOptional()
  @IsObject()
  triggerParams?: Record<string, unknown>;

  @IsOptional()
  @IsEnum(WorkflowAction)
  action?: WorkflowAction;

  @IsOptional()
  @IsObject()
  actionParams?: Record<string, unknown>;

  @IsOptional()
  @IsUUID()
  assigneeId?: string | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

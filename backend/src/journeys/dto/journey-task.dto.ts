import { IsBoolean, IsOptional, IsString, IsDateString, MaxLength } from 'class-validator';

// Ajout d'une tache ad-hoc a un parcours.
export class AddTaskDto {
  @IsString()
  @MaxLength(300)
  label!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  responsible?: string;

  @IsOptional()
  @IsDateString()
  dueDate?: string;
}

// Cochage / decochage d'une tache.
export class ToggleTaskDto {
  @IsBoolean()
  done!: boolean;
}

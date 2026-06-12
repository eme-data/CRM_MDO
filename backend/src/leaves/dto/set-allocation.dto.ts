import { IsInt, IsNumber, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class SetAllocationDto {
  @IsString()
  userId!: string;

  @IsString()
  typeId!: string;

  @Type(() => Number)
  @IsInt()
  @Min(2000)
  @Max(2100)
  year!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(366)
  allocated!: number;
}

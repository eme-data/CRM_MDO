import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class DecideTimesheetDto {
  @IsBoolean()
  approve!: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}

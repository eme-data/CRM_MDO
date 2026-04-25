import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class AddMessageDto {
  @IsString()
  @IsNotEmpty()
  content!: string;

  @IsOptional()
  @IsBoolean()
  isInternal?: boolean;
}

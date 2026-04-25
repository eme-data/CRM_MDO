import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateDocPageDto {
  @IsString() @IsNotEmpty() companyId!: string;
  @IsString() @IsNotEmpty() title!: string;
  @IsOptional() @IsString() category?: string;
  @IsString() body!: string;
}

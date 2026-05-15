import { PartialType } from '@nestjs/swagger';
import { UpsertSubprocessorDto } from './upsert-subprocessor.dto';

// Update : tous les champs deviennent optionnels (PATCH-friendly).
export class UpdateSubprocessorDto extends PartialType(UpsertSubprocessorDto) {}

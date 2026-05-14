import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class QontoSyncDto {
  // Fenetre de pull en jours. Borne basse 1 (eviter sync vide), borne haute
  // 90 (au-dela, le pull Qonto est lent et le cron quotidien suffit pour le
  // rattrapage. Pour un import historique initial, faire en plusieurs passes).
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(90)
  sinceDays?: number;
}

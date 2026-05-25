import {
  IsArray,
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  Min,
} from 'class-validator';

export class CreateProxmoxClusterDto {
  @IsString()
  companyId!: string;

  @IsString()
  name!: string;

  @IsOptional()
  @IsUrl({ require_tld: false })
  apiUrl?: string;

  @IsOptional()
  @IsInt()
  @Min(5)
  @Max(1440)
  expectedPushIntervalMin?: number;
}

export class UpdateProxmoxClusterDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsUrl({ require_tld: false })
  apiUrl?: string | null;

  @IsOptional()
  @IsInt()
  @Min(5)
  @Max(1440)
  expectedPushIntervalMin?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

// Format pousse par l'agent (alimente par `pvesh get /cluster/resources --output-format=json`).
// On accepte un tableau d'objets heterogenes (type=node|qemu|lxc|storage|pool|sdn).
// On ne valide strictement QUE ce qu'on consomme pour les agregats (type+status+cpu+mem+disk
// avec leurs maxX). Le reste passe en JSONB rawPayload.

export class ProxmoxResourceDto {
  @IsString()
  id!: string;
  @IsString()
  type!: string; // 'node' | 'qemu' | 'lxc' | 'storage' | 'pool' | 'sdn'
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() node?: string;
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsInt() vmid?: number;
  @IsOptional() @IsNumber() cpu?: number;
  @IsOptional() @IsNumber() maxcpu?: number;
  @IsOptional() @IsNumber() mem?: number;
  @IsOptional() @IsNumber() maxmem?: number;
  @IsOptional() @IsNumber() disk?: number;
  @IsOptional() @IsNumber() maxdisk?: number;
  @IsOptional() @IsNumber() uptime?: number;
  @IsOptional() @IsInt() template?: number;
  @IsOptional() @IsNumber() shared?: number;
}

export class IngestSnapshotDto {
  // Timestamp Unix (seconds) du moment de capture cote agent. Permet de
  // detecter une derive d'horloge ou un push tardif (network buffer).
  @IsOptional()
  @IsInt()
  capturedAtUnix?: number;

  @IsArray()
  resources!: ProxmoxResourceDto[];
}

import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../database/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { AiService } from '../ai/ai.service';

const WHISPER_API_URL = 'https://api.openai.com/v1/audio/transcriptions';
const WHISPER_MODEL = 'whisper-1';

@Injectable()
export class CallTranscriptionService {
  private readonly logger = new Logger(CallTranscriptionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly ai: AiService,
  ) {}

  // ============================================================
  // Transcrit un CallLog : telecharge MP3 -> Whisper -> stocke transcript
  // -> resume Claude -> stocke summary
  // Multi-tenant : la cle OpenAI est resolue PAR TENANT (depuis le tenantId
  // du CallLog). Sinon les appels Mairie de Seysses seraient transcrits avec
  // la cle MDO et factures sur compte MDO.
  // ============================================================
  async transcribe(callId: string) {
    const call = await this.prisma.callLog.findUnique({ where: { id: callId } });
    if (!call) throw new NotFoundException('Appel introuvable');
    if (!call.recordingUrl) throw new BadRequestException('Pas de recordingUrl sur cet appel');

    const apiKey = await this.settings.get('ai.openaiApiKey', call.tenantId);
    if (!apiKey) throw new BadRequestException('Cle OpenAI non configuree pour ce tenant (Settings ai.openaiApiKey)');

    // Marque RUNNING
    await this.prisma.callLog.update({
      where: { id: callId },
      data: { transcriptionStatus: 'RUNNING', transcriptionError: null },
    });

    try {
      // 1. Telecharge le fichier audio (60s timeout : un audio de 30 min
      // pese ~30 MB, le download peut prendre quelques secondes mais pas
      // plusieurs minutes — au-dela on suspecte un blocage reseau).
      const audioRes = await fetch(call.recordingUrl, {
        signal: AbortSignal.timeout(60_000),
      });
      if (!audioRes.ok) throw new Error('Telechargement recording HTTP ' + audioRes.status);
      const audioBuf = Buffer.from(await audioRes.arrayBuffer());
      const audioBlob = new Blob([new Uint8Array(audioBuf)], { type: 'audio/mpeg' });

      // 2. POST Whisper (5 min timeout)
      const fd = new FormData();
      fd.append('file', audioBlob, 'recording.mp3');
      fd.append('model', WHISPER_MODEL);
      fd.append('response_format', 'verbose_json');
      fd.append('language', 'fr');
      const wRes = await fetch(WHISPER_API_URL, {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + apiKey },
        body: fd as any,
        signal: AbortSignal.timeout(300_000),
      });
      if (!wRes.ok) {
        const t = await wRes.text();
        throw new Error('Whisper HTTP ' + wRes.status + ' : ' + t.slice(0, 300));
      }
      const wJson: any = await wRes.json();
      const transcript: string = wJson.text ?? '';
      const language: string = wJson.language ?? 'fr';

      // 3. Resume via Claude PAR TENANT (cle Anthropic du tenant) - best-effort
      let summary: string | null = null;
      try {
        const enabled = await this.ai.isEnabled(call.tenantId);
        if (enabled && transcript.length > 50) {
          summary = await this.ai.invoke({
            tenantId: call.tenantId,
            capability: 'GENERIC',
            systemPrompt:
              'Tu resumes des transcriptions d\'appels telephoniques pour un MSP. ' +
              'Format : 3-5 puces factuelles + 1 section "Actions a faire" si applicable. ' +
              'En francais, neutre, sans interpretation au-dela de ce qui est dit.',
            userMessage: 'Transcription :\n\n' + transcript.slice(0, 8000),
            cacheSystem: true,
            maxTokens: 600,
            temperature: 0.2,
            entityType: 'CallLog',
            entityId: callId,
          });
        }
      } catch (err: any) {
        this.logger.warn('Resume Claude echoue : ' + err.message + ' (transcript stocke quand meme)');
      }

      await this.prisma.callLog.update({
        where: { id: callId },
        data: {
          transcript,
          summary,
          transcriptionLanguage: language,
          transcribedAt: new Date(),
          transcriptionStatus: 'DONE',
          transcriptionError: null,
        },
      });
      return { ok: true, transcriptLength: transcript.length, hasSummary: !!summary };
    } catch (err: any) {
      // Best-effort : on tente d'enregistrer l'echec en BDD, mais s'il echoue
      // aussi (DB indispo) on log l'erreur secondaire avant de re-throw
      // l'erreur originale (qui est ce qui interesse le caller).
      await this.prisma.callLog.update({
        where: { id: callId },
        data: { transcriptionStatus: 'FAILED', transcriptionError: err.message?.slice(0, 500) },
      }).catch((updateErr: any) => {
        this.logger.warn(
          'Impossible de marquer callLog ' + callId + ' en FAILED : ' +
          (updateErr?.message ?? updateErr),
        );
      });
      throw err;
    }
  }

  // Cron 15min : transcrit auto les appels avec recordingUrl + sans transcript.
  // Itere PAR TENANT pour respecter SES propres reglages enabled / cle.
  @Cron('*/15 * * * *', { name: 'call-transcribe-auto' })
  async runAuto() {
    const tenants = await this.prisma.tenant.findMany({
      where: { isActive: true },
      select: { id: true },
    });
    let total = 0;
    for (const t of tenants) {
      try {
        const enabled = await this.settings.getBool('ai.transcribeCallsAuto', t.id);
        if (!enabled) continue;
        const apiKey = await this.settings.get('ai.openaiApiKey', t.id);
        if (!apiKey) continue;
        const calls = await this.prisma.callLog.findMany({
          where: {
            tenantId: t.id,
            recordingUrl: { not: null },
            transcriptionStatus: null,
          },
          take: 5, // batch pour limiter la facture
          select: { id: true },
        });
        for (const c of calls) {
          try { await this.transcribe(c.id); total++; }
          catch (err: any) { this.logger.warn('Transcribe auto echec ' + c.id + ' : ' + err.message); }
        }
      } catch (err: any) {
        this.logger.warn('Transcribe cron tenant ' + t.id + ' echec : ' + err.message);
      }
    }
    if (total > 0) this.logger.log('Transcribe auto : ' + total + ' appel(s) traite(s) sur ' + tenants.length + ' tenant(s)');
  }
}

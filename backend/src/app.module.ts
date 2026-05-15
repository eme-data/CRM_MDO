import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { BullModule } from '@nestjs/bullmq';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import configuration from './config/configuration';
import { PrismaModule } from './database/prisma.module';
import { SettingsModule } from './settings/settings.module';
import { NotificationsModule } from './notifications/notifications.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { CompaniesModule } from './companies/companies.module';
import { CompanyLookupModule } from './company-lookup/company-lookup.module';
import { ContactsModule } from './contacts/contacts.module';
import { OpportunitiesModule } from './opportunities/opportunities.module';
import { ContractsModule } from './contracts/contracts.module';
import { InterventionsModule } from './interventions/interventions.module';
import { TicketsModule } from './tickets/tickets.module';
import { TasksModule } from './tasks/tasks.module';
import { TimeEntriesModule } from './time-entries/time-entries.module';
import { ResponseTemplatesModule } from './response-templates/response-templates.module';
import { NotesModule } from './notes/notes.module';
import { ActivitiesModule } from './activities/activities.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { MailModule } from './mail/mail.module';
import { MailInboundModule } from './mail-inbound/mail-inbound.module';
import { AttachmentsModule } from './attachments/attachments.module';
import { PdfModule } from './pdf/pdf.module';
import { AssetsModule } from './assets/assets.module';
import { ClientDocsModule } from './client-docs/client-docs.module';
import { InvoicesModule } from './invoices/invoices.module';
import { BillingModule } from './billing/billing.module';
import { LocationsModule } from './locations/locations.module';
import { NetworksModule } from './networks/networks.module';
import { FlexibleAssetsModule } from './flexible-assets/flexible-assets.module';
import { ItemLinksModule } from './item-links/item-links.module';
import { QuickNotesModule } from './quick-notes/quick-notes.module';
import { MonitoringModule } from './monitoring/monitoring.module';
import { UptimeModule } from './uptime/uptime.module';
import { EmergencyPdfModule } from './emergency-pdf/emergency-pdf.module';
import { RunbooksModule } from './runbooks/runbooks.module';
import { MfaModule } from './mfa/mfa.module';
import { ImportsModule } from './imports/imports.module';
import { SearchModule } from './search/search.module';
import { SurveillanceModule } from './surveillance/surveillance.module';
import { ReportsModule } from './reports/reports.module';
import { ClientReportsModule } from './client-reports/client-reports.module';
import { StatusModule } from './status/status.module';
import { NpsModule } from './nps/nps.module';
import { ClientPortalModule } from './client-portal/client-portal.module';
import { M365Module } from './m365/m365.module';
import { GdprModule } from './gdpr/gdpr.module';
import { CyberScoreModule } from './cyber-score/cyber-score.module';
import { LeadsModule } from './leads/leads.module';
import { RecurringTasksModule } from './recurring-tasks/recurring-tasks.module';
import { WorkflowModule } from './workflow/workflow.module';
import { QuotesModule } from './quotes/quotes.module';
import { SignatureModule } from './signature/signature.module';
import { CallsModule } from './calls/calls.module';
import { AiModule } from './ai/ai.module';
import { HealthController } from './health/health.controller';
import { MetricsController } from './common/observability/metrics.controller';
import { MetricsService } from './common/observability/metrics.service';
import { AppLoggerModule } from './common/observability/logger.module';
import { CacheModule } from './common/cache/cache.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { MfaRequiredGuard } from './common/guards/mfa-required.guard';
import { RolesGuard } from './common/guards/roles.guard';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
    }),
    AppLoggerModule,
    CacheModule,
    ScheduleModule.forRoot(),
    // Rate-limiting global. Definit deux paliers :
    //  - "short" : 60 req / minute (anti-burst)
    //  - "medium": 600 req / 10 min (utilisation normale)
    // Les controleurs sensibles (auth) appliquent un palier "auth" plus strict via @Throttle.
    ThrottlerModule.forRoot([
      { name: 'short', ttl: 60_000, limit: 60 },
      { name: 'medium', ttl: 600_000, limit: 600 },
      { name: 'auth', ttl: 300_000, limit: 10 },
    ]),
    BullModule.forRootAsync({
      useFactory: () => ({
        connection: {
          host: process.env.REDIS_HOST ?? 'redis',
          port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
          password: process.env.REDIS_PASSWORD,
        },
      }),
    }),
    PrismaModule,
    SettingsModule,
    NotificationsModule,
    PdfModule,
    MailModule,
    MailInboundModule,
    AttachmentsModule,
    ClientDocsModule,
    MfaModule,
    AuthModule,
    UsersModule,
    CompanyLookupModule,
    CompaniesModule,
    ContactsModule,
    OpportunitiesModule,
    ContractsModule,
    InterventionsModule,
    TicketsModule,
    TasksModule,
    TimeEntriesModule,
    ResponseTemplatesModule,
    AssetsModule,
    InvoicesModule,
    BillingModule,
    LocationsModule,
    NetworksModule,
    FlexibleAssetsModule,
    ItemLinksModule,
    QuickNotesModule,
    MonitoringModule,
    UptimeModule,
    EmergencyPdfModule,
    RunbooksModule,
    ImportsModule,
    SearchModule,
    SurveillanceModule,
    ReportsModule,
    ClientReportsModule,
    StatusModule,
    NpsModule,
    ClientPortalModule,
    M365Module,
    GdprModule,
    CyberScoreModule,
    LeadsModule,
    RecurringTasksModule,
    WorkflowModule,
    QuotesModule,
    SignatureModule,
    CallsModule,
    AiModule,
    NotesModule,
    ActivitiesModule,
    DashboardModule,
  ],
  controllers: [HealthController, MetricsController],
  providers: [
    MetricsService,
    // ThrottlerGuard avant JwtAuthGuard : on rate-limit AVANT de tenter l'auth,
    // sinon un attaquant epuise le pool bcrypt en bombardant /auth/login.
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    // Apres l'auth : bloque les utilisateurs dont le role exige la 2FA mais qui
    // ne l'ont pas encore activee. AuthController et MfaController sont marques
    // @AllowMfaPending pour permettre la configuration initiale.
    {
      provide: APP_GUARD,
      useClass: MfaRequiredGuard,
    },
    // RolesGuard global : applique les decorateurs @Roles() sans que chaque
    // controller ait a les redeclarer dans @UseGuards(). Si un endpoint n'a
    // pas de @Roles(), le guard retourne true (pas de restriction).
    // Important : place APRES JwtAuthGuard car il a besoin de req.user.
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
  ],
})
export class AppModule {}

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { BullModule } from '@nestjs/bullmq';
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
import { HealthController } from './health/health.controller';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
    }),
    ScheduleModule.forRoot(),
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
    MailModule,
    MailInboundModule,
    AttachmentsModule,
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
    NotesModule,
    ActivitiesModule,
    DashboardModule,
  ],
  controllers: [HealthController],
  providers: [
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
  ],
})
export class AppModule {}

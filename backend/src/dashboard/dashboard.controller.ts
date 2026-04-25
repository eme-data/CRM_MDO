import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { addDays } from 'date-fns';
import { PrismaService } from '../database/prisma.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ContractsService } from '../contracts/contracts.service';
import { TicketsService } from '../tickets/tickets.service';

@ApiTags('Dashboard')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('dashboard')
export class DashboardController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly contractsService: ContractsService,
    private readonly ticketsService: TicketsService,
  ) {}

  @Get()
  async get() {
    const now = new Date();
    const [
      companiesTotal,
      customersTotal,
      prospectsTotal,
      openOpportunities,
      pipelineValue,
      tasksDueToday,
      contractsStats,
      expiringSoon,
      ticketsStats,
      recentActivities,
    ] = await Promise.all([
      this.prisma.company.count(),
      this.prisma.company.count({ where: { status: 'CUSTOMER' } }),
      this.prisma.company.count({ where: { status: { in: ['LEAD', 'PROSPECT'] } } }),
      this.prisma.opportunity.count({ where: { stage: { notIn: ['GAGNE', 'PERDU'] } } }),
      this.prisma.opportunity.aggregate({
        where: { stage: { notIn: ['GAGNE', 'PERDU'] } },
        _sum: { amountHt: true },
      }),
      this.prisma.task.count({
        where: {
          status: { notIn: ['DONE', 'CANCELLED'] },
          dueDate: { lte: addDays(now, 1) },
        },
      }),
      this.contractsService.stats(),
      this.contractsService.expiringSoon(90),
      this.ticketsService.stats(),
      this.prisma.activity.findMany({
        take: 15,
        orderBy: { createdAt: 'desc' },
        include: { user: { select: { firstName: true, lastName: true } } },
      }),
    ]);

    return {
      companies: { total: companiesTotal, customers: customersTotal, prospects: prospectsTotal },
      opportunities: {
        open: openOpportunities,
        pipelineValueHt: Number(pipelineValue._sum.amountHt ?? 0),
      },
      tasks: { dueToday: tasksDueToday },
      contracts: contractsStats,
      tickets: ticketsStats,
      expiringSoon,
      recentActivities,
    };
  }
}

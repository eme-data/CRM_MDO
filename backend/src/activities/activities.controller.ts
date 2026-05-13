import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Prisma, Role } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { Roles } from '../common/decorators/roles.decorator';

// Journal d'activite : sensible (qui a fait quoi, quand, sur quelle entite).
// Reserve aux ADMIN — sert d'audit trail et ne doit pas etre consulte par
// les utilisateurs operationnels (SALES, MANAGER).
@ApiTags('Activities')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Roles(Role.ADMIN)
@Controller('activities')
export class ActivitiesController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async findAll(
    @Query('entity') entity?: string,
    @Query('entityId') entityId?: string,
    @Query('userId') userId?: string,
    @Query('action') action?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    const where: Prisma.ActivityWhereInput = {};
    if (entity) where.entity = entity;
    if (entityId) where.entityId = entityId;
    if (userId) where.userId = userId;
    if (action) where.action = action;
    if (from || to) {
      where.createdAt = {};
      if (from) (where.createdAt as any).gte = new Date(from);
      if (to) (where.createdAt as any).lte = new Date(to);
    }
    const take = limit ? parseInt(limit, 10) : 50;
    const skip = offset ? parseInt(offset, 10) : 0;
    const [items, total] = await Promise.all([
      this.prisma.activity.findMany({
        where,
        include: { user: { select: { id: true, firstName: true, lastName: true } } },
        orderBy: { createdAt: 'desc' },
        take,
        skip,
      }),
      this.prisma.activity.count({ where }),
    ]);
    return { items, total, take, skip };
  }
}

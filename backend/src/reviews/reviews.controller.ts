import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ReviewsService } from './reviews.service';
import { CreateReviewDto } from './dto/create-review.dto';
import { UpdateReviewDto } from './dto/update-review.dto';
import { CreateObjectiveDto } from './dto/create-objective.dto';
import { UpdateObjectiveDto } from './dto/update-objective.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, JwtUser } from '../common/decorators/current-user.decorator';

@ApiTags('Entretiens & objectifs (SIRH)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller()
export class ReviewsController {
  constructor(private readonly service: ReviewsService) {}

  // ----- Entretiens -----
  @Get('reviews/mine')
  myReviews(@CurrentUser() user: JwtUser) {
    return this.service.listMine(user);
  }

  @Roles('ADMIN', 'MANAGER')
  @Get('reviews')
  managed(@CurrentUser() user: JwtUser) {
    return this.service.listManaged(user);
  }

  @Roles('ADMIN', 'MANAGER')
  @Post('reviews')
  create(@Body() dto: CreateReviewDto, @CurrentUser() user: JwtUser) {
    return this.service.create(user, dto);
  }

  @Get('reviews/:id')
  getOne(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.service.getOne(user, id);
  }

  @Patch('reviews/:id')
  update(@Param('id') id: string, @Body() dto: UpdateReviewDto, @CurrentUser() user: JwtUser) {
    return this.service.update(user, id, dto);
  }

  // ----- Objectifs -----
  @Get('objectives/mine')
  myObjectives(@CurrentUser() user: JwtUser) {
    return this.service.listMyObjectives(user);
  }

  @Get('objectives')
  objectivesFor(@Query('userId') userId: string, @CurrentUser() user: JwtUser) {
    return this.service.listObjectivesFor(user, userId);
  }

  @Roles('ADMIN', 'MANAGER')
  @Post('objectives')
  createObjective(@Body() dto: CreateObjectiveDto, @CurrentUser() user: JwtUser) {
    return this.service.createObjective(user, dto);
  }

  @Patch('objectives/:id')
  updateObjective(@Param('id') id: string, @Body() dto: UpdateObjectiveDto, @CurrentUser() user: JwtUser) {
    return this.service.updateObjective(user, id, dto);
  }

  @Roles('ADMIN', 'MANAGER')
  @Delete('objectives/:id')
  deleteObjective(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.service.deleteObjective(user, id);
  }
}

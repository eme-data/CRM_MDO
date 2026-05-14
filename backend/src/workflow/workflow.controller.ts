import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, JwtUser } from '../common/decorators/current-user.decorator';
import { WorkflowService } from './workflow.service';
import {
  CreateWorkflowRuleDto,
  UpdateWorkflowRuleDto,
} from './dto/workflow-rule.dto';

@ApiTags('Workflow')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('workflow-rules')
export class WorkflowController {
  constructor(private readonly service: WorkflowService) {}

  @Get()
  list() {
    return this.service.list();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Roles('ADMIN', 'MANAGER')
  @Post()
  create(@Body() dto: CreateWorkflowRuleDto, @CurrentUser() user: JwtUser) {
    return this.service.create(dto, user.id);
  }

  @Roles('ADMIN', 'MANAGER')
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateWorkflowRuleDto) {
    return this.service.update(id, dto);
  }

  @Roles('ADMIN', 'MANAGER')
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }

  // Force evaluation immediate de la regle (admin debug + premier run apres
  // creation pour ne pas attendre 24h).
  @Roles('ADMIN', 'MANAGER')
  @Post(':id/evaluate')
  evaluate(@Param('id') id: string) {
    return this.service.evaluateRule(id);
  }

  // Reset les executions : la regle pourra re-tirer sur des entites deja
  // traitees. Utile apres correction d'un parametre ou suppression manuelle
  // des Tasks creees par cette regle.
  @Roles('ADMIN', 'MANAGER')
  @Post(':id/reset-executions')
  resetExecutions(@Param('id') id: string) {
    return this.service.resetExecutions(id);
  }
}

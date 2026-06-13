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
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, JwtUser } from '../common/decorators/current-user.decorator';

@ApiTags('Users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  list(@CurrentUser() user: JwtUser) {
    return this.usersService.list(user.tenantId);
  }

  // Profil de l'utilisateur connecte (signature, prenom, nom)
  @Get('me/profile')
  myProfile(@CurrentUser() user: JwtUser) {
    return this.usersService.findById(user.id, user.tenantId);
  }

  @Patch('me/profile')
  updateMyProfile(
    @CurrentUser() user: JwtUser,
    @Body() body: { firstName?: string; lastName?: string; signature?: string | null },
  ) {
    return this.usersService.updateMyProfile(user.id, body);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.usersService.findById(id, user.tenantId);
  }

  @Roles('ADMIN')
  @Post()
  create(@Body() dto: CreateUserDto, @CurrentUser() user: JwtUser) {
    // Multi-tenant : on cree le user dans le meme tenant que l'admin createur.
    // Empeche la creation cross-tenant accidentelle (un admin du tenant A ne
    // peut pas creer un user dans le tenant B).
    return this.usersService.create(dto, user.tenantId);
  }

  @Roles('ADMIN')
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateUserDto, @CurrentUser() user: JwtUser) {
    return this.usersService.update(id, dto, user.tenantId);
  }

  @Roles('ADMIN')
  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.usersService.remove(id, user.id, user.tenantId);
  }

  // Rate limit serre : 5 reset/5min/IP. Sans cette limite, un ADMIN compromis
  // pourrait reset les mdp de tous les autres ADMIN/MANAGER en boucle pour
  // s'auto-locker l'org, ou un script automatisant les requetes pourrait
  // rapidement degrader le service (chaque reset = bcrypt round 12 ~ 200ms CPU).
  @Throttle({ auth: { limit: 5, ttl: 300_000 } })
  @Roles('ADMIN')
  @Post(':id/reset-password')
  resetPassword(
    @Param('id') id: string,
    @Body() body: { newPassword: string },
    @CurrentUser() user: JwtUser,
  ) {
    return this.usersService.resetPassword(id, body.newPassword, user.tenantId);
  }
}

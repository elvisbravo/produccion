import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { Publico } from '../auth/decoradores.js';
import { PrismaService } from '../prisma/prisma.service.js';

@Controller('salud')
export class SaludController {
  constructor(private readonly prisma: PrismaService) {}

  @Publico()
  @Get()
  async estado() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { estado: 'ok', baseDeDatos: 'ok', fecha: new Date().toISOString() };
    } catch {
      throw new ServiceUnavailableException({ estado: 'error', baseDeDatos: 'sin conexión' });
    }
  }
}

import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { OnGatewayConnection, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { EVENTO_NOTIFICACION, RUTA_SOCKET, type NotificacionItem } from '@grupoes/shared';
import type { Server, Socket } from 'socket.io';
import type { PayloadAccessToken } from '../auth/tipos.js';

const sala = (usuarioId: string) => `usuario:${usuarioId}`;

/**
 * Canal en vivo. La web se conecta con su access token (handshake.auth.token) y entra a su sala;
 * sin token válido, se desconecta. Mismo origen que la API (en desarrollo, a través del proxy de Vite).
 */
@WebSocketGateway({ path: RUTA_SOCKET, serveClient: false })
export class NotificacionesGateway implements OnGatewayConnection {
  private readonly log = new Logger(NotificacionesGateway.name);
  @WebSocketServer() private readonly servidor?: Server;

  constructor(private readonly jwt: JwtService) {}

  async handleConnection(cliente: Socket): Promise<void> {
    const token = (cliente.handshake.auth as { token?: unknown } | undefined)?.token;
    try {
      if (typeof token !== 'string') throw new Error('sin token');
      const payload = await this.jwt.verifyAsync<PayloadAccessToken>(token);
      await cliente.join(sala(payload.sub));
    } catch {
      cliente.emit('no_autorizado');
      cliente.disconnect(true);
    }
  }

  emitir(usuarioId: string, notificacion: NotificacionItem): void {
    try {
      this.servidor?.to(sala(usuarioId)).emit(EVENTO_NOTIFICACION, notificacion);
    } catch (error) {
      this.log.warn(`No se pudo emitir en vivo: ${(error as Error).message}`);
    }
  }
}

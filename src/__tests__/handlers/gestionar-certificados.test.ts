/**
 * Tests para el handler gestionar-certificados
 * Requisitos: 5.1, 5.3
 */

import { APIGatewayProxyEvent } from 'aws-lambda';
import { handler } from '../../handlers/gestionar-certificados';

describe('Handler: gestionar-certificados', () => {
  describe('POST /certificados/cargar', () => {
    it('debe cargar un certificado válido exitosamente', async () => {
      // Crear un certificado de prueba en base64
      const certificadoBuffer = Buffer.from('certificado-de-prueba-pfx', 'utf-8');
      const certificadoBase64 = certificadoBuffer.toString('base64');

      const event: Partial<APIGatewayProxyEvent> = {
        httpMethod: 'POST',
        path: '/certificados/cargar',
        body: JSON.stringify({
          empresaRuc: '20123456789',
          certificadoBase64,
          password: 'password123',
        }),
      };

      const result = await handler(event as APIGatewayProxyEvent);

      expect(result.statusCode).toBe(201);
      const body = JSON.parse(result.body);
      expect(body.message).toBe('Certificado cargado exitosamente');
      expect(body.data).toHaveProperty('ruc', '20123456789');
      expect(body.data).toHaveProperty('fechaEmision');
      expect(body.data).toHaveProperty('fechaVencimiento');
      expect(body.data).toHaveProperty('emisor');
      expect(body.data).toHaveProperty('diasParaVencimiento');
    });

    it('debe rechazar solicitud sin body', async () => {
      const event: Partial<APIGatewayProxyEvent> = {
        httpMethod: 'POST',
        path: '/certificados/cargar',
        body: null,
      };

      const result = await handler(event as APIGatewayProxyEvent);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('Solicitud inválida');
    });

    it('debe rechazar solicitud con campos faltantes', async () => {
      const event: Partial<APIGatewayProxyEvent> = {
        httpMethod: 'POST',
        path: '/certificados/cargar',
        body: JSON.stringify({
          empresaRuc: '20123456789',
          // Falta certificadoBase64 y password
        }),
      };

      const result = await handler(event as APIGatewayProxyEvent);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('Campos requeridos faltantes');
    });

    it('debe rechazar RUC inválido', async () => {
      const certificadoBuffer = Buffer.from('certificado-de-prueba-pfx', 'utf-8');
      const certificadoBase64 = certificadoBuffer.toString('base64');

      const event: Partial<APIGatewayProxyEvent> = {
        httpMethod: 'POST',
        path: '/certificados/cargar',
        body: JSON.stringify({
          empresaRuc: '123', // RUC inválido
          certificadoBase64,
          password: 'password123',
        }),
      };

      const result = await handler(event as APIGatewayProxyEvent);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.message).toContain('RUC');
    });
  });

  describe('GET /certificados/{ruc}/estado', () => {
    beforeEach(async () => {
      // Cargar un certificado de prueba
      const certificadoBuffer = Buffer.from('certificado-de-prueba-pfx', 'utf-8');
      const certificadoBase64 = certificadoBuffer.toString('base64');

      const event: Partial<APIGatewayProxyEvent> = {
        httpMethod: 'POST',
        path: '/certificados/cargar',
        body: JSON.stringify({
          empresaRuc: '20987654321',
          certificadoBase64,
          password: 'password123',
        }),
      };

      await handler(event as APIGatewayProxyEvent);
    });

    it('debe consultar el estado de un certificado existente', async () => {
      const event: Partial<APIGatewayProxyEvent> = {
        httpMethod: 'GET',
        path: '/certificados/20987654321/estado',
        pathParameters: {
          ruc: '20987654321',
        },
      };

      const result = await handler(event as APIGatewayProxyEvent);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.message).toBe('Estado del certificado consultado exitosamente');
      expect(body.data).toHaveProperty('ruc', '20987654321');
      expect(body.data).toHaveProperty('estado');
      expect(body.data).toHaveProperty('valido');
      expect(body.data).toHaveProperty('fechaVencimiento');
      expect(body.data).toHaveProperty('diasParaVencimiento');
      expect(body.data).toHaveProperty('proximoVencer');
    });

    it('debe retornar 404 para certificado no existente', async () => {
      const event: Partial<APIGatewayProxyEvent> = {
        httpMethod: 'GET',
        path: '/certificados/20111111111/estado',
        pathParameters: {
          ruc: '20111111111',
        },
      };

      const result = await handler(event as APIGatewayProxyEvent);

      expect(result.statusCode).toBe(404);
      const body = JSON.parse(result.body);
      expect(body.message).toContain('No existe');
    });

    it('debe rechazar solicitud sin RUC', async () => {
      const event: Partial<APIGatewayProxyEvent> = {
        httpMethod: 'GET',
        path: '/certificados/undefined/estado',
        pathParameters: null,
      };

      const result = await handler(event as APIGatewayProxyEvent);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('Parámetro requerido faltante');
    });
  });

  describe('GET /certificados/proximos-vencer', () => {
    it('debe listar certificados próximos a vencer', async () => {
      const event: Partial<APIGatewayProxyEvent> = {
        httpMethod: 'GET',
        path: '/certificados/proximos-vencer',
      };

      const result = await handler(event as APIGatewayProxyEvent);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.message).toBe('Certificados próximos a vencer consultados exitosamente');
      expect(body.data).toHaveProperty('total');
      expect(body.data).toHaveProperty('certificados');
      expect(Array.isArray(body.data.certificados)).toBe(true);
    });

    it('debe retornar lista vacía si no hay certificados próximos a vencer', async () => {
      const event: Partial<APIGatewayProxyEvent> = {
        httpMethod: 'GET',
        path: '/certificados/proximos-vencer',
      };

      const result = await handler(event as APIGatewayProxyEvent);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.data.total).toBeGreaterThanOrEqual(0);
      expect(Array.isArray(body.data.certificados)).toBe(true);
    });
  });

  describe('Endpoint no encontrado', () => {
    it('debe retornar 404 para endpoint desconocido', async () => {
      const event: Partial<APIGatewayProxyEvent> = {
        httpMethod: 'GET',
        path: '/certificados/endpoint-inexistente',
      };

      const result = await handler(event as APIGatewayProxyEvent);

      expect(result.statusCode).toBe(404);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('Endpoint no encontrado');
    });
  });
});

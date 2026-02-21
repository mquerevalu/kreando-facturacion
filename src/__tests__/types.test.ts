/**
 * Pruebas básicas para verificar que los tipos TypeScript están correctamente definidos
 */

import {
  TipoComprobante,
  EstadoComprobante,
  TipoMoneda,
  TipoDocumentoIdentidad,
  AfectacionIGV,
  Direccion,
  ValidationResult,
  Empresa,
  Certificado,
  Credenciales,
  Comprobante,
  Emisor,
  Receptor,
  ItemComprobante,
  CDR,
  DatosBoleta,
  DatosFactura,
  ApiResponse,
  GenerarComprobanteResponse,
} from '../types';

describe('Tipos TypeScript', () => {
  describe('Enums', () => {
    it('debe tener los valores correctos para TipoComprobante', () => {
      expect(TipoComprobante.FACTURA).toBe('01');
      expect(TipoComprobante.BOLETA).toBe('03');
    });

    it('debe tener los valores correctos para EstadoComprobante', () => {
      expect(EstadoComprobante.PENDIENTE).toBe('PENDIENTE');
      expect(EstadoComprobante.ACEPTADO).toBe('ACEPTADO');
    });

    it('debe tener los valores correctos para TipoMoneda', () => {
      expect(TipoMoneda.PEN).toBe('PEN');
      expect(TipoMoneda.USD).toBe('USD');
    });
  });

  describe('Interfaces', () => {
    it('debe permitir crear un objeto Direccion válido', () => {
      const direccion: Direccion = {
        departamento: 'Lima',
        provincia: 'Lima',
        distrito: 'Miraflores',
        direccion: 'Av. Larco 1234',
      };

      expect(direccion.departamento).toBe('Lima');
    });

    it('debe permitir crear un objeto Empresa válido', () => {
      const empresa: Empresa = {
        ruc: '20123456789',
        razonSocial: 'Empresa Test SAC',
        nombreComercial: 'Test',
        direccion: {
          departamento: 'Lima',
          provincia: 'Lima',
          distrito: 'Miraflores',
          direccion: 'Av. Test 123',
        },
        credencialesSunat: {
          ruc: '20123456789',
          usuario: 'MODDATOS',
          password: 'encrypted_password',
        },
        activo: true,
        fechaRegistro: new Date(),
      };

      expect(empresa.ruc).toBe('20123456789');
      expect(empresa.activo).toBe(true);
    });

    it('debe permitir crear un objeto ItemComprobante válido', () => {
      const item: ItemComprobante = {
        codigo: 'PROD001',
        descripcion: 'Producto de prueba',
        cantidad: 2,
        unidadMedida: 'NIU',
        precioUnitario: 100.0,
        afectacionIGV: AfectacionIGV.GRAVADO_OPERACION_ONEROSA,
        igv: 36.0,
        total: 236.0,
      };

      expect(item.cantidad).toBe(2);
      expect(item.total).toBe(236.0);
    });

    it('debe permitir crear un objeto Comprobante válido', () => {
      const comprobante: Comprobante = {
        empresaRuc: '20123456789',
        numero: 'B001-00000001',
        tipo: TipoComprobante.BOLETA,
        fecha: new Date(),
        emisor: {
          ruc: '20123456789',
          razonSocial: 'Empresa Test SAC',
          nombreComercial: 'Test',
          direccion: {
            departamento: 'Lima',
            provincia: 'Lima',
            distrito: 'Miraflores',
            direccion: 'Av. Test 123',
          },
        },
        receptor: {
          tipoDocumento: TipoDocumentoIdentidad.DNI,
          numeroDocumento: '12345678',
          nombre: 'Cliente Test',
        },
        items: [],
        subtotal: 100.0,
        igv: 18.0,
        total: 118.0,
        moneda: TipoMoneda.PEN,
        estado: EstadoComprobante.PENDIENTE,
      };

      expect(comprobante.tipo).toBe(TipoComprobante.BOLETA);
      expect(comprobante.estado).toBe(EstadoComprobante.PENDIENTE);
    });

    it('debe permitir crear un ValidationResult', () => {
      const resultado: ValidationResult = {
        valido: false,
        errores: ['Error 1', 'Error 2'],
      };

      expect(resultado.valido).toBe(false);
      expect(resultado.errores).toHaveLength(2);
    });

    it('debe permitir crear un ApiResponse genérico', () => {
      const response: ApiResponse<string> = {
        success: true,
        data: 'Operación exitosa',
        message: 'Todo OK',
      };

      expect(response.success).toBe(true);
      expect(response.data).toBe('Operación exitosa');
    });
  });

  describe('Tipos de datos para operaciones', () => {
    it('debe permitir crear DatosBoleta', () => {
      const datos: DatosBoleta = {
        receptor: {
          tipoDocumento: TipoDocumentoIdentidad.DNI,
          numeroDocumento: '12345678',
          nombre: 'Cliente Test',
        },
        items: [
          {
            codigo: 'PROD001',
            descripcion: 'Producto',
            cantidad: 1,
            unidadMedida: 'NIU',
            precioUnitario: 100,
            afectacionIGV: AfectacionIGV.GRAVADO_OPERACION_ONEROSA,
            igv: 18,
            total: 118,
          },
        ],
        moneda: TipoMoneda.PEN,
      };

      expect(datos.receptor.numeroDocumento).toBe('12345678');
      expect(datos.items).toHaveLength(1);
    });

    it('debe permitir crear DatosFactura', () => {
      const datos: DatosFactura = {
        receptor: {
          ruc: '20987654321',
          razonSocial: 'Cliente Empresa SAC',
        },
        items: [],
        moneda: TipoMoneda.USD,
      };

      expect(datos.receptor.ruc).toBe('20987654321');
      expect(datos.moneda).toBe(TipoMoneda.USD);
    });
  });
});

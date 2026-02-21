/**
 * Generador de PDF para comprobantes electrónicos
 * Genera la representación impresa del comprobante con código QR
 */

import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import { Comprobante, CDR } from '../types';

/**
 * Interfaz del generador de PDF
 */
export interface IPDFGenerator {
  generarPDF(comprobante: Comprobante, cdr?: CDR): Promise<Buffer>;
  generarCodigoQR(comprobante: Comprobante): Promise<string>;
}

/**
 * Implementación del generador de PDF
 */
export class PDFGenerator implements IPDFGenerator {
  /**
   * Genera un PDF con la representación impresa del comprobante
   * @param comprobante - Comprobante a generar
   * @param cdr - CDR opcional (si el comprobante fue aceptado)
   * @returns Buffer con el PDF generado
   */
  async generarPDF(comprobante: Comprobante, cdr?: CDR): Promise<Buffer> {
    return new Promise(async (resolve, reject) => {
      try {
        const doc = new PDFDocument({ size: 'A4', margin: 50 });
        const chunks: Buffer[] = [];

        // Capturar el PDF en memoria
        doc.on('data', (chunk) => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        // Generar código QR
        const qrDataURL = await this.generarCodigoQR(comprobante);

        // Encabezado - Datos del emisor
        this.agregarEncabezado(doc, comprobante);

        // Código QR (lado derecho del encabezado)
        doc.image(qrDataURL, 450, 50, { width: 100 });

        // Información del comprobante
        doc.moveDown(2);
        this.agregarInfoComprobante(doc, comprobante);

        // Datos del receptor
        doc.moveDown(1);
        this.agregarDatosReceptor(doc, comprobante);

        // Tabla de items
        doc.moveDown(1);
        this.agregarTablaItems(doc, comprobante);

        // Totales
        doc.moveDown(1);
        this.agregarTotales(doc, comprobante);

        // Información del CDR si existe
        if (cdr) {
          doc.moveDown(1);
          this.agregarInfoCDR(doc, cdr);
        }

        // Pie de página
        this.agregarPiePagina(doc, comprobante);

        // Finalizar el documento
        doc.end();
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Genera un código QR con la información del comprobante
   * Formato según estándares de SUNAT
   * @param comprobante - Comprobante para generar el QR
   * @returns Data URL del código QR
   */
  async generarCodigoQR(comprobante: Comprobante): Promise<string> {
    // Formato del QR según SUNAT:
    // RUC_EMISOR|TIPO_COMPROBANTE|SERIE|NUMERO|IGV|TOTAL|FECHA|TIPO_DOC_RECEPTOR|NUM_DOC_RECEPTOR|
    const [serie, numero] = comprobante.numero.split('-');
    const fecha = comprobante.fecha.toISOString().split('T')[0];

    const qrData = [
      comprobante.emisor.ruc,
      comprobante.tipo,
      serie,
      numero,
      comprobante.igv.toFixed(2),
      comprobante.total.toFixed(2),
      fecha,
      comprobante.receptor.tipoDocumento,
      comprobante.receptor.numeroDocumento,
    ].join('|');

    // Generar QR como data URL
    return await QRCode.toDataURL(qrData, {
      errorCorrectionLevel: 'M',
      type: 'image/png',
      width: 200,
    });
  }

  /**
   * Agrega el encabezado con datos del emisor
   */
  private agregarEncabezado(doc: PDFKit.PDFDocument, comprobante: Comprobante): void {
    doc.fontSize(16).font('Helvetica-Bold').text(comprobante.emisor.razonSocial, { align: 'left' });

    doc.fontSize(12).font('Helvetica').text(comprobante.emisor.nombreComercial);

    doc.fontSize(10).text(`RUC: ${comprobante.emisor.ruc}`);

    const direccion = comprobante.emisor.direccion;
    doc.text(`${direccion.direccion}, ${direccion.distrito}, ${direccion.provincia}, ${direccion.departamento}`);
  }

  /**
   * Agrega información del comprobante (tipo, número, fecha)
   */
  private agregarInfoComprobante(doc: PDFKit.PDFDocument, comprobante: Comprobante): void {
    const tipoNombre = comprobante.tipo === '01' ? 'FACTURA ELECTRÓNICA' : 'BOLETA DE VENTA ELECTRÓNICA';

    doc
      .fontSize(14)
      .font('Helvetica-Bold')
      .text(tipoNombre, { align: 'center' })
      .fontSize(12)
      .text(`N° ${comprobante.numero}`, { align: 'center' });

    doc.fontSize(10).font('Helvetica').text(`Fecha de Emisión: ${this.formatearFecha(comprobante.fecha)}`, {
      align: 'center',
    });

    doc.text(`Moneda: ${comprobante.moneda}`, { align: 'center' });
  }

  /**
   * Agrega datos del receptor
   */
  private agregarDatosReceptor(doc: PDFKit.PDFDocument, comprobante: Comprobante): void {
    doc.fontSize(11).font('Helvetica-Bold').text('DATOS DEL CLIENTE');

    doc
      .fontSize(10)
      .font('Helvetica')
      .text(`${comprobante.receptor.tipoDocumento}: ${comprobante.receptor.numeroDocumento}`);

    doc.text(`Nombre/Razón Social: ${comprobante.receptor.nombre}`);

    if (comprobante.receptor.direccion) {
      const dir = comprobante.receptor.direccion;
      doc.text(`Dirección: ${dir.direccion}, ${dir.distrito}, ${dir.provincia}, ${dir.departamento}`);
    }
  }

  /**
   * Agrega tabla de items
   */
  private agregarTablaItems(doc: PDFKit.PDFDocument, comprobante: Comprobante): void {
    doc.fontSize(11).font('Helvetica-Bold').text('DETALLE');

    const tableTop = doc.y + 10;
    const colWidths = {
      cantidad: 60,
      descripcion: 200,
      precio: 80,
      total: 80,
    };

    // Encabezados de tabla
    doc.fontSize(9).font('Helvetica-Bold');
    let x = 50;
    doc.text('CANT.', x, tableTop);
    x += colWidths.cantidad;
    doc.text('DESCRIPCIÓN', x, tableTop);
    x += colWidths.descripcion;
    doc.text('P. UNIT.', x, tableTop);
    x += colWidths.precio;
    doc.text('TOTAL', x, tableTop);

    // Línea separadora
    doc
      .moveTo(50, tableTop + 15)
      .lineTo(550, tableTop + 15)
      .stroke();

    // Items
    let y = tableTop + 20;
    doc.fontSize(9).font('Helvetica');

    comprobante.items.forEach((item) => {
      x = 50;
      doc.text(item.cantidad.toString(), x, y);
      x += colWidths.cantidad;
      doc.text(item.descripcion, x, y, { width: colWidths.descripcion - 10 });
      x += colWidths.descripcion;
      doc.text(this.formatearMonto(item.precioUnitario), x, y);
      x += colWidths.precio;
      doc.text(this.formatearMonto(item.total), x, y);

      y += 20;
    });

    // Línea final
    doc
      .moveTo(50, y)
      .lineTo(550, y)
      .stroke();

    doc.y = y + 10;
  }

  /**
   * Agrega totales (subtotal, IGV, total)
   */
  private agregarTotales(doc: PDFKit.PDFDocument, comprobante: Comprobante): void {
    const x = 400;
    let y = doc.y;

    doc.fontSize(10).font('Helvetica');

    doc.text('Subtotal:', x, y);
    doc.text(this.formatearMonto(comprobante.subtotal), x + 100, y, { align: 'right' });
    y += 15;

    doc.text('IGV (18%):', x, y);
    doc.text(this.formatearMonto(comprobante.igv), x + 100, y, { align: 'right' });
    y += 15;

    doc.fontSize(12).font('Helvetica-Bold');
    doc.text('TOTAL:', x, y);
    doc.text(`${comprobante.moneda} ${this.formatearMonto(comprobante.total)}`, x + 100, y, { align: 'right' });

    doc.y = y + 20;
  }

  /**
   * Agrega información del CDR
   */
  private agregarInfoCDR(doc: PDFKit.PDFDocument, cdr: CDR): void {
    doc.fontSize(10).font('Helvetica-Bold').text('INFORMACIÓN DE ACEPTACIÓN SUNAT');

    doc.fontSize(9).font('Helvetica').text(`Código: ${cdr.codigo}`);

    doc.text(`Mensaje: ${cdr.mensaje}`);

    doc.text(`Fecha de Recepción: ${this.formatearFecha(cdr.fechaRecepcion)}`);
  }

  /**
   * Agrega pie de página
   */
  private agregarPiePagina(doc: PDFKit.PDFDocument, comprobante: Comprobante): void {
    const pageHeight = doc.page.height;
    const y = pageHeight - 100;

    doc
      .fontSize(8)
      .font('Helvetica')
      .text('Representación impresa del comprobante electrónico', 50, y, { align: 'center' });

    doc.text('Consulte su comprobante en www.sunat.gob.pe', { align: 'center' });

    doc.text(`Generado: ${this.formatearFecha(new Date())}`, { align: 'center' });
  }

  /**
   * Formatea una fecha a string legible
   */
  private formatearFecha(fecha: Date): string {
    return fecha.toLocaleDateString('es-PE', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  /**
   * Formatea un monto con 2 decimales
   */
  private formatearMonto(monto: number): string {
    return monto.toFixed(2);
  }
}

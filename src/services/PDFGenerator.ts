/**
 * Generador de PDF para comprobantes electrónicos
 * Genera la representación impresa del comprobante con código QR
 */

import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import { Comprobante, CDR, Empresa } from '../types';

/**
 * Interfaz del generador de PDF
 */
export interface IPDFGenerator {
  generarPDF(comprobante: Comprobante, empresa: Empresa, logoBuffer?: Buffer, cdr?: CDR): Promise<Buffer>;
  generarCodigoQR(comprobante: Comprobante): Promise<string>;
}

/**
 * Implementación del generador de PDF
 */
export class PDFGenerator implements IPDFGenerator {
  /**
   * Genera un PDF con la representación impresa del comprobante
   */
  async generarPDF(comprobante: Comprobante, empresa: Empresa, logoBuffer?: Buffer, cdr?: CDR): Promise<Buffer> {
    return new Promise(async (resolve, reject) => {
      try {
        // Create PDF without specifying fonts - let PDFKit use built-in fonts
        const doc = new PDFDocument({ 
          size: 'A4', 
          margin: 40,
          bufferPages: true
        });
        
        const chunks: Buffer[] = [];

        doc.on('data', (chunk) => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        // Generar código QR
        const qrDataURL = await this.generarCodigoQR(comprobante);

        // Encabezado con logo y datos de la empresa
        await this.agregarEncabezado(doc, empresa, logoBuffer);

        // Cuadro de tipo de comprobante (derecha superior)
        this.agregarCuadroComprobante(doc, comprobante);

        // Datos del cliente
        doc.moveDown(2);
        this.agregarDatosCliente(doc, comprobante);

        // Tabla de items
        doc.moveDown(1);
        this.agregarTablaItems(doc, comprobante);

        // Totales y observaciones
        this.agregarTotalesYObservaciones(doc, comprobante);

        // Código QR
        doc.image(qrDataURL, 450, doc.page.height - 200, { width: 120 });

        // Pie de página
        this.agregarPiePagina(doc, comprobante, cdr);

        doc.end();
      } catch (error) {
        console.error('Error en generarPDF:', error);
        reject(error);
      }
    });
  }

  /**
   * Genera un código QR con la información del comprobante
   */
  async generarCodigoQR(comprobante: Comprobante): Promise<string> {
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

    return await QRCode.toDataURL(qrData, {
      errorCorrectionLevel: 'M',
      type: 'image/png',
      width: 200,
    });
  }

  /**
   * Agrega el encabezado con logo y datos del emisor
   */
  private async agregarEncabezado(doc: PDFKit.PDFDocument, empresa: Empresa, logoBuffer?: Buffer): Promise<void> {
    const startY = 50;
    
    // Logo (si existe)
    if (logoBuffer) {
      try {
        doc.image(logoBuffer, 50, startY, { width: 120, height: 60, fit: [120, 60] });
      } catch (error) {
        console.log('Error al agregar logo:', error);
      }
    }

    // Cuadro con datos de la empresa
    const boxX = 50;
    const boxY = startY + 70;
    const boxWidth = 280;
    const boxHeight = 90;

    doc.rect(boxX, boxY, boxWidth, boxHeight).stroke();

    doc.text(empresa.razonSocial.toUpperCase(), boxX + 10, boxY + 10, { width: boxWidth - 20 });

    doc.text(`Dirección: ${empresa.direccion.direccion}`, boxX + 10, boxY + 30, { width: boxWidth - 20 })
      .text(`${empresa.direccion.distrito} - ${empresa.direccion.provincia} - ${empresa.direccion.departamento}`, boxX + 10, boxY + 45, { width: boxWidth - 20 });
  }

  /**
   * Agrega el cuadro de tipo de comprobante (derecha superior)
   */
  private agregarCuadroComprobante(doc: PDFKit.PDFDocument, comprobante: Comprobante): void {
    const boxX = 360;
    const boxY = 50;
    const boxWidth = 190;
    const boxHeight = 110;

    // Cuadro principal
    doc.rect(boxX, boxY, boxWidth, boxHeight).stroke();

    // Título
    const tipoNombre = comprobante.tipo === '01' ? 'FACTURA' : 'BOLETA DE VENTA';
    doc.text(tipoNombre, boxX, boxY + 10, { width: boxWidth, align: 'center' });
    
    doc.text('ELECTRÓNICA', boxX, boxY + 28, { width: boxWidth, align: 'center' });

    // RUC
    doc.text(`R.U.C: ${comprobante.emisor.ruc}`, boxX, boxY + 50, { width: boxWidth, align: 'center' });

    // Número de comprobante
    doc.text(comprobante.numero, boxX, boxY + 75, { width: boxWidth, align: 'center' });
  }

  /**
   * Agrega datos del cliente
   */
  private agregarDatosCliente(doc: PDFKit.PDFDocument, comprobante: Comprobante): void {
    const startY = doc.y + 10;
    const boxX = 50;
    const boxWidth = 500;

    // Primera línea: Razón Social y RUC
    doc.text(`Razón Social: ${comprobante.receptor.nombre}`, boxX, startY);
    doc.text(`RUC: ${comprobante.receptor.numeroDocumento}`, boxX + 300, startY);

    // Segunda línea: Fecha Emisión y Dirección
    doc.text(`Fecha Emisión: ${this.formatearFecha(comprobante.fecha)}`, boxX, startY + 15);
    if (comprobante.receptor.direccion) {
      doc.text(`Dirección: ${comprobante.receptor.direccion.direccion}`, boxX + 300, startY + 15);
    }

    // Tercera línea: Tipo Moneda
    doc.text(`Tipo Moneda: ${comprobante.moneda}`, boxX, startY + 30);

    doc.moveDown(2);
  }

  /**
   * Agrega tabla de items
   */
  private agregarTablaItems(doc: PDFKit.PDFDocument, comprobante: Comprobante): void {
    const tableTop = doc.y + 10;
    const colWidths = {
      cantidad: 70,
      codigo: 70,
      descripcion: 200,
      valorUnitario: 80,
      valorTotal: 80,
    };

    // Encabezados de tabla
    let x = 50;
    const headerY = tableTop;

    doc.rect(x, headerY, colWidths.cantidad, 20).stroke();
    doc.text('Cantidad', x + 5, headerY + 5, { width: colWidths.cantidad - 10 });
    x += colWidths.cantidad;

    doc.rect(x, headerY, colWidths.codigo, 20).stroke();
    doc.text('Código', x + 5, headerY + 5, { width: colWidths.codigo - 10 });
    x += colWidths.codigo;

    doc.rect(x, headerY, colWidths.descripcion, 20).stroke();
    doc.text('Descripción', x + 5, headerY + 5, { width: colWidths.descripcion - 10 });
    x += colWidths.descripcion;

    doc.rect(x, headerY, colWidths.valorUnitario, 20).stroke();
    doc.text('Valor Unitario', x + 5, headerY + 5, { width: colWidths.valorUnitario - 10 });
    x += colWidths.valorUnitario;

    doc.rect(x, headerY, colWidths.valorTotal, 20).stroke();
    doc.text('Valor Total', x + 5, headerY + 5, { width: colWidths.valorTotal - 10 });

    // Items
    let y = headerY + 20;

    comprobante.items.forEach((item) => {
      const rowHeight = 20;
      x = 50;

      doc.rect(x, y, colWidths.cantidad, rowHeight).stroke();
      doc.text(`${item.cantidad} ${item.unidadMedida}`, x + 5, y + 5, { width: colWidths.cantidad - 10 });
      x += colWidths.cantidad;

      doc.rect(x, y, colWidths.codigo, rowHeight).stroke();
      doc.text(item.codigo || '', x + 5, y + 5, { width: colWidths.codigo - 10 });
      x += colWidths.codigo;

      doc.rect(x, y, colWidths.descripcion, rowHeight).stroke();
      doc.text(item.descripcion, x + 5, y + 5, { width: colWidths.descripcion - 10 });
      x += colWidths.descripcion;

      doc.rect(x, y, colWidths.valorUnitario, rowHeight).stroke();
      doc.text(`S/ ${this.formatearMonto(item.precioUnitario)}`, x + 5, y + 5, { width: colWidths.valorUnitario - 10, align: 'right' });
      x += colWidths.valorUnitario;

      doc.rect(x, y, colWidths.valorTotal, rowHeight).stroke();
      doc.text(`S/ ${this.formatearMonto(item.total)}`, x + 5, y + 5, { width: colWidths.valorTotal - 10, align: 'right' });

      y += rowHeight;
    });

    doc.y = y + 10;
  }

  /**
   * Agrega totales y observaciones
   */
  private agregarTotalesYObservaciones(doc: PDFKit.PDFDocument, comprobante: Comprobante): void {
    const startY = doc.y;
    const leftX = 50;
    const rightX = 370;

    // Lado izquierdo: Observaciones
    doc.text('CIENTO DIECIOCHO CON 00/100', leftX, startY);

    doc.text('Información Adicional', leftX, startY + 20);

    doc.text('LEYENDA:', leftX, startY + 40);
    doc.text('CONDICION DE PAGO: Efectivo', leftX, startY + 60);
    doc.text('VENDEDOR: GITHUB SELLER', leftX, startY + 80);

    // Lado derecho: Totales
    let y = startY;

    doc.text('Op. Gravadas:', rightX, y);
    doc.text(`S/ ${this.formatearMonto(comprobante.subtotal)}`, rightX + 100, y, { align: 'right' });
    y += 20;

    doc.text('I.G.V.:', rightX, y);
    doc.text(`S/ ${this.formatearMonto(comprobante.igv)}`, rightX + 100, y, { align: 'right' });
    y += 20;

    doc.text('Precio Venta:', rightX, y);
    doc.text(`S/ ${this.formatearMonto(comprobante.total)}`, rightX + 100, y, { align: 'right' });
  }

  /**
   * Agrega pie de página
   */
  private agregarPiePagina(doc: PDFKit.PDFDocument, comprobante: Comprobante, cdr?: CDR): void {
    const pageHeight = doc.page.height;
    const y = pageHeight - 120;

    if (cdr) {
      doc.text(`Nro Resolución: ${cdr.codigo}`, 50, y);
    }

    doc.text('Representación impresa de la FACTURA ELECTRÓNICA.', 50, y + 20, { align: 'center', width: 350 });
  }

  /**
   * Formatea una fecha a string legible
   */
  private formatearFecha(fecha: Date): string {
    return fecha.toLocaleDateString('es-PE', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
  }

  /**
   * Formatea un monto con 2 decimales
   */
  private formatearMonto(monto: number): string {
    return monto.toFixed(2);
  }
}

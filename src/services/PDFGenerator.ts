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
  // Colores del tema
  private readonly colors = {
    primary: '#2563eb',      // Azul
    secondary: '#64748b',    // Gris
    success: '#10b981',      // Verde
    text: '#1e293b',         // Texto oscuro
    textLight: '#64748b',    // Texto claro
    border: '#e2e8f0',       // Borde claro
    background: '#f8fafc',   // Fondo claro
  };

  /**
   * Genera un PDF con la representación impresa del comprobante
   */
  async generarPDF(comprobante: Comprobante, empresa: Empresa, logoBuffer?: Buffer, cdr?: CDR): Promise<Buffer> {
    return new Promise(async (resolve, reject) => {
      try {
        const doc = new PDFDocument({ 
          size: 'A4', 
          margin: 50,
          bufferPages: true
        });
        const chunks: Buffer[] = [];

        doc.on('data', (chunk) => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        // Encabezado con logo y datos de la empresa
        await this.agregarEncabezado(doc, empresa, comprobante, logoBuffer);

        // Línea separadora
        doc.moveTo(50, 180).lineTo(545, 180).stroke(this.colors.border);

        // Datos del cliente
        doc.moveDown(0.5);
        this.agregarDatosCliente(doc, comprobante);

        // Línea separadora
        doc.moveTo(50, doc.y + 10).lineTo(545, doc.y + 10).stroke(this.colors.border);

        // Tabla de items
        doc.moveDown(1);
        this.agregarTablaItems(doc, comprobante);

        // Totales
        this.agregarTotales(doc, comprobante);

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
      margin: 1,
    });
  }

  /**
   * Agrega el encabezado con logo y datos del emisor
   */
  private async agregarEncabezado(doc: PDFKit.PDFDocument, empresa: Empresa, comprobante: Comprobante, logoBuffer?: Buffer): Promise<void> {
    const startY = 50;
    
    // Logo (si existe)
    if (logoBuffer) {
      try {
        doc.image(logoBuffer, 50, startY, { width: 100, height: 50, fit: [100, 50] });
      } catch (error) {
        console.log('Error al agregar logo:', error);
      }
    }

    // Datos de la empresa (lado izquierdo)
    const empresaX = logoBuffer ? 160 : 50;
    doc.fontSize(14)
      .fillColor(this.colors.text)
      .font('Helvetica-Bold')
      .text(empresa.razonSocial.toUpperCase(), empresaX, startY, { width: 250 });

    doc.fontSize(9)
      .fillColor(this.colors.textLight)
      .font('Helvetica')
      .text(`RUC: ${empresa.ruc}`, empresaX, startY + 20)
      .text(empresa.direccion.direccion, empresaX, startY + 35, { width: 250 })
      .text(`${empresa.direccion.distrito} - ${empresa.direccion.provincia} - ${empresa.direccion.departamento}`, empresaX, startY + 50, { width: 250 });

    // Cuadro de tipo de comprobante (derecha superior)
    const boxX = 420;
    const boxY = startY;
    const boxWidth = 125;
    const boxHeight = 110;

    // Fondo del cuadro
    doc.rect(boxX, boxY, boxWidth, boxHeight)
      .fillAndStroke(this.colors.background, this.colors.border);

    // Título del comprobante
    const tipoNombre = comprobante.tipo === '01' ? 'FACTURA' : 'BOLETA DE VENTA';
    doc.fontSize(13)
      .fillColor(this.colors.primary)
      .font('Helvetica-Bold')
      .text(tipoNombre, boxX, boxY + 15, { width: boxWidth, align: 'center' });
    
    doc.fontSize(10)
      .fillColor(this.colors.text)
      .font('Helvetica')
      .text('ELECTRÓNICA', boxX, boxY + 32, { width: boxWidth, align: 'center' });

    // RUC
    doc.fontSize(9)
      .fillColor(this.colors.textLight)
      .text(`RUC: ${comprobante.emisor.ruc}`, boxX, boxY + 52, { width: boxWidth, align: 'center' });

    // Número de comprobante
    doc.fontSize(16)
      .fillColor(this.colors.primary)
      .font('Helvetica-Bold')
      .text(comprobante.numero, boxX, boxY + 75, { width: boxWidth, align: 'center' });
  }

  /**
   * Agrega datos del cliente
   */
  private agregarDatosCliente(doc: PDFKit.PDFDocument, comprobante: Comprobante): void {
    const startY = doc.y + 15;
    const labelWidth = 120;
    const valueX = 50 + labelWidth;

    doc.fontSize(10)
      .fillColor(this.colors.text)
      .font('Helvetica-Bold')
      .text('DATOS DEL CLIENTE', 50, startY);

    doc.fontSize(8)
      .fillColor(this.colors.textLight)
      .font('Helvetica')
      .text('Cliente:', 50, startY + 18, { width: labelWidth })
      .fillColor(this.colors.text)
      .text(comprobante.receptor.nombre, valueX, startY + 18, { width: 350 });

    doc.fillColor(this.colors.textLight)
      .text(`${comprobante.receptor.tipoDocumento === '6' ? 'RUC' : 'DNI'}:`, 50, startY + 32, { width: labelWidth })
      .fillColor(this.colors.text)
      .text(comprobante.receptor.numeroDocumento, valueX, startY + 32);

    if (comprobante.receptor.direccion) {
      doc.fillColor(this.colors.textLight)
        .text('Dirección:', 50, startY + 46, { width: labelWidth })
        .fillColor(this.colors.text)
        .text(comprobante.receptor.direccion.direccion, valueX, startY + 46, { width: 350 });
    }

    doc.fillColor(this.colors.textLight)
      .text('Fecha Emisión:', 50, startY + 60, { width: labelWidth })
      .fillColor(this.colors.text)
      .text(this.formatearFecha(comprobante.fecha), valueX, startY + 60);

    doc.fillColor(this.colors.textLight)
      .text('Moneda:', 50, startY + 74, { width: labelWidth })
      .fillColor(this.colors.text)
      .text(comprobante.moneda === 'PEN' ? 'Soles (PEN)' : comprobante.moneda, valueX, startY + 74);

    doc.y = startY + 88;
  }

  /**
   * Agrega tabla de items
   */
  private agregarTablaItems(doc: PDFKit.PDFDocument, comprobante: Comprobante): void {
    const tableTop = doc.y + 15;
    const colWidths = {
      cantidad: 60,
      codigo: 80,
      descripcion: 220,
      precioUnit: 80,
      total: 80,
    };

    // Encabezado de tabla con fondo
    let x = 50;
    const headerY = tableTop;
    const headerHeight = 22;

    doc.rect(x, headerY, 520, headerHeight)
      .fillAndStroke(this.colors.primary, this.colors.primary);

    doc.fontSize(8)
      .fillColor('#ffffff')
      .font('Helvetica-Bold');

    // Headers
    doc.text('CANT.', x + 5, headerY + 7, { width: colWidths.cantidad - 10 });
    x += colWidths.cantidad;

    doc.text('CÓDIGO', x + 5, headerY + 7, { width: colWidths.codigo - 10 });
    x += colWidths.codigo;

    doc.text('DESCRIPCIÓN', x + 5, headerY + 7, { width: colWidths.descripcion - 10 });
    x += colWidths.descripcion;

    doc.text('P. UNIT.', x + 5, headerY + 7, { width: colWidths.precioUnit - 10, align: 'right' });
    x += colWidths.precioUnit;

    doc.text('TOTAL', x + 5, headerY + 7, { width: colWidths.total - 10, align: 'right' });

    // Items
    let y = headerY + headerHeight;
    doc.fontSize(8)
      .fillColor(this.colors.text)
      .font('Helvetica');

    comprobante.items.forEach((item, index) => {
      const rowHeight = 25;
      x = 50;

      // Fondo alternado
      if (index % 2 === 0) {
        doc.rect(x, y, 520, rowHeight).fill(this.colors.background);
      }

      doc.fillColor(this.colors.text);

      doc.text(`${item.cantidad}`, x + 5, y + 8, { width: colWidths.cantidad - 10 });
      x += colWidths.cantidad;

      doc.text(item.codigo || '-', x + 5, y + 8, { width: colWidths.codigo - 10 });
      x += colWidths.codigo;

      doc.text(item.descripcion, x + 5, y + 8, { width: colWidths.descripcion - 10 });
      x += colWidths.descripcion;

      doc.text(`S/ ${this.formatearMonto(item.precioUnitario)}`, x + 5, y + 8, { width: colWidths.precioUnit - 10, align: 'right' });
      x += colWidths.precioUnit;

      doc.text(`S/ ${this.formatearMonto(item.total)}`, x + 5, y + 8, { width: colWidths.total - 10, align: 'right' });

      y += rowHeight;
    });

    // Borde de la tabla
    doc.rect(50, tableTop, 520, y - tableTop).stroke(this.colors.border);

    doc.y = y + 5;
  }

  /**
   * Agrega totales alineados a la derecha con la columna TOTAL
   */
  private agregarTotales(doc: PDFKit.PDFDocument, comprobante: Comprobante): void {
    const startY = doc.y + 15;
    
    // Alineación con la columna TOTAL de los items
    // La tabla termina en x=570 (50 + 520)
    // Las últimas dos columnas son: precioUnit (80px) + total (80px)
    const labelX = 370; // Inicio de las dos últimas columnas
    const valueX = 490; // Columna TOTAL (alineada con los totales de items)
    const boxWidth = 200;
    const boxHeight = 90;

    // Cuadro de totales
    doc.rect(labelX, startY, boxWidth, boxHeight)
      .fillAndStroke(this.colors.background, this.colors.border);

    doc.fontSize(9)
      .fillColor(this.colors.textLight)
      .font('Helvetica');

    let y = startY + 15;

    // Subtotal
    doc.text('Op. Gravadas:', labelX + 15, y, { width: 100 });
    doc.fillColor(this.colors.text)
      .font('Helvetica-Bold')
      .text(`S/ ${this.formatearMonto(comprobante.subtotal)}`, valueX, y, { width: 70, align: 'right' });
    y += 22;

    // IGV
    doc.fillColor(this.colors.textLight)
      .font('Helvetica')
      .text('I.G.V. (18%):', labelX + 15, y, { width: 100 });
    doc.fillColor(this.colors.text)
      .font('Helvetica-Bold')
      .text(`S/ ${this.formatearMonto(comprobante.igv)}`, valueX, y, { width: 70, align: 'right' });
    y += 28;

    // Total
    doc.fontSize(12)
      .fillColor(this.colors.primary)
      .font('Helvetica-Bold')
      .text('TOTAL:', labelX + 15, y, { width: 100 });
    doc.text(`S/ ${this.formatearMonto(comprobante.total)}`, valueX, y, { width: 70, align: 'right' });
    
    doc.y = startY + boxHeight + 15;
  }

  /**
   * Agrega pie de página
   */
  private agregarPiePagina(doc: PDFKit.PDFDocument, comprobante: Comprobante, cdr?: CDR): void {
    const y = doc.y + 20;

    // Línea separadora
    doc.moveTo(50, y).lineTo(545, y).stroke(this.colors.border);

    doc.fontSize(8)
      .fillColor(this.colors.textLight)
      .font('Helvetica')
      .text('Representación impresa del comprobante electrónico.', 50, y + 15, { align: 'center', width: 300 });

    if (cdr) {
      doc.fontSize(7)
        .text(`Código SUNAT: ${cdr.codigo} - ${cdr.mensaje}`, 50, y + 30, { align: 'center', width: 300 });
    }

    doc.fontSize(7)
      .text(`Generado: ${new Date().toLocaleString('es-PE')}`, 50, y + 45, { align: 'center', width: 300 });
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

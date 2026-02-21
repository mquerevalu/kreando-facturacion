import * as fs from 'fs';
import * as path from 'path';

/**
 * Catálogos oficiales de SUNAT
 * 
 * Estos catálogos contienen los códigos válidos según la normativa de SUNAT.
 * Se cargan desde un archivo JSON externo para permitir actualizaciones sin cambios en el código fuente.
 */

/**
 * Carga los catálogos desde el archivo JSON
 */
function cargarCatalogos(): Record<string, Record<string, string>> {
  try {
    const catalogosPath = path.join(__dirname, 'catalogos.json');
    const catalogosData = fs.readFileSync(catalogosPath, 'utf-8');
    return JSON.parse(catalogosData);
  } catch (error) {
    console.error('Error al cargar catálogos:', error);
    // Retornar catálogos vacíos en caso de error
    return {};
  }
}

/**
 * Mapa de catálogos por código
 * Se carga dinámicamente desde catalogos.json
 */
export const catalogos: Record<string, Record<string, string>> = cargarCatalogos();

/**
 * Catálogo 01: Tipos de Documentos
 */
export const catalogo01 = catalogos['01'] || {};

/**
 * Catálogo 05: Tipos de Tributos
 */
export const catalogo05 = catalogos['05'] || {};

/**
 * Catálogo 06: Tipos de Documentos de Identidad
 */
export const catalogo06 = catalogos['06'] || {};

/**
 * Catálogo 07: Códigos de Afectación del IGV
 */
export const catalogo07 = catalogos['07'] || {};

/**
 * Recarga los catálogos desde el archivo JSON
 * Útil para actualizar los catálogos sin reiniciar la aplicación
 */
export function recargarCatalogos(): void {
  const nuevosCatalogos = cargarCatalogos();
  Object.keys(nuevosCatalogos).forEach((key) => {
    catalogos[key] = nuevosCatalogos[key];
  });
}

/**
 * Obtiene la descripción de un código en un catálogo
 * @param catalogo - Código del catálogo
 * @param codigo - Código a buscar
 * @returns Descripción del código o undefined si no existe
 */
export function obtenerDescripcionCatalogo(
  catalogo: string,
  codigo: string
): string | undefined {
  return catalogos[catalogo]?.[codigo];
}

/**
 * Verifica si un código existe en un catálogo
 * @param catalogo - Código del catálogo
 * @param codigo - Código a verificar
 * @returns true si el código existe
 */
export function existeEnCatalogo(catalogo: string, codigo: string): boolean {
  return catalogos[catalogo]?.[codigo] !== undefined;
}

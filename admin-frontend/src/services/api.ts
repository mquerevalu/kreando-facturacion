import axios, { AxiosInstance } from 'axios';
import { fetchAuthSession } from 'aws-amplify/auth';
import { API_KEY } from '../aws-config';

const API_BASE_URL = 'https://4tum0sqo0h.execute-api.us-east-2.amazonaws.com/dev';

class ApiService {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: API_BASE_URL,
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': API_KEY,
      },
    });

    this.client.interceptors.request.use(async (config) => {
      try {
        const session = await fetchAuthSession();
        if (session.tokens?.idToken) {
          config.headers.Authorization = `Bearer ${session.tokens.idToken}`;
        }
      } catch (error) {
        console.log('No auth session available');
      }
      return config;
    });
  }

  async getEmpresas() {
    const response = await this.client.get('/empresas');
    return response.data.data || response.data;
  }

  async getEmpresa(ruc: string) {
    const response = await this.client.get(`/empresas/${ruc}`);
    return response.data.data || response.data;
  }

  async createEmpresa(data: any) {
    const response = await this.client.post('/empresas', data);
    return response.data.data || response.data;
  }

  async updateEmpresa(ruc: string, data: any) {
    const response = await this.client.put(`/empresas/${ruc}`, data);
    return response.data.data || response.data;
  }

  async getLogoPresignedUrl(ruc: string) {
    const response = await this.client.get(`/empresas/${ruc}/logo`);
    return response.data.data || response.data;
  }

  async uploadLogo(ruc: string, file: File) {
    const reader = new FileReader();
    return new Promise((resolve, reject) => {
      reader.onload = async () => {
        try {
          const base64 = reader.result?.toString(); // Send full data URL with prefix
          const response = await this.client.post(`/empresas/${ruc}/logo`, {
            logoBase64: base64,
          });
          resolve(response.data.data || response.data);
        } catch (error) {
          reject(error);
        }
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  async updateCredencialesSOL(ruc: string, usuario: string, password: string) {
    const response = await this.client.put(`/empresas/${ruc}/credenciales-sol`, {
      usuario,
      password,
    });
    return response.data.data || response.data;
  }

  async uploadCertificado(ruc: string, file: File, password: string) {
    const reader = new FileReader();
    return new Promise((resolve, reject) => {
      reader.onload = async () => {
        try {
          const base64 = reader.result?.toString().split(',')[1];
          const response = await this.client.post('/certificados', {
            ruc,
            certificadoBase64: base64,
            password,
          });
          resolve(response.data.data || response.data);
        } catch (error) {
          reject(error);
        }
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  async getCertificado(ruc: string) {
    const response = await this.client.get(`/certificados/${ruc}`);
    return response.data.data || response.data;
  }

  // Series
  async getSeries(empresaRuc: string) {
    const response = await this.client.get(`/series/${empresaRuc}`);
    return response.data.data || response.data;
  }

  async createSerie(data: any) {
    const response = await this.client.post('/series', data);
    return response.data.data || response.data;
  }

  async updateSerie(empresaRuc: string, tipoComprobante: string, serie: string, data: any) {
    const response = await this.client.put(`/series/${empresaRuc}/${tipoComprobante}/${serie}`, data);
    return response.data.data || response.data;
  }

  async deleteSerie(empresaRuc: string, tipoComprobante: string, serie: string) {
    const response = await this.client.delete(`/series/${empresaRuc}/${tipoComprobante}/${serie}`);
    return response.data || response.data;
  }

  // Comprobantes
  async generarComprobante(data: any) {
    const response = await this.client.post('/comprobantes/generar', data);
    return response.data.data || response.data;
  }

  async listarComprobantes(filtros: {
    empresaRuc: string;
    tipo?: string;
    estado?: string;
    receptor?: string;
    nombre?: string;
    fechaInicio?: Date | null;
    fechaFin?: Date | null;
  }) {
    const params: any = {
      empresaRuc: filtros.empresaRuc,
    };

    if (filtros.tipo) params.tipo = filtros.tipo;
    if (filtros.estado) params.estado = filtros.estado;
    if (filtros.receptor) params.receptor = filtros.receptor;
    if (filtros.nombre) params.nombre = filtros.nombre;
    if (filtros.fechaInicio) params.fechaInicio = filtros.fechaInicio.toISOString();
    if (filtros.fechaFin) params.fechaFin = filtros.fechaFin.toISOString();

    const response = await this.client.get('/comprobantes', { params });
    return response.data.data || response.data;
  }

  async firmarComprobante(numero: string, empresaRuc: string) {
    const response = await this.client.post(`/comprobantes/${numero}/firmar`, {
      empresaRuc,
    });
    return response.data.data || response.data;
  }

  async enviarComprobante(numero: string, empresaRuc: string) {
    const response = await this.client.post(`/comprobantes/${numero}/enviar`, {
      empresaRuc,
      numeroComprobante: numero,
    });
    return response.data.data || response.data;
  }

  async enviarComprobanteSunat(numero: string, empresaRuc: string) {
    return this.enviarComprobante(numero, empresaRuc);
  }

  async getEstadoComprobante(numero: string, empresaRuc: string) {
    const response = await this.client.get(`/comprobantes/${numero}/estado`, {
      params: { empresaRuc },
    });
    return response.data.data || response.data;
  }

  async downloadPDF(numero: string, empresaRuc: string) {
    const response = await this.client.post(`/comprobantes/${numero}/pdf`, {
      empresaRuc,
      numero,
    });
    
    // El backend retorna el PDF como base64, necesitamos decodificarlo
    const base64Data = response.data;
    const binaryString = window.atob(base64Data);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return new Blob([bytes], { type: 'application/pdf' });
  }
}

const apiService = new ApiService();
export default apiService;

import React, { useState } from 'react';
import {
  Box,
  Button,
  Card,
  CardContent,
  TextField,
  Typography,
  Alert,
  Chip,
  IconButton,
  MenuItem,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  CircularProgress,
} from '@mui/material';
import { DataGrid, GridColDef } from '@mui/x-data-grid';
import { 
  Search as SearchIcon, 
  Refresh as RefreshIcon,
  Send as SendIcon,
  PictureAsPdf as PdfIcon,
  Code as XmlIcon,
  Receipt as CdrIcon,
} from '@mui/icons-material';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { es } from 'date-fns/locale';
import apiService from '../services/api';

interface Comprobante {
  numero: string;
  tipo: string;
  empresaRuc: string;
  receptorDocumento: string;
  receptorNombre: string;
  total: number;
  moneda: string;
  estado: string;
}

export default function Comprobantes() {
  const [comprobantes, setComprobantes] = useState<Comprobante[]>([]);
  const [empresas, setEmpresas] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [sendingToSunat, setSendingToSunat] = useState<string | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    numero: string;
    empresaRuc: string;
  }>({ open: false, numero: '', empresaRuc: '' });
  const [filters, setFilters] = useState({
    empresaRuc: '',
    tipo: '',
    numeroDocumento: '',
    nombre: '',
    estado: '',
    fechaInicio: null as Date | null,
    fechaFin: null as Date | null,
  });

  // Cargar empresas al montar el componente
  React.useEffect(() => {
    loadEmpresas();
  }, []);

  const loadEmpresas = async () => {
    try {
      const data = await apiService.getEmpresas();
      setEmpresas(data.empresas || []);
      // Si solo hay una empresa, seleccionarla automáticamente
      if (data.empresas && data.empresas.length === 1) {
        setFilters(prev => ({ ...prev, empresaRuc: data.empresas[0].ruc }));
      }
    } catch (err) {
      console.error('Error al cargar empresas:', err);
    }
  };

  const handleSearch = async () => {
    if (!filters.empresaRuc) {
      setError('El RUC de la empresa es requerido');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const data = await apiService.listarComprobantes({
        empresaRuc: filters.empresaRuc,
        tipo: filters.tipo || undefined,
        estado: filters.estado || undefined,
        receptor: filters.numeroDocumento || undefined,
        nombre: filters.nombre || undefined,
        fechaInicio: filters.fechaInicio,
        fechaFin: filters.fechaFin,
      });

      setComprobantes(data.comprobantes || []);
    } catch (err: any) {
      setError(err.response?.data?.mensaje || 'Error al buscar comprobantes');
      setComprobantes([]);
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadPDF = async (numero: string, empresaRuc: string) => {
    try {
      const blob = await apiService.downloadPDF(numero, empresaRuc);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${numero}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err: any) {
      setError(err.response?.data?.mensaje || 'Error al descargar PDF');
    }
  };

  const handleDownloadXML = async (numero: string, empresaRuc: string) => {
    try {
      setError('');
      const data = await apiService.getEstadoComprobante(numero, empresaRuc);
      
      if (!data.xmlFirmado) {
        setError('El XML firmado no está disponible');
        return;
      }

      // Crear blob con el XML
      const blob = new Blob([data.xmlFirmado], { type: 'application/xml' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${numero}.xml`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      setSuccess('XML descargado exitosamente');
    } catch (err: any) {
      setError(err.response?.data?.mensaje || 'Error al descargar XML');
    }
  };

  const handleDownloadCDR = async (numero: string, empresaRuc: string) => {
    try {
      setError('');
      const data = await apiService.getEstadoComprobante(numero, empresaRuc);
      
      if (!data.cdr || !data.cdr.urlDescarga) {
        setError('El CDR no está disponible. El comprobante debe estar ACEPTADO por SUNAT.');
        return;
      }

      // Descargar desde la URL pre-firmada
      const response = await fetch(data.cdr.urlDescarga);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `R-${numero}.xml`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      setSuccess('CDR descargado exitosamente');
    } catch (err: any) {
      setError(err.response?.data?.mensaje || 'Error al descargar CDR');
    }
  };

  const handleSendToSunat = (numero: string, empresaRuc: string) => {
    setConfirmDialog({ open: true, numero, empresaRuc });
  };

  const confirmSendToSunat = async () => {
    const { numero, empresaRuc } = confirmDialog;
    setConfirmDialog({ open: false, numero: '', empresaRuc: '' });
    setSendingToSunat(numero);
    setError('');
    setSuccess('');

    try {
      await apiService.enviarComprobanteSunat(numero, empresaRuc);
      setSuccess(`Comprobante ${numero} enviado exitosamente a SUNAT`);
      
      // Actualizar el estado del comprobante
      await handleRefreshStatus(numero, empresaRuc);
    } catch (err: any) {
      setError(err.response?.data?.mensaje || err.response?.data?.message || 'Error al enviar a SUNAT');
    } finally {
      setSendingToSunat(null);
    }
  };

  const handleRefreshStatus = async (numero: string, empresaRuc: string) => {
    try {
      const data = await apiService.getEstadoComprobante(numero, empresaRuc);
      // Actualizar el estado en la tabla
      setComprobantes((prev) =>
        prev.map((c) =>
          c.numero === numero ? { ...c, estado: data.estado } : c
        )
      );
    } catch (err: any) {
      setError(err.response?.data?.mensaje || 'Error al consultar estado');
    }
  };

  const columns: GridColDef[] = [
    { field: 'numero', headerName: 'Número', width: 150 },
    {
      field: 'tipo',
      headerName: 'Tipo',
      width: 100,
      renderCell: (params) => (
        <Chip
          label={params.value === '01' ? 'Factura' : 'Boleta'}
          color={params.value === '01' ? 'primary' : 'secondary'}
          size="small"
        />
      ),
    },
    { 
      field: 'fecha', 
      headerName: 'Fecha Emisión', 
      width: 130,
      valueFormatter: (params) => {
        const value = params.value as string;
        if (!value) return '';
        return new Date(value).toLocaleDateString('es-PE');
      },
    },
    { field: 'empresaRuc', headerName: 'RUC Empresa', width: 130 },
    { 
      field: 'receptorDocumento', 
      headerName: 'Doc. Receptor', 
      width: 130,
      valueGetter: (params) => params.row.receptor?.numeroDocumento || '',
    },
    { 
      field: 'receptorNombre', 
      headerName: 'Receptor', 
      width: 180,
      valueGetter: (params) => params.row.receptor?.nombre || params.row.receptor?.razonSocial || '',
    },
    { 
      field: 'total', 
      headerName: 'Total', 
      width: 100,
      valueFormatter: (params) => {
        const value = params.value as number;
        return `${value?.toFixed(2) || '0.00'}`;
      },
    },
    { field: 'moneda', headerName: 'Moneda', width: 80 },
    {
      field: 'estado',
      headerName: 'Estado',
      width: 120,
      renderCell: (params) => {
        const colors: any = {
          PENDIENTE: 'default',
          ENVIADO: 'info',
          ACEPTADO: 'success',
          RECHAZADO: 'error',
        };
        return (
          <Chip
            label={params.value}
            color={colors[params.value] || 'default'}
            size="small"
          />
        );
      },
    },
    {
      field: 'actions',
      headerName: 'Acciones',
      width: 250,
      renderCell: (params) => (
        <Box sx={{ display: 'flex', gap: 0.5 }}>
          <Tooltip title="Descargar PDF">
            <IconButton
              size="small"
              color="primary"
              onClick={() => handleDownloadPDF(params.row.numero, params.row.empresaRuc)}
            >
              <PdfIcon fontSize="small" />
            </IconButton>
          </Tooltip>

          <Tooltip title="Descargar XML">
            <IconButton
              size="small"
              color="primary"
              onClick={() => handleDownloadXML(params.row.numero, params.row.empresaRuc)}
            >
              <XmlIcon fontSize="small" />
            </IconButton>
          </Tooltip>

          <Tooltip title="Descargar CDR">
            <span>
              <IconButton
                size="small"
                color="success"
                onClick={() => handleDownloadCDR(params.row.numero, params.row.empresaRuc)}
                disabled={params.row.estado !== 'ACEPTADO'}
              >
                <CdrIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>

          <Tooltip title="Enviar a SUNAT">
            <span>
              <IconButton
                size="small"
                color="warning"
                onClick={() => handleSendToSunat(params.row.numero, params.row.empresaRuc)}
                disabled={
                  params.row.estado === 'ACEPTADO' || 
                  params.row.estado === 'ENVIADO' ||
                  sendingToSunat === params.row.numero
                }
              >
                {sendingToSunat === params.row.numero ? (
                  <CircularProgress size={20} />
                ) : (
                  <SendIcon fontSize="small" />
                )}
              </IconButton>
            </span>
          </Tooltip>

          <Tooltip title="Actualizar Estado">
            <IconButton
              size="small"
              color="info"
              onClick={() => handleRefreshStatus(params.row.numero, params.row.empresaRuc)}
            >
              <RefreshIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>
      ),
    },
  ];

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Comprobantes Electrónicos
      </Typography>
      <Typography variant="body1" color="text.secondary" sx={{ mb: 4 }}>
        Búsqueda y gestión de comprobantes electrónicos
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
          {error}
        </Alert>
      )}

      {success && (
        <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess('')}>
          {success}
        </Alert>
      )}

      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Filtros de Búsqueda
          </Typography>

          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 2 }}>
            <TextField
              select
              label="Empresa"
              value={filters.empresaRuc}
              onChange={(e) => setFilters({ ...filters, empresaRuc: e.target.value })}
              size="small"
              required
            >
              <MenuItem value="">Seleccione una empresa</MenuItem>
              {empresas.map((empresa) => (
                <MenuItem key={empresa.ruc} value={empresa.ruc}>
                  {empresa.ruc} - {empresa.razonSocial}
                </MenuItem>
              ))}
            </TextField>

            <TextField
              select
              label="Tipo de Comprobante"
              value={filters.tipo}
              onChange={(e) => setFilters({ ...filters, tipo: e.target.value })}
              size="small"
            >
              <MenuItem value="">Todos</MenuItem>
              <MenuItem value="01">Factura</MenuItem>
              <MenuItem value="03">Boleta</MenuItem>
            </TextField>

            <TextField
              label="Número de Documento"
              value={filters.numeroDocumento}
              onChange={(e) => setFilters({ ...filters, numeroDocumento: e.target.value })}
              size="small"
            />

            <TextField
              label="Nombre/Razón Social"
              value={filters.nombre}
              onChange={(e) => setFilters({ ...filters, nombre: e.target.value })}
              size="small"
            />

            <TextField
              select
              label="Estado"
              value={filters.estado}
              onChange={(e) => setFilters({ ...filters, estado: e.target.value })}
              size="small"
            >
              <MenuItem value="">Todos</MenuItem>
              <MenuItem value="PENDIENTE">Pendiente</MenuItem>
              <MenuItem value="ENVIADO">Enviado</MenuItem>
              <MenuItem value="ACEPTADO">Aceptado</MenuItem>
              <MenuItem value="RECHAZADO">Rechazado</MenuItem>
            </TextField>

            <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={es}>
              <DatePicker
                label="Fecha Inicio"
                value={filters.fechaInicio}
                onChange={(date) => setFilters({ ...filters, fechaInicio: date })}
                slotProps={{ textField: { size: 'small' } }}
              />

              <DatePicker
                label="Fecha Fin"
                value={filters.fechaFin}
                onChange={(date) => setFilters({ ...filters, fechaFin: date })}
                slotProps={{ textField: { size: 'small' } }}
              />
            </LocalizationProvider>
          </Box>

          <Button
            variant="contained"
            startIcon={<SearchIcon />}
            onClick={handleSearch}
            disabled={loading}
            sx={{ mt: 2 }}
          >
            {loading ? 'Buscando...' : 'Buscar'}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <DataGrid
            rows={comprobantes}
            columns={columns}
            getRowId={(row) => row.numero}
            loading={loading}
            autoHeight
            pageSizeOptions={[10, 25, 50, 100]}
            initialState={{
              pagination: { paginationModel: { pageSize: 25 } },
            }}
          />
        </CardContent>
      </Card>

      {/* Diálogo de confirmación para envío a SUNAT */}
      <Dialog open={confirmDialog.open} onClose={() => setConfirmDialog({ open: false, numero: '', empresaRuc: '' })}>
        <DialogTitle>Confirmar Envío a SUNAT</DialogTitle>
        <DialogContent>
          <Typography>
            ¿Está seguro que desea enviar el comprobante <strong>{confirmDialog.numero}</strong> a SUNAT?
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
            Esta acción enviará el comprobante al servicio web de SUNAT para su validación y registro.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmDialog({ open: false, numero: '', empresaRuc: '' })}>
            Cancelar
          </Button>
          <Button onClick={confirmSendToSunat} variant="contained" color="primary">
            Enviar
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

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
} from '@mui/material';
import { DataGrid, GridColDef } from '@mui/x-data-grid';
import { Search as SearchIcon, Download as DownloadIcon, Refresh as RefreshIcon } from '@mui/icons-material';
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
      width: 200,
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
      width: 150,
      renderCell: (params) => (
        <Box>
          <IconButton
            size="small"
            color="primary"
            onClick={() => handleDownloadPDF(params.row.numero, params.row.empresaRuc)}
            title="Descargar PDF"
            disabled={params.row.estado !== 'ACEPTADO'}
          >
            <DownloadIcon />
          </IconButton>
          <IconButton
            size="small"
            color="primary"
            onClick={() => handleRefreshStatus(params.row.numero, params.row.empresaRuc)}
            title="Actualizar Estado"
          >
            <RefreshIcon />
          </IconButton>
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
    </Box>
  );
}

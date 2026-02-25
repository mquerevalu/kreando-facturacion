import React, { useEffect, useState } from 'react';
import {
  Box,
  Button,
  Card,
  CardContent,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField,
  Typography,
  Alert,
  IconButton,
  Chip,
  MenuItem,
} from '@mui/material';
import { DataGrid, GridColDef } from '@mui/x-data-grid';
import { Add as AddIcon, Edit as EditIcon, Delete as DeleteIcon } from '@mui/icons-material';
import apiService from '../services/api';

export default function Series() {
  const [empresas, setEmpresas] = useState([]);
  const [selectedEmpresaRuc, setSelectedEmpresaRuc] = useState('');
  const [series, setSeries] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [openDialog, setOpenDialog] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [formData, setFormData] = useState({
    tipoComprobante: '01', // FACTURA por defecto
    serie: '',
    correlativo: 1,
  });
  const [selectedSerie, setSelectedSerie] = useState<any>(null);

  useEffect(() => {
    loadEmpresas();
  }, []);

  useEffect(() => {
    if (selectedEmpresaRuc) {
      loadSeries();
    }
  }, [selectedEmpresaRuc]);

  const loadEmpresas = async () => {
    try {
      const data = await apiService.getEmpresas();
      setEmpresas(data.empresas || []);
      if (data.empresas && data.empresas.length > 0) {
        setSelectedEmpresaRuc(data.empresas[0].ruc);
      }
    } catch (err: any) {
      setError(err.response?.data?.mensaje || 'Error al cargar empresas');
    }
  };

  const loadSeries = async () => {
    if (!selectedEmpresaRuc) return;
    
    setLoading(true);
    setError('');
    try {
      const data = await apiService.getSeries(selectedEmpresaRuc);
      setSeries(data.series || []);
    } catch (err: any) {
      setError(err.response?.data?.mensaje || 'Error al cargar series');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    setError('');
    try {
      if (editMode && selectedSerie) {
        // Actualizar serie existente
        await apiService.updateSerie(
          selectedEmpresaRuc,
          selectedSerie.tipoComprobante,
          selectedSerie.serie,
          {
            correlativo: formData.correlativo,
          }
        );
        alert('Serie actualizada exitosamente');
      } else {
        // Crear nueva serie
        await apiService.createSerie({
          empresaRuc: selectedEmpresaRuc,
          tipoComprobante: formData.tipoComprobante,
          serie: formData.serie.toUpperCase(),
          correlativo: formData.correlativo,
        });
        alert('Serie creada exitosamente');
      }
      setOpenDialog(false);
      loadSeries();
      resetForm();
    } catch (err: any) {
      setError(err.response?.data?.message || err.response?.data?.error || `Error al ${editMode ? 'actualizar' : 'crear'} serie`);
    }
  };

  const handleEdit = (serie: any) => {
    setFormData({
      tipoComprobante: serie.tipoComprobante,
      serie: serie.serie,
      correlativo: serie.correlativo,
    });
    setSelectedSerie(serie);
    setEditMode(true);
    setOpenDialog(true);
  };

  const handleDelete = async (serie: any) => {
    if (!window.confirm(`¿Está seguro de eliminar la serie ${serie.serie}?`)) {
      return;
    }

    setError('');
    try {
      await apiService.deleteSerie(selectedEmpresaRuc, serie.tipoComprobante, serie.serie);
      alert('Serie eliminada exitosamente');
      loadSeries();
    } catch (err: any) {
      setError(err.response?.data?.mensaje || 'Error al eliminar serie');
    }
  };

  const handleNew = () => {
    resetForm();
    setEditMode(false);
    setOpenDialog(true);
  };

  const resetForm = () => {
    setFormData({
      tipoComprobante: '01',
      serie: '',
      correlativo: 1,
    });
    setSelectedSerie(null);
    setEditMode(false);
  };

  const getTipoComprobanteLabel = (tipo: string) => {
    switch (tipo) {
      case '01':
        return 'FACTURA';
      case '03':
        return 'BOLETA';
      default:
        return tipo;
    }
  };

  const columns: GridColDef[] = [
    {
      field: 'tipoComprobante',
      headerName: 'Tipo',
      width: 120,
      renderCell: (params) => (
        <Chip
          label={getTipoComprobanteLabel(params.value)}
          color={params.value === '01' ? 'primary' : 'secondary'}
          size="small"
        />
      ),
    },
    { field: 'serie', headerName: 'Serie', width: 120 },
    { field: 'correlativo', headerName: 'Correlativo', width: 120 },
    {
      field: 'activo',
      headerName: 'Estado',
      width: 100,
      renderCell: (params) => (
        <Chip
          label={params.value ? 'Activo' : 'Inactivo'}
          color={params.value ? 'success' : 'default'}
          size="small"
        />
      ),
    },
    {
      field: 'actions',
      headerName: 'Acciones',
      width: 120,
      renderCell: (params) => (
        <Box>
          <IconButton
            size="small"
            color="primary"
            onClick={() => handleEdit(params.row)}
            title="Editar serie"
          >
            <EditIcon />
          </IconButton>
          <IconButton
            size="small"
            color="error"
            onClick={() => handleDelete(params.row)}
            title="Eliminar serie"
          >
            <DeleteIcon />
          </IconButton>
        </Box>
      ),
    },
  ];

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4">Series de Comprobantes</Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={handleNew} disabled={!selectedEmpresaRuc}>
          Nueva Serie
        </Button>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
          {error}
        </Alert>
      )}

      <Card sx={{ mb: 2 }}>
        <CardContent>
          <TextField
            select
            fullWidth
            label="Empresa"
            value={selectedEmpresaRuc}
            onChange={(e) => setSelectedEmpresaRuc(e.target.value)}
            helperText="Seleccione una empresa para ver sus series"
          >
            {empresas.map((empresa: any) => (
              <MenuItem key={empresa.ruc} value={empresa.ruc}>
                {empresa.ruc} - {empresa.razonSocial}
              </MenuItem>
            ))}
          </TextField>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <DataGrid
            rows={series}
            columns={columns}
            getRowId={(row) => `${row.tipoComprobante}-${row.serie}`}
            loading={loading}
            autoHeight
            pageSizeOptions={[10, 25, 50]}
            initialState={{
              pagination: { paginationModel: { pageSize: 10 } },
            }}
          />
        </CardContent>
      </Card>

      <Dialog open={openDialog} onClose={() => { setOpenDialog(false); resetForm(); }} maxWidth="sm" fullWidth>
        <DialogTitle>{editMode ? 'Editar Serie' : 'Nueva Serie'}</DialogTitle>
        <DialogContent>
          {error && (
            <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
              {error}
            </Alert>
          )}
          
          <TextField
            select
            fullWidth
            label="Tipo de Comprobante"
            value={formData.tipoComprobante}
            onChange={(e) => setFormData({ ...formData, tipoComprobante: e.target.value })}
            margin="normal"
            required
            disabled={editMode}
            helperText={editMode ? 'El tipo de comprobante no se puede modificar' : ''}
          >
            <MenuItem value="01">FACTURA</MenuItem>
            <MenuItem value="03">BOLETA</MenuItem>
          </TextField>

          <TextField
            fullWidth
            label="Serie"
            value={formData.serie}
            onChange={(e) => setFormData({ ...formData, serie: e.target.value.toUpperCase() })}
            margin="normal"
            required
            disabled={editMode}
            helperText={editMode ? 'La serie no se puede modificar' : 'Formato: F001 para facturas, B001 para boletas'}
            inputProps={{ maxLength: 4 }}
          />

          <TextField
            fullWidth
            label="Correlativo"
            type="number"
            value={formData.correlativo}
            onChange={(e) => setFormData({ ...formData, correlativo: parseInt(e.target.value) || 1 })}
            margin="normal"
            required
            helperText="Número correlativo actual"
            inputProps={{ min: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setOpenDialog(false); resetForm(); }}>Cancelar</Button>
          <Button onClick={handleSubmit} variant="contained">
            {editMode ? 'Actualizar' : 'Guardar'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

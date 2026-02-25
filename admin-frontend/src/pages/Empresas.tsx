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
  Avatar,
} from '@mui/material';
import { DataGrid, GridColDef } from '@mui/x-data-grid';
import { Add as AddIcon, Edit as EditIcon, VpnKey as VpnKeyIcon } from '@mui/icons-material';
import apiService from '../services/api';

export default function Empresas() {
  const [empresas, setEmpresas] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [openDialog, setOpenDialog] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [selectedRuc, setSelectedRuc] = useState('');
  const [formData, setFormData] = useState({
    ruc: '',
    razonSocial: '',
    nombreComercial: '',
    direccion: '',
    departamento: '',
    provincia: '',
    distrito: '',
    ubigeo: '',
    usuarioSunat: '',
    passwordSunat: '',
    activo: true,
  });
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string>('');
  const [openCredencialesDialog, setOpenCredencialesDialog] = useState(false);
  const [credencialesData, setCredencialesData] = useState({
    usuario: '',
    password: '',
  });

  useEffect(() => {
    loadEmpresas();
  }, []);

  const loadEmpresas = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await apiService.getEmpresas();
      setEmpresas(data.empresas || []);
    } catch (err: any) {
      setError(err.response?.data?.mensaje || 'Error al cargar empresas');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    setError('');
    try {
      if (editMode) {
        // Actualizar empresa existente
        await apiService.updateEmpresa(selectedRuc, {
          razonSocial: formData.razonSocial,
          nombreComercial: formData.nombreComercial,
          activo: formData.activo,
          direccion: {
            direccion: formData.direccion,
            departamento: formData.departamento,
            provincia: formData.provincia,
            distrito: formData.distrito,
            ubigeo: formData.ubigeo,
          },
        });
        
        // Subir logo si se seleccionó uno nuevo
        if (logoFile) {
          await apiService.uploadLogo(selectedRuc, logoFile);
        }
        
        alert('Empresa actualizada exitosamente' + (logoFile ? ' (logo incluido)' : ''));
      } else {
        // Crear nueva empresa
        await apiService.createEmpresa({
          ruc: formData.ruc,
          razonSocial: formData.razonSocial,
          nombreComercial: formData.nombreComercial,
          direccion: {
            direccion: formData.direccion,
            departamento: formData.departamento,
            provincia: formData.provincia,
            distrito: formData.distrito,
            ubigeo: formData.ubigeo,
          },
          credencialesSunat: {
            ruc: formData.ruc,
            usuario: formData.usuarioSunat,
            password: formData.passwordSunat,
          },
        });
        
        alert('Empresa creada exitosamente');
      }
      setOpenDialog(false);
      loadEmpresas();
      resetForm();
    } catch (err: any) {
      setError(err.response?.data?.mensaje || `Error al ${editMode ? 'actualizar' : 'crear'} empresa`);
    }
  };

  const handleUpdateCredenciales = async () => {
    setError('');
    try {
      await apiService.updateCredencialesSOL(
        selectedRuc,
        credencialesData.usuario,
        credencialesData.password
      );
      setOpenCredencialesDialog(false);
      setCredencialesData({ usuario: '', password: '' });
      alert('Credenciales SOL actualizadas exitosamente');
    } catch (err: any) {
      setError(err.response?.data?.mensaje || 'Error al actualizar credenciales SOL');
    }
  };

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setLogoFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setLogoPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleOpenCredenciales = (ruc: string) => {
    setSelectedRuc(ruc);
    setOpenCredencialesDialog(true);
  };

  const handleEdit = async (ruc: string) => {
    setLoading(true);
    setError('');
    try {
      const empresa = await apiService.getEmpresa(ruc);
      setFormData({
        ruc: empresa.ruc,
        razonSocial: empresa.razonSocial,
        nombreComercial: empresa.nombreComercial || '',
        direccion: empresa.direccion?.direccion || '',
        departamento: empresa.direccion?.departamento || '',
        provincia: empresa.direccion?.provincia || '',
        distrito: empresa.direccion?.distrito || '',
        ubigeo: empresa.direccion?.ubigeo || '',
        usuarioSunat: '',
        passwordSunat: '',
        activo: empresa.activo !== false,
      });
      
      // Si la empresa tiene logo, obtener URL pre-firmada
      if (empresa.logoUrl) {
        try {
          const logoData = await apiService.getLogoPresignedUrl(ruc);
          setLogoPreview(logoData.presignedUrl);
        } catch (err) {
          console.error('Error al obtener logo:', err);
          setLogoPreview('');
        }
      } else {
        setLogoPreview('');
      }
      
      // Limpiar el archivo seleccionado
      setLogoFile(null);
      
      setSelectedRuc(ruc);
      setEditMode(true);
      setOpenDialog(true);
    } catch (err: any) {
      setError(err.response?.data?.mensaje || 'Error al cargar empresa');
    } finally {
      setLoading(false);
    }
  };

  const handleNew = () => {
    resetForm();
    setEditMode(false);
    setOpenDialog(true);
  };

  const resetForm = () => {
    setFormData({
      ruc: '',
      razonSocial: '',
      nombreComercial: '',
      direccion: '',
      departamento: '',
      provincia: '',
      distrito: '',
      ubigeo: '',
      usuarioSunat: '',
      passwordSunat: '',
      activo: true,
    });
    setSelectedRuc('');
    setEditMode(false);
    setLogoFile(null);
    setLogoPreview('');
  };

  const columns: GridColDef[] = [
    { field: 'ruc', headerName: 'RUC', width: 130 },
    { field: 'razonSocial', headerName: 'Razón Social', width: 250 },
    { field: 'nombreComercial', headerName: 'Nombre Comercial', width: 200 },
    {
      field: 'activo',
      headerName: 'Estado',
      width: 120,
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
      width: 150,
      renderCell: (params) => (
        <Box>
          <IconButton 
            size="small" 
            color="primary"
            onClick={() => handleEdit(params.row.ruc)}
            title="Editar empresa"
          >
            <EditIcon />
          </IconButton>
          <IconButton 
            size="small" 
            color="secondary"
            onClick={() => handleOpenCredenciales(params.row.ruc)}
            title="Actualizar credenciales SOL"
          >
            <VpnKeyIcon />
          </IconButton>
        </Box>
      ),
    },
  ];

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4">Empresas</Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={handleNew}
        >
          Nueva Empresa
        </Button>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
          {error}
        </Alert>
      )}

      <Card>
        <CardContent>
          <DataGrid
            rows={empresas}
            columns={columns}
            getRowId={(row) => row.ruc}
            loading={loading}
            autoHeight
            pageSizeOptions={[10, 25, 50]}
            initialState={{
              pagination: { paginationModel: { pageSize: 10 } },
            }}
          />
        </CardContent>
      </Card>

      <Dialog open={openDialog} onClose={() => { setOpenDialog(false); resetForm(); }} maxWidth="md" fullWidth>
        <DialogTitle>{editMode ? 'Editar Empresa' : 'Nueva Empresa'}</DialogTitle>
        <DialogContent>
          <TextField
            fullWidth
            label="RUC"
            value={formData.ruc}
            onChange={(e) => setFormData({ ...formData, ruc: e.target.value })}
            margin="normal"
            required
            disabled={editMode}
            helperText={editMode ? 'El RUC no se puede modificar' : ''}
          />
          <TextField
            fullWidth
            label="Razón Social"
            value={formData.razonSocial}
            onChange={(e) => setFormData({ ...formData, razonSocial: e.target.value })}
            margin="normal"
            required
          />
          <TextField
            fullWidth
            label="Nombre Comercial"
            value={formData.nombreComercial}
            onChange={(e) => setFormData({ ...formData, nombreComercial: e.target.value })}
            margin="normal"
          />
          <TextField
            fullWidth
            label="Dirección"
            value={formData.direccion}
            onChange={(e) => setFormData({ ...formData, direccion: e.target.value })}
            margin="normal"
            required
          />
          <Box sx={{ display: 'flex', gap: 2 }}>
            <TextField
              fullWidth
              label="Departamento"
              value={formData.departamento}
              onChange={(e) => setFormData({ ...formData, departamento: e.target.value })}
              margin="normal"
            />
            <TextField
              fullWidth
              label="Provincia"
              value={formData.provincia}
              onChange={(e) => setFormData({ ...formData, provincia: e.target.value })}
              margin="normal"
            />
          </Box>
          <Box sx={{ display: 'flex', gap: 2 }}>
            <TextField
              fullWidth
              label="Distrito"
              value={formData.distrito}
              onChange={(e) => setFormData({ ...formData, distrito: e.target.value })}
              margin="normal"
            />
            <TextField
              fullWidth
              label="Ubigeo"
              value={formData.ubigeo}
              onChange={(e) => setFormData({ ...formData, ubigeo: e.target.value })}
              margin="normal"
            />
          </Box>
          
          {editMode && (
            <Box sx={{ mt: 3, mb: 2 }}>
              <Typography variant="subtitle1" gutterBottom sx={{ fontWeight: 'bold' }}>
                Logo de la Empresa
              </Typography>
              
              {(logoPreview || logoFile) && (
                <Box sx={{ 
                  mb: 2, 
                  p: 2, 
                  border: '2px dashed #ccc', 
                  borderRadius: 2,
                  display: 'flex', 
                  flexDirection: 'column',
                  alignItems: 'center',
                  bgcolor: 'grey.50'
                }}>
                  <Typography variant="caption" color="text.secondary" sx={{ mb: 1 }}>
                    {logoFile ? 'Vista previa del nuevo logo' : 'Logo actual'}
                  </Typography>
                  <Avatar
                    src={logoPreview}
                    sx={{ width: 150, height: 150, mb: 1 }}
                    variant="rounded"
                  />
                  {logoFile && (
                    <Typography variant="body2" color="primary" sx={{ mt: 1 }}>
                      {logoFile.name}
                    </Typography>
                  )}
                </Box>
              )}
              
              <Button
                fullWidth
                variant="outlined"
                component="label"
                sx={{ mb: 2 }}
              >
                {logoFile ? 'Cambiar Logo' : (logoPreview ? 'Actualizar Logo' : 'Seleccionar Logo')}
                <input
                  type="file"
                  hidden
                  accept="image/*"
                  onChange={handleLogoChange}
                />
              </Button>
              
              {logoFile && (
                <Alert severity="info" sx={{ mb: 2 }}>
                  El logo se actualizará al guardar los cambios
                </Alert>
              )}
              
              <TextField
                select
                fullWidth
                label="Estado"
                value={formData.activo ? 'true' : 'false'}
                onChange={(e) => setFormData({ ...formData, activo: e.target.value === 'true' })}
                margin="normal"
                SelectProps={{
                  native: true,
                }}
              >
                <option value="true">Activo</option>
                <option value="false">Inactivo</option>
              </TextField>
            </Box>
          )}

          {!editMode && (
            <>
              <Typography variant="h6" sx={{ mt: 3, mb: 1 }}>
                Credenciales SUNAT
              </Typography>
              <TextField
                fullWidth
                label="Usuario SUNAT"
                value={formData.usuarioSunat}
                onChange={(e) => setFormData({ ...formData, usuarioSunat: e.target.value })}
                margin="normal"
                required
              />
              <TextField
                fullWidth
                label="Contraseña SUNAT"
                type="password"
                value={formData.passwordSunat}
                onChange={(e) => setFormData({ ...formData, passwordSunat: e.target.value })}
                margin="normal"
                required
              />
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setOpenDialog(false); resetForm(); }}>Cancelar</Button>
          <Button onClick={handleSubmit} variant="contained">
            {editMode ? 'Actualizar' : 'Guardar'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={openCredencialesDialog} onClose={() => setOpenCredencialesDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Actualizar Credenciales SOL</DialogTitle>
        <DialogContent>
          {error && (
            <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
              {error}
            </Alert>
          )}
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            RUC: {selectedRuc}
          </Typography>
          <TextField
            fullWidth
            label="Usuario SOL"
            value={credencialesData.usuario}
            onChange={(e) => setCredencialesData({ ...credencialesData, usuario: e.target.value })}
            margin="normal"
            required
          />
          <TextField
            fullWidth
            label="Contraseña SOL"
            type="password"
            value={credencialesData.password}
            onChange={(e) => setCredencialesData({ ...credencialesData, password: e.target.value })}
            margin="normal"
            required
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setOpenCredencialesDialog(false); setCredencialesData({ usuario: '', password: '' }); }}>
            Cancelar
          </Button>
          <Button onClick={handleUpdateCredenciales} variant="contained">
            Actualizar
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

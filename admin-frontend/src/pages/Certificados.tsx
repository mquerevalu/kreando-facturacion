import React, { useState, useEffect } from 'react';
import {
  Box,
  Button,
  Card,
  CardContent,
  TextField,
  Typography,
  Alert,
  Grid,
  Chip,
  MenuItem,
  Select,
  FormControl,
  InputLabel,
} from '@mui/material';
import { Upload as UploadIcon, Search as SearchIcon } from '@mui/icons-material';
import apiService from '../services/api';

export default function Certificados() {
  const [empresas, setEmpresas] = useState<any[]>([]);
  const [rucSeleccionado, setRucSeleccionado] = useState('');
  const [rucConsulta, setRucConsulta] = useState('');
  const [password, setPassword] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [certificado, setCertificado] = useState<any>(null);
  const [certificadoCargado, setCertificadoCargado] = useState<any>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadEmpresas();
  }, []);

  const loadEmpresas = async () => {
    try {
      const data = await apiService.getEmpresas();
      setEmpresas(data.empresas || []);
    } catch (err: any) {
      console.error('Error al cargar empresas:', err);
    }
  };

  const handleUpload = async () => {
    if (!rucSeleccionado || !file || !password) {
      setError('Todos los campos son requeridos');
      return;
    }

    setError('');
    setSuccess('');
    setLoading(true);
    setCertificadoCargado(null);

    try {
      const result = await apiService.uploadCertificado(rucSeleccionado, file, password);
      setSuccess('Certificado cargado exitosamente en AWS Secrets Manager');
      
      // Mostrar el certificado recién cargado
      setCertificadoCargado(result);
      
      setFile(null);
      setPassword('');
      setRucSeleccionado('');
    } catch (err: any) {
      setError(err.response?.data?.message || err.response?.data?.mensaje || 'Error al cargar certificado');
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async () => {
    if (!rucConsulta) {
      setError('Seleccione una empresa');
      return;
    }

    setError('');
    setSuccess('');
    setLoading(true);

    try {
      const data = await apiService.getCertificado(rucConsulta);
      setCertificado(data);
    } catch (err: any) {
      setError(err.response?.data?.message || err.response?.data?.mensaje || 'Error al consultar certificado');
      setCertificado(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Certificados Digitales
      </Typography>
      <Typography variant="body1" color="text.secondary" sx={{ mb: 1 }}>
        Gestión de certificados digitales para firma electrónica
      </Typography>
      <Typography variant="body2" color="info.main" sx={{ mb: 4 }}>
        Los certificados se almacenan de forma segura en AWS Secrets Manager (sunat/certificados/[RUC])
      </Typography>

      <Grid container spacing={3}>
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Cargar Certificado
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

              <FormControl fullWidth margin="normal">
                <InputLabel>Empresa</InputLabel>
                <Select
                  value={rucSeleccionado}
                  onChange={(e) => setRucSeleccionado(e.target.value)}
                  label="Empresa"
                  required
                >
                  <MenuItem value="">
                    <em>Seleccione una empresa</em>
                  </MenuItem>
                  {empresas.map((empresa) => (
                    <MenuItem key={empresa.ruc} value={empresa.ruc}>
                      {empresa.ruc} - {empresa.razonSocial}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>

              <Button
                fullWidth
                variant="outlined"
                component="label"
                sx={{ mt: 2 }}
              >
                {file ? file.name : 'Seleccionar Archivo PFX/P12'}
                <input
                  type="file"
                  hidden
                  accept=".pfx,.p12"
                  onChange={(e) => setFile(e.target.files?.[0] || null)}
                />
              </Button>

              <TextField
                fullWidth
                label="Contraseña del Certificado"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                margin="normal"
                required
              />

              <Button
                fullWidth
                variant="contained"
                startIcon={<UploadIcon />}
                onClick={handleUpload}
                disabled={loading}
                sx={{ mt: 2 }}
              >
                {loading ? 'Cargando...' : 'Cargar Certificado'}
              </Button>

              {certificadoCargado && (
                <Box sx={{ mt: 3, p: 2, bgcolor: 'success.light', borderRadius: 1 }}>
                  <Typography variant="h6" color="success.dark" gutterBottom>
                    ✓ Certificado Cargado en AWS Secrets Manager
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                    Ubicación: sunat/certificados/{certificadoCargado.ruc}
                  </Typography>
                  
                  <Box sx={{ bgcolor: 'white', p: 2, borderRadius: 1 }}>
                    <Typography variant="subtitle2" color="text.secondary">
                      RUC
                    </Typography>
                    <Typography variant="body1" gutterBottom>
                      {certificadoCargado.ruc}
                    </Typography>

                    <Typography variant="subtitle2" color="text.secondary" sx={{ mt: 1 }}>
                      Emisor
                    </Typography>
                    <Typography variant="body1" gutterBottom>
                      {certificadoCargado.emisor}
                    </Typography>

                    <Typography variant="subtitle2" color="text.secondary" sx={{ mt: 1 }}>
                      Fecha de Vencimiento
                    </Typography>
                    <Typography variant="body1" gutterBottom>
                      {certificadoCargado.fechaVencimiento}
                    </Typography>

                    <Typography variant="subtitle2" color="text.secondary" sx={{ mt: 1 }}>
                      Estado
                    </Typography>
                    <Chip
                      label={certificadoCargado.vigente ? 'Vigente' : 'Vencido'}
                      color={certificadoCargado.vigente ? 'success' : 'error'}
                      size="small"
                      sx={{ mt: 0.5 }}
                    />

                    {certificadoCargado.vigente && certificadoCargado.diasParaVencimiento !== undefined && (
                      <>
                        <Typography variant="subtitle2" color="text.secondary" sx={{ mt: 1 }}>
                          Días para Vencer
                        </Typography>
                        <Typography variant="body1">
                          {certificadoCargado.diasParaVencimiento} días
                        </Typography>
                      </>
                    )}
                  </Box>
                </Box>
              )}
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Consultar Certificado
              </Typography>

              <FormControl fullWidth margin="normal">
                <InputLabel>Empresa</InputLabel>
                <Select
                  value={rucConsulta}
                  onChange={(e) => setRucConsulta(e.target.value)}
                  label="Empresa"
                  required
                >
                  <MenuItem value="">
                    <em>Seleccione una empresa</em>
                  </MenuItem>
                  {empresas.map((empresa) => (
                    <MenuItem key={empresa.ruc} value={empresa.ruc}>
                      {empresa.ruc} - {empresa.razonSocial}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>

              <Button
                fullWidth
                variant="contained"
                startIcon={<SearchIcon />}
                onClick={handleSearch}
                disabled={loading}
                sx={{ mt: 2 }}
              >
                {loading ? 'Consultando...' : 'Consultar'}
              </Button>

              {certificado && (
                <Box sx={{ mt: 3 }}>
                  <Alert severity="success" sx={{ mb: 2 }}>
                    Certificado encontrado y cargado correctamente
                  </Alert>
                  
                  <Typography variant="subtitle2" color="text.secondary">
                    RUC
                  </Typography>
                  <Typography variant="body1" gutterBottom>
                    {certificado.ruc}
                  </Typography>

                  <Typography variant="subtitle2" color="text.secondary" sx={{ mt: 2 }}>
                    Emisor
                  </Typography>
                  <Typography variant="body1" gutterBottom>
                    {certificado.emisor}
                  </Typography>

                  <Typography variant="subtitle2" color="text.secondary" sx={{ mt: 2 }}>
                    Fecha de Emisión
                  </Typography>
                  <Typography variant="body1" gutterBottom>
                    {certificado.fechaEmision}
                  </Typography>

                  <Typography variant="subtitle2" color="text.secondary" sx={{ mt: 2 }}>
                    Fecha de Vencimiento
                  </Typography>
                  <Typography variant="body1" gutterBottom>
                    {certificado.fechaVencimiento}
                  </Typography>

                  <Typography variant="subtitle2" color="text.secondary" sx={{ mt: 2 }}>
                    Estado
                  </Typography>
                  <Chip
                    label={certificado.vigente ? 'Vigente' : 'Vencido'}
                    color={certificado.vigente ? 'success' : 'error'}
                    size="small"
                    sx={{ mt: 1 }}
                  />

                  {certificado.vigente && certificado.diasParaVencimiento !== undefined && (
                    <>
                      <Typography variant="subtitle2" color="text.secondary" sx={{ mt: 2 }}>
                        Días para Vencer
                      </Typography>
                      <Typography variant="body1">
                        {certificado.diasParaVencimiento} días
                      </Typography>
                    </>
                  )}
                </Box>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
}

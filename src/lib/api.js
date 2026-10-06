const API_BASE = import.meta.env.VITE_API_URL || '/api';
const TOKEN_KEY = 'trazabilidad_onco_token';

function buildQuery(params = {}) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    search.set(key, String(value));
  });
  const query = search.toString();
  return query ? `?${query}` : '';
}

async function request(path, options = {}) {
  const token = getAuthToken();
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
    ...options,
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body?.error || `Request failed: ${response.status}`);
  }

  if (response.status === 204) return null;
  return response.json();
}

export function getAuthToken() {
  return window.localStorage.getItem(TOKEN_KEY);
}

export function setAuthToken(token) {
  if (!token) {
    window.localStorage.removeItem(TOKEN_KEY);
    return;
  }
  window.localStorage.setItem(TOKEN_KEY, token);
}

export async function login(email, password) {
  const data = await request('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
  setAuthToken(data.token);
  return data;
}

export async function demoLogin(role) {
  const data = await request('/auth/demo-login', { method: 'POST', body: JSON.stringify({ role }) });
  setAuthToken(data.token);
  return data;
}

export async function fetchMe() {
  return request('/auth/me');
}

export async function logout() {
  const result = await request('/auth/logout', { method: 'POST' });
  setAuthToken(null);
  return result;
}

export async function fetchBootstrap() {
  return request('/bootstrap');
}

export async function fetchCasos(params) {
  return request(`/casos${buildQuery(params)}`);
}

export async function fetchCaso(id) {
  return request(`/casos/${id}`);
}

export async function createCaso(payload) {
  return request('/casos', { method: 'POST', body: JSON.stringify(payload) });
}

export async function updateCaso(id, payload) {
  return request(`/casos/${id}`, { method: 'PATCH', body: JSON.stringify(payload) });
}

export async function registrarHito(id, payload) {
  return request(`/casos/${id}/hitos`, { method: 'POST', body: JSON.stringify(payload) });
}

export async function registrarNota(id, payload) {
  return request(`/casos/${id}/notas`, { method: 'POST', body: JSON.stringify(payload) });
}

export async function registrarComite(id, payload) {
  return request(`/casos/${id}/comite`, { method: 'POST', body: JSON.stringify(payload) });
}

export async function registrarDerivacion(id, payload) {
  return request(`/casos/${id}/derivaciones`, { method: 'POST', body: JSON.stringify(payload) });
}

export async function actualizarDerivacion(derivacionId, payload) {
  return request(`/derivaciones/${derivacionId}`, { method: 'PATCH', body: JSON.stringify(payload) });
}

export async function actualizarPlazo(plazoId, payload) {
  return request(`/plazos/${plazoId}`, { method: 'PATCH', body: JSON.stringify(payload) });
}

export async function fetchPlazoConfig() {
  return request('/plazos/config');
}

export async function actualizarPlazoConfig(tipo, diasPlazoDefault) {
  return request('/plazos/config', { method: 'PATCH', body: JSON.stringify({ tipo, diasPlazoDefault }) });
}

export async function buscarPacientes(q) {
  return request(`/pacientes${buildQuery({ q })}`);
}

export async function crearPaciente(payload) {
  return request('/pacientes', { method: 'POST', body: JSON.stringify(payload) });
}

export async function fetchNotificaciones() {
  return request('/notificaciones');
}

export async function marcarNotificacionLeida(id) {
  return request(`/notificaciones/${id}/read`, { method: 'PATCH' });
}

// --- Quimioterapia ------------------------------------------------------------

export async function fetchEsquemasQuimio(q) {
  return request(`/quimio/esquemas${buildQuery({ q })}`);
}

export async function fetchEsquemaQuimio(id) {
  return request(`/quimio/esquemas/${id}`);
}

export async function fetchDisponibilidadQuimio(fecha, duracionMin) {
  return request(`/quimio/disponibilidad${buildQuery({ fecha, duracionMin })}`);
}

export async function fetchCalendarioQuimio(desde, hasta) {
  return request(`/quimio/calendario${buildQuery({ desde, hasta })}`);
}

export async function fetchSillones() {
  return request('/sillones');
}

export async function crearSillon(payload) {
  return request('/sillones', { method: 'POST', body: JSON.stringify(payload) });
}

export async function actualizarSillon(id, payload) {
  return request(`/sillones/${id}`, { method: 'PATCH', body: JSON.stringify(payload) });
}

export async function fetchRecetas(params) {
  return request(`/quimio/recetas${buildQuery(params)}`);
}

export async function fetchReceta(id) {
  return request(`/quimio/recetas/${id}`);
}

export async function crearReceta(payload) {
  return request('/quimio/recetas', { method: 'POST', body: JSON.stringify(payload) });
}

export async function actualizarReceta(id, payload) {
  return request(`/quimio/recetas/${id}`, { method: 'PATCH', body: JSON.stringify(payload) });
}

export async function validarReceta(id, observaciones) {
  return request(`/quimio/recetas/${id}/validar`, { method: 'POST', body: JSON.stringify({ observaciones }) });
}

export async function rechazarReceta(id, motivo) {
  return request(`/quimio/recetas/${id}/rechazar`, { method: 'POST', body: JSON.stringify({ motivo }) });
}

export async function fetchCiclos(params) {
  return request(`/quimio/ciclos${buildQuery(params)}`);
}

export async function fetchCiclo(id) {
  return request(`/quimio/ciclos/${id}`);
}

export async function crearCiclo(payload) {
  return request('/quimio/ciclos', { method: 'POST', body: JSON.stringify(payload) });
}

export async function reagendarCiclo(id, payload) {
  return request(`/quimio/ciclos/${id}`, { method: 'PATCH', body: JSON.stringify(payload) });
}

export async function transicionarCiclo(id, payload) {
  return request(`/quimio/ciclos/${id}/transicion`, { method: 'POST', body: JSON.stringify(payload) });
}

export async function fetchGrillaQuimio(desde, hasta) {
  return request(`/quimio/grilla${buildQuery({ desde, hasta })}`);
}

export async function fetchEstadisticasQuimio(params) {
  return request(`/quimio/estadisticas${buildQuery(params)}`);
}

export async function descargarEstadisticasQuimio(params) {
  const token = getAuthToken();
  const response = await fetch(`${API_BASE}/quimio/estadisticas/export${buildQuery(params)}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!response.ok) throw new Error(`Request failed: ${response.status}`);
  const blob = await response.blob();
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'estadisticas_quimio.csv';
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

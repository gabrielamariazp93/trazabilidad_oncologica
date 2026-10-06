import React, { useState } from 'react';
import { FileText, Armchair, FlaskConical, Syringe, BarChart3 } from 'lucide-react';
import RecetasList from './RecetasList.jsx';
import SillonesGrilla from './SillonesGrilla.jsx';
import ColaPreparacion from './ColaPreparacion.jsx';
import ColaAdministracion from './ColaAdministracion.jsx';
import EstadisticasQuimio from './EstadisticasQuimio.jsx';

const DEFAULT_TAB_BY_ROLE = {
  farmacia: 'preparacion',
  enfermera_quimio: 'administracion',
  oncologo: 'recetas',
};

const TABS = [
  { id: 'recetas', label: 'Recetas', icon: FileText },
  { id: 'sillones', label: 'Sillones', icon: Armchair },
  { id: 'preparacion', label: 'Preparación', icon: FlaskConical },
  { id: 'administracion', label: 'Administración', icon: Syringe },
  { id: 'estadisticas', label: 'Estadísticas', icon: BarChart3 },
];

export default function QuimioApp({ user, bootstrap }) {
  const [tab, setTab] = useState(DEFAULT_TAB_BY_ROLE[user.role] ?? 'recetas');

  return (
    <div>
      <div className="flex items-center gap-1 border-b border-slate-200 mb-5 overflow-x-auto">
        {TABS.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 text-sm font-medium px-3 py-2 border-b-2 whitespace-nowrap ${
                tab === t.id ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              <Icon className="w-4 h-4" />
              {t.label}
            </button>
          );
        })}
      </div>

      {tab === 'recetas' && <RecetasList user={user} bootstrap={bootstrap} />}
      {tab === 'sillones' && <SillonesGrilla user={user} bootstrap={bootstrap} />}
      {tab === 'preparacion' && <ColaPreparacion user={user} bootstrap={bootstrap} />}
      {tab === 'administracion' && <ColaAdministracion user={user} bootstrap={bootstrap} />}
      {tab === 'estadisticas' && <EstadisticasQuimio user={user} bootstrap={bootstrap} />}
    </div>
  );
}

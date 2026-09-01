import React, { useState } from 'react';
import { Search, Sparkles, BookOpen, Crown, Download, Lock, CheckCircle2, AlertTriangle, ArrowRight } from 'lucide-react';

interface InteractiveAppPreviewProps {
  onOpenWebApp: () => void;
}

export const InteractiveAppPreview: React.FC<InteractiveAppPreviewProps> = ({ onOpenWebApp }) => {
  const [activeCategory, setActiveCategory] = useState('Tous');
  const [selectedDoc, setSelectedDoc] = useState<number | null>(null);

  const categories = ['Tous', 'Droit', 'Économie', 'Informatique', 'Gestion', 'Sciences'];

  const sampleDocs = [
    {
      id: 1,
      title: 'Droit Constitutionnel & Institutions — Examen 2025/2026',
      cat: 'Droit',
      pages: 18,
      price: '100 FCFA',
      isVipFree: true,
      certified: true,
      downloads: '1.2k',
    },
    {
      id: 2,
      title: 'Algorithmique & Structures de Données Avancées',
      cat: 'Informatique',
      pages: 24,
      price: '100 FCFA',
      isVipFree: true,
      certified: true,
      downloads: '850',
    },
    {
      id: 3,
      title: 'Macroéconomie Monétaire & Finance Internationale',
      cat: 'Économie',
      pages: 15,
      price: '100 FCFA',
      isVipFree: true,
      certified: true,
      downloads: '940',
    },
  ];

  const filteredDocs = activeCategory === 'Tous' 
    ? sampleDocs 
    : sampleDocs.filter(d => d.cat === activeCategory);

  return (
    <div className="w-full max-w-md mx-auto bg-[#1A0308] rounded-[2.5rem] p-3.5 shadow-2xl border-4 border-[#3D0613] relative overflow-hidden">
      
      {/* Smartphone Speaker & Camera Notch */}
      <div className="w-32 h-4 bg-[#3D0613] rounded-full mx-auto mb-2 flex items-center justify-center">
        <div className="w-3 h-3 rounded-full bg-black/60 mr-2"></div>
        <div className="w-8 h-1 rounded-full bg-black/40"></div>
      </div>

      {/* Screen Body */}
      <div className="bg-[#FAF6EB] rounded-[2rem] overflow-hidden text-gray-900 shadow-inner flex flex-col h-[520px]">
        
        {/* App Header Bar */}
        <div className="bg-[#6B1124] px-4 py-3 text-[#FAF6EB] flex items-center justify-between shadow-md">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-[#7F011F] flex items-center justify-center font-bold text-sm border border-white/20">
              C
            </div>
            <div>
              <h4 className="font-extrabold text-sm leading-tight">cauZon</h4>
              <span className="text-[9px] text-[#FAF6EB]/80">Portail Étudiant</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="bg-[#10B981] text-[#FAF6EB] text-[10px] font-extrabold px-2 py-0.5 rounded-full flex items-center gap-1 shadow-sm">
              <CheckCircle2 size={10} /> En Ligne
            </span>
          </div>
        </div>

        {/* Scrollable Feed Container */}
        <div className="flex-1 overflow-y-auto p-3.5 space-y-3 bg-[#F5EED8]/30">
          
          {/* Emergency / Flash Banner */}
          <div className="bg-gradient-to-r from-[#7F011F] to-[#520B1B] text-white p-3 rounded-2xl shadow-sm flex items-start gap-2.5 border border-white/10">
            <div className="bg-red-500/20 p-1.5 rounded-xl flex-shrink-0 text-red-300">
              <AlertTriangle size={15} />
            </div>
            <div className="flex-1">
              <span className="text-[9px] font-black uppercase tracking-wider bg-red-600 px-1.5 py-0.5 rounded text-white inline-block mb-1">
                URGENT · SESSION 2026
              </span>
              <p className="text-xs font-bold leading-tight">
                Annales corrigées des partiels & concours d'excellence disponibles !
              </p>
            </div>
          </div>

          {/* Search Simulation */}
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              readOnly
              value=""
              placeholder="Rechercher une épreuve, un TD, un cours..."
              className="w-full pl-8 pr-3 py-2 bg-white rounded-xl text-xs border border-gray-200 outline-none text-gray-700 shadow-sm"
            />
          </div>

          {/* Category Chips */}
          <div className="flex gap-1.5 overflow-x-auto pb-1 no-scrollbar">
            {categories.map(cat => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={`text-[10px] font-bold px-2.5 py-1 rounded-lg transition-all flex-shrink-0 ${
                  activeCategory === cat
                    ? 'bg-[#6B1124] text-[#FAF6EB] shadow-sm'
                    : 'bg-white text-gray-600 border border-gray-200'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* Document Cards List */}
          <div className="space-y-2">
            {filteredDocs.map(doc => (
              <div
                key={doc.id}
                onClick={() => setSelectedDoc(doc.id)}
                className={`bg-white p-3 rounded-xl border transition-all cursor-pointer shadow-sm hover:border-[#6B1124] ${
                  selectedDoc === doc.id ? 'border-[#6B1124] ring-1 ring-[#6B1124]' : 'border-gray-200'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex gap-2">
                    <div className="w-8 h-8 rounded-lg bg-[#FAF6EB] border border-[#6B1124]/20 flex items-center justify-center text-[#6B1124] flex-shrink-0">
                      <BookOpen size={16} />
                    </div>
                    <div>
                      <h5 className="text-[11px] font-bold text-gray-900 leading-snug line-clamp-2">
                        {doc.title}
                      </h5>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[9px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded font-medium">
                          {doc.cat}
                        </span>
                        <span className="text-[9px] text-gray-500 font-medium">
                          {doc.pages} pages
                        </span>
                      </div>
                    </div>
                  </div>
                  <span className="text-xs font-black text-[#10B981] whitespace-nowrap bg-emerald-50 px-2 py-0.5 rounded-lg border border-emerald-100">
                    {doc.price}
                  </span>
                </div>

                <div className="mt-2 pt-2 border-t border-gray-100 flex items-center justify-between text-[10px]">
                  <span className="text-gray-500 flex items-center gap-1 font-medium">
                    <Download size={11} /> {doc.downloads}
                  </span>
                  <span className="text-[#6B1124] font-bold flex items-center gap-1">
                    <Crown size={11} /> Inclus VIP
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* Interactive CTA inside simulation */}
          <div className="bg-[#6B1124] text-[#FAF6EB] p-3 rounded-2xl text-center space-y-2 shadow-md">
            <p className="text-[11px] font-bold">
              Envie d'explorer tout le catalogue cauZon en ligne ?
            </p>
            <button
              onClick={onOpenWebApp}
              className="w-full py-2 bg-[#FAF6EB] text-[#6B1124] rounded-xl font-extrabold text-xs flex items-center justify-center gap-1.5 shadow hover:bg-white transition-all"
            >
              <Sparkles size={14} />
              Ouvrir l'application Web complète
              <ArrowRight size={13} />
            </button>
          </div>

        </div>

      </div>

    </div>
  );
};

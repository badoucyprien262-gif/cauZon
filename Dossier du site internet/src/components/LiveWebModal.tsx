import React, { useState } from 'react';
import { X, Globe, ExternalLink, Maximize2, Smartphone, Monitor, RefreshCw, AlertCircle } from 'lucide-react';

interface LiveWebModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const LiveWebModal: React.FC<LiveWebModalProps> = ({ isOpen, onClose }) => {
  const [deviceMode, setDeviceMode] = useState<'mobile' | 'desktop'>('mobile');
  const [iframeKey, setIframeKey] = useState(0);

  if (!isOpen) return null;

  const appUrl = 'http://localhost:8081';

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-2 sm:p-4 md:p-6 animate-fadeIn">
      
      <div className="w-full max-w-5xl h-[92vh] bg-[#FAF6EB] rounded-[2rem] shadow-2xl flex flex-col overflow-hidden border-2 border-[#6B1124]/30">
        
        {/* Top Control Bar */}
        <div className="bg-[#6B1124] text-[#FAF6EB] px-6 py-4 flex items-center justify-between shadow-md">
          
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-[#7F011F] flex items-center justify-center font-bold text-sm border border-white/20">
              C
            </div>
            <div>
              <h3 className="font-extrabold text-sm sm:text-base leading-tight flex items-center gap-2">
                <span>cauZon Web Live</span>
                <span className="text-[10px] bg-[#10B981] text-white px-2 py-0.5 rounded-full font-bold">
                  En Direct
                </span>
              </h3>
              <p className="text-xs text-creme-200/80 hidden sm:block">
                Interface connectée à la base de données Supabase
              </p>
            </div>
          </div>

          {/* Device & View Switchers */}
          <div className="flex items-center gap-2 sm:gap-3">
            
            <div className="hidden sm:flex bg-black/20 p-1 rounded-xl border border-white/10">
              <button
                onClick={() => setDeviceMode('mobile')}
                className={`p-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all ${
                  deviceMode === 'mobile' ? 'bg-[#FAF6EB] text-[#6B1124]' : 'text-white/80 hover:text-white'
                }`}
                title="Format Smartphone"
              >
                <Smartphone size={15} />
                <span>Mobile</span>
              </button>
              <button
                onClick={() => setDeviceMode('desktop')}
                className={`p-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all ${
                  deviceMode === 'desktop' ? 'bg-[#FAF6EB] text-[#6B1124]' : 'text-white/80 hover:text-white'
                }`}
                title="Format Bureau"
              >
                <Monitor size={15} />
                <span>Plein Écran</span>
              </button>
            </div>

            <button
              onClick={() => setIframeKey(k => k + 1)}
              className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors"
              title="Actualiser la vue"
            >
              <RefreshCw size={17} />
            </button>

            <a
              href={appUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3.5 py-2 rounded-xl bg-[#10B981] hover:bg-emerald-600 text-white font-bold text-xs flex items-center gap-1.5 shadow-md transition-all"
            >
              <span>Ouvrir dans un nouvel onglet</span>
              <ExternalLink size={14} />
            </a>

            <button
              onClick={onClose}
              className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors"
            >
              <X size={20} />
            </button>

          </div>

        </div>

        {/* Viewport Frame */}
        <div className="flex-1 bg-[#1A0308] p-3 sm:p-6 flex items-center justify-center overflow-auto">
          
          <div
            className={`transition-all duration-300 bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col ${
              deviceMode === 'mobile'
                ? 'w-full max-w-[420px] h-[98%] border-4 border-gray-800'
                : 'w-full h-full border border-gray-300'
            }`}
          >
            <iframe
              key={iframeKey}
              src={appUrl}
              title="cauZon Web Live"
              className="w-full h-full border-none"
            />
          </div>

        </div>

        {/* Bottom Helper Bar */}
        <div className="bg-[#FAF6EB] px-6 py-3 border-t border-gray-200 flex flex-col sm:flex-row items-center justify-between text-xs text-gray-600 gap-2">
          <div className="flex items-center gap-2 text-[#6B1124]">
            <AlertCircle size={14} />
            <span>Serveur local cauZon : <strong>{appUrl}</strong></span>
          </div>
          <span>Connectez-vous avec votre compte Google ou profitez du 1er cours offert.</span>
        </div>

      </div>

    </div>
  );
};

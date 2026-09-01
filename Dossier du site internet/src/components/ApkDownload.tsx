import React, { useState } from 'react';
import { Download, Smartphone, ShieldCheck, CheckCircle2, AlertCircle, FileText, ArrowRight, ExternalLink } from 'lucide-react';

interface ApkDownloadProps {
  onOpenWebApp: () => void;
}

export const ApkDownload: React.FC<ApkDownloadProps> = ({ onOpenWebApp }) => {
  const [downloadStarted, setDownloadStarted] = useState(false);

  const handleDownloadApk = () => {
    setDownloadStarted(true);
    // Déclenche le téléchargement du fichier APK officiel
    const link = document.createElement('a');
    link.href = '/downloads/cauzon-v1.0.0.apk';
    link.download = 'cauzon-officiel-v1.0.0.apk';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    setTimeout(() => {
      setDownloadStarted(false);
    }, 4000);
  };

  const steps = [
    {
      num: "01",
      title: "Téléchargez l'APK",
      desc: "Cliquez sur le bouton ci-dessous pour enregistrer le fichier d'installation cauZon (environ 48 Mo)."
    },
    {
      num: "02",
      title: "Autorisez l'installation",
      desc: "Si Android affiche un message de sécurité, autorisez l'installation depuis cette source (application certifiée)."
    },
    {
      num: "03",
      title: "Ouvrez & Révisez",
      desc: "Lancez cauZon, connectez-vous avec Google ou en mode invité et accédez immédiatement à vos cours."
    }
  ];

  return (
    <section id="apk-download" className="py-24 bg-gradient-to-b from-[#FAF6EB] via-[#F5EED8]/60 to-[#FAF6EB] border-b border-[#6B1124]/10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        <div className="bg-gradient-to-br from-[#6B1124] to-[#450815] rounded-[3rem] p-8 sm:p-12 lg:p-16 text-[#FAF6EB] shadow-2xl relative overflow-hidden">
          
          {/* Background Ambient Circles */}
          <div className="absolute top-0 right-0 w-96 h-96 bg-[#7F011F] rounded-full blur-3xl opacity-40 pointer-events-none" />
          <div className="absolute bottom-0 left-0 w-80 h-80 bg-[#10B981] rounded-full blur-3xl opacity-20 pointer-events-none" />

          <div className="relative z-10 grid lg:grid-cols-12 gap-12 items-center">
            
            {/* Left: Download CTA & Info */}
            <div className="lg:col-span-7 space-y-6">
              
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 text-xs font-bold text-emerald-300 border border-white/15">
                <ShieldCheck size={14} /> Fichier Officiel Certifié · Sans Virus · Android 8.0+
              </div>

              <h2 className="font-display text-3xl sm:text-4xl lg:text-5xl font-extrabold text-white leading-tight">
                Téléchargez l'application officielle cauZon (APK)
              </h2>

              <p className="text-base sm:text-lg text-creme-200/90 font-light leading-relaxed">
                Profitez de la meilleure expérience sur votre smartphone Android avec téléchargement des cours en local, lecture ultra-rapide et notifications des nouvelles annales publiées.
              </p>

              {/* Action Buttons */}
              <div className="pt-2 flex flex-col sm:flex-row gap-4">
                <button
                  onClick={handleDownloadApk}
                  className="px-8 py-4.5 rounded-2xl bg-[#10B981] hover:bg-emerald-600 text-white font-extrabold text-base flex items-center justify-center gap-3 shadow-xl glow-vert hover:scale-105 active:scale-95 transition-all"
                >
                  <Download size={22} />
                  <span>{downloadStarted ? 'Téléchargement lancé...' : "Télécharger l'APK Android (v1.0.0)"}</span>
                </button>

                <button
                  onClick={onOpenWebApp}
                  className="px-6 py-4.5 rounded-2xl bg-white/10 hover:bg-white/20 border border-white/20 text-white font-bold text-sm flex items-center justify-center gap-2 transition-all"
                >
                  <span>Pas de place ? Utiliser cauZon Web</span>
                  <ArrowRight size={16} />
                </button>
              </div>

              {/* Technical Specifications */}
              <div className="pt-4 grid grid-cols-3 gap-4 border-t border-white/15 text-xs text-creme-200/80">
                <div>
                  <span className="block text-gray-400 font-medium">Version</span>
                  <strong className="text-white font-bold">1.0.0 (Stable)</strong>
                </div>
                <div>
                  <span className="block text-gray-400 font-medium">Taille</span>
                  <strong className="text-white font-bold">~48 Mo</strong>
                </div>
                <div>
                  <span className="block text-gray-400 font-medium">Compatibilité</span>
                  <strong className="text-white font-bold">Android 8.0+</strong>
                </div>
              </div>

            </div>

            {/* Right: Step-by-Step Guide Card */}
            <div className="lg:col-span-5 bg-white/10 backdrop-blur-md rounded-3xl p-6 sm:p-8 border border-white/15 space-y-6">
              <h3 className="font-display text-xl font-bold text-white flex items-center gap-2">
                <Smartphone size={20} className="text-[#10B981]" />
                Installation en 3 étapes simples
              </h3>

              <div className="space-y-4">
                {steps.map((s, idx) => (
                  <div key={idx} className="flex items-start gap-4 p-3.5 rounded-2xl bg-black/20 border border-white/10">
                    <span className="w-8 h-8 rounded-xl bg-[#6B1124] text-white flex items-center justify-center font-extrabold text-xs flex-shrink-0 border border-white/20">
                      {s.num}
                    </span>
                    <div>
                      <h4 className="text-sm font-bold text-white">{s.title}</h4>
                      <p className="text-xs text-creme-200/80 mt-0.5 leading-relaxed">{s.desc}</p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="p-3 bg-emerald-500/20 border border-emerald-400/30 rounded-2xl flex items-center gap-3 text-xs text-emerald-200">
                <CheckCircle2 size={16} className="text-[#10B981] flex-shrink-0" />
                <span>100% Sécurisé et sans engagement obligatoire.</span>
              </div>

            </div>

          </div>

        </div>

      </div>
    </section>
  );
};

import React from 'react';
import { Download, Globe, CheckCircle2, Sparkles, BookOpen, ShieldCheck, Zap } from 'lucide-react';
import { InteractiveAppPreview } from './InteractiveAppPreview';

interface HeroProps {
  onOpenWebApp: () => void;
  onScrollToApk: () => void;
}

export const Hero: React.FC<HeroProps> = ({ onOpenWebApp, onScrollToApk }) => {
  return (
    <section className="relative overflow-hidden bg-gradient-to-b from-[#6B1124] via-[#520B1B] to-[#3D0613] text-[#FAF6EB] pt-12 pb-24 lg:pt-20 lg:pb-32">
      
      {/* Decorative background glow rings */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-7xl h-full overflow-hidden pointer-events-none opacity-25">
        <div className="absolute -top-40 left-1/4 w-[600px] h-[600px] rounded-full bg-red-500 blur-[130px]" />
        <div className="absolute top-1/2 right-10 w-[500px] h-[500px] rounded-full bg-emerald-600 blur-[140px]" />
      </div>

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid lg:grid-cols-12 gap-12 lg:gap-8 items-center">
          
          {/* Left Column: Headlines & Action CTA */}
          <div className="lg:col-span-7 space-y-8 text-center lg:text-left">
            
            {/* Top Pill Badge */}
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/10 backdrop-blur-md border border-white/20 text-xs font-semibold tracking-wide text-creme-200 shadow-sm">
              <Sparkles size={14} className="text-[#10B981]" />
              <span>Plateforme Académique Officielle · Côte d'Ivoire & Afrique</span>
            </div>

            {/* Main Headline */}
            <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl font-extrabold leading-[1.12] tracking-tight text-white">
              Réussissez vos études et concours avec{' '}
              <span className="text-[#FAF6EB] underline decoration-[#10B981] decoration-4 underline-offset-8">
                cauZon
              </span>
            </h1>

            {/* Sub-headline */}
            <p className="text-lg sm:text-xl text-creme-200/90 max-w-2xl font-light leading-relaxed">
              Annales corrigées des examens, fiches de révision et cours certifiés. Téléchargez l'application officielle Android (<strong className="font-semibold text-white">APK</strong>) ou accédez instantanément à l'application web depuis n'importe quel navigateur, sans encombrer votre téléphone.
            </p>

            {/* Dual CTAs */}
            <div className="flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-4 pt-2">
              
              {/* Web App Direct Launch */}
              <button
                onClick={onOpenWebApp}
                className="w-full sm:w-auto px-8 py-4 rounded-2xl bg-[#FAF6EB] text-[#6B1124] font-extrabold text-base hover:bg-white flex items-center justify-center gap-3 shadow-2xl hover:scale-105 active:scale-95 transition-all group"
              >
                <Globe size={20} className="text-[#6B1124] group-hover:rotate-12 transition-transform" />
                <span>Lancer l'Application Web</span>
                <span className="text-xs bg-[#6B1124]/10 text-[#6B1124] px-2 py-0.5 rounded-full font-bold">
                  Accès Direct
                </span>
              </button>

              {/* APK Download Button */}
              <button
                onClick={onScrollToApk}
                className="w-full sm:w-auto px-7 py-4 rounded-2xl bg-white/10 hover:bg-white/20 border border-white/25 text-white font-bold text-base flex items-center justify-center gap-3 backdrop-blur-sm transition-all"
              >
                <Download size={20} className="text-[#10B981]" />
                <span>Télécharger l'APK Android</span>
              </button>

            </div>

            {/* Highlights pills */}
            <div className="pt-4 grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs text-creme-200/90 font-medium">
              <div className="flex items-center gap-2">
                <CheckCircle2 size={16} className="text-[#10B981] flex-shrink-0" />
                <span>100% Mobile Money (FeexPay)</span>
              </div>
              <div className="flex items-center gap-2">
                <ShieldCheck size={16} className="text-[#10B981] flex-shrink-0" />
                <span>Mode Hors-ligne Sécurisé</span>
              </div>
              <div className="flex items-center gap-2 col-span-2 sm:col-span-1">
                <Zap size={16} className="text-[#10B981] flex-shrink-0" />
                <span>Import Cloud 75 Docs</span>
              </div>
            </div>

          </div>

          {/* Right Column: Interactive Phone Simulation Preview */}
          <div className="lg:col-span-5 flex justify-center">
            <InteractiveAppPreview onOpenWebApp={onOpenWebApp} />
          </div>

        </div>
      </div>

    </section>
  );
};

import React from 'react';
import { Globe, Download, ShieldCheck, Heart } from 'lucide-react';

interface FooterProps {
  onOpenWebApp: () => void;
  onScrollToApk: () => void;
}

export const Footer: React.FC<FooterProps> = ({ onOpenWebApp, onScrollToApk }) => {
  return (
    <footer className="bg-[#3D0613] text-[#FAF6EB] pt-16 pb-12 border-t border-[#6B1124]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-10 pb-12 border-b border-white/10">
          
          {/* Col 1: Brand & Bio */}
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-[#7F011F] text-[#FAF6EB] flex items-center justify-center font-display font-extrabold text-2xl border border-white/20">
                C
              </div>
              <span className="font-display font-extrabold text-2xl tracking-tight text-white">
                cauZon
              </span>
            </div>
            <p className="text-xs text-creme-200/80 leading-relaxed font-light">
              La plateforme académique de référence conçue pour accompagner la réussite des étudiants universitaires et des candidats aux concours d'excellence.
            </p>
            <div className="flex items-center gap-2 text-xs text-[#10B981] font-semibold">
              <ShieldCheck size={16} />
              <span>Paiements sécurisés par FeexPay</span>
            </div>
          </div>

          {/* Col 2: Navigation rapide */}
          <div className="space-y-3">
            <h4 className="text-sm font-bold uppercase tracking-wider text-white">
              Navigation
            </h4>
            <ul className="space-y-2 text-xs text-creme-200/80">
              <li>
                <a href="#fonctionnalites" className="hover:text-white transition-colors">Fonctionnalités Clés</a>
              </li>
              <li>
                <a href="#pass-vip" className="hover:text-white transition-colors">Formule Pass VIP</a>
              </li>
              <li>
                <a href="#apk-download" className="hover:text-white transition-colors">Guide de Téléchargement</a>
              </li>
              <li>
                <a href="#faq" className="hover:text-white transition-colors">Questions Fréquentes</a>
              </li>
            </ul>
          </div>

          {/* Col 3: Accès direct */}
          <div className="space-y-3">
            <h4 className="text-sm font-bold uppercase tracking-wider text-white">
              Accès Plateforme
            </h4>
            <div className="space-y-2.5">
              <button
                onClick={onOpenWebApp}
                className="w-full py-2.5 px-4 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold flex items-center justify-center gap-2 transition-colors"
              >
                <Globe size={14} />
                Lancer cauZon Web
              </button>
              <button
                onClick={onScrollToApk}
                className="w-full py-2.5 px-4 rounded-xl bg-[#10B981] hover:bg-emerald-600 text-white text-xs font-bold flex items-center justify-center gap-2 transition-colors"
              >
                <Download size={14} />
                Télécharger l'APK Android
              </button>
            </div>
          </div>

          {/* Col 4: Support & Contact */}
          <div className="space-y-3">
            <h4 className="text-sm font-bold uppercase tracking-wider text-white">
              Assistance & Partenariats
            </h4>
            <p className="text-xs text-creme-200/80 leading-relaxed">
              Une question sur vos cours ou votre compte ? Notre équipe est disponible.
            </p>
            <div className="text-xs text-creme-200 font-semibold space-y-1">
              <div>📧 contact@cauzon.app</div>
              <div>📍 Abidjan, Côte d'Ivoire</div>
            </div>
          </div>

        </div>

        {/* Bottom Copyright */}
        <div className="pt-8 flex flex-col sm:flex-row items-center justify-between text-xs text-creme-200/60 gap-4">
          <p>© {new Date().getFullYear()} cauZon. Tous droits réservés.</p>
          <p className="flex items-center gap-1">
            Fait avec <Heart size={13} className="text-red-500 fill-red-500" /> pour les étudiants.
          </p>
        </div>

      </div>
    </footer>
  );
};

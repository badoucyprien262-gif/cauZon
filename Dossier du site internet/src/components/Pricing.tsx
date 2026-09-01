import React from 'react';
import { Check, Crown, Sparkles, Zap, Gift } from 'lucide-react';

interface PricingProps {
  onOpenWebApp: () => void;
}

export const Pricing: React.FC<PricingProps> = ({ onOpenWebApp }) => {
  return (
    <section id="pass-vip" className="py-24 bg-[#FAF6EB] border-b border-[#6B1124]/10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto space-y-4">
          <span className="text-xs font-extrabold uppercase tracking-widest text-[#6B1124] bg-[#6B1124]/10 px-3.5 py-1.5 rounded-full">
            Tarifs Étudiants Équitables & Transparents
          </span>
          <h2 className="font-display text-3xl sm:text-4xl lg:text-5xl font-extrabold text-gray-900 tracking-tight">
            Choisissez la formule qui s'adapte à vos révisions
          </h2>
          <p className="text-base sm:text-lg text-gray-600 font-light">
            Zéro engagement, paiement instantané par Mobile Money (Wave, Orange, MTN, Moov).
          </p>
        </div>

        {/* Pricing Cards Grid */}
        <div className="mt-16 grid lg:grid-cols-3 gap-8 items-stretch">
          
          {/* Card 1: Découverte */}
          <div className="bg-white rounded-3xl p-8 border border-gray-200/80 shadow-sm flex flex-col justify-between hover:shadow-lg transition-all">
            <div>
              <div className="flex items-center justify-between mb-4">
                <span className="text-xs font-bold uppercase tracking-wider text-gray-500 bg-gray-100 px-3 py-1 rounded-full">
                  Découverte
                </span>
                <Gift className="text-[#6B1124] w-6 h-6" />
              </div>
              <h3 className="font-display text-2xl font-extrabold text-gray-900">
                1er Cours Offert
              </h3>
              <p className="text-sm text-gray-600 mt-2">
                Idéal pour tester la qualité des corrigés et la clarté des synthèses.
              </p>
              
              <div className="my-6">
                <span className="text-4xl font-extrabold text-gray-900">0 FCFA</span>
                <span className="text-gray-500 text-sm font-medium ml-2">Sans carte bancaire</span>
              </div>

              <ul className="space-y-3 text-sm text-gray-700">
                <li className="flex items-center gap-2">
                  <Check size={16} className="text-[#10B981] flex-shrink-0" />
                  <span>1 document complet au choix débloqué</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check size={16} className="text-[#10B981] flex-shrink-0" />
                  <span>Aperçu gratuit de tous les cours</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check size={16} className="text-[#10B981] flex-shrink-0" />
                  <span>Accès Web et Mobile</span>
                </li>
              </ul>
            </div>

            <button
              onClick={onOpenWebApp}
              className="mt-8 w-full py-3.5 rounded-2xl border border-[#6B1124] text-[#6B1124] hover:bg-[#6B1124]/5 font-bold text-sm transition-all"
            >
              Essayer gratuitement
            </button>
          </div>

          {/* Card 2: Location Mensuelle (HIGHLIGHTED) */}
          <div className="bg-gradient-to-b from-[#6B1124] to-[#450815] rounded-3xl p-8 text-[#FAF6EB] shadow-2xl relative flex flex-col justify-between transform lg:-translate-y-4 border-2 border-[#10B981]">
            
            {/* Top Badge */}
            <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-[#10B981] text-white text-xs font-extrabold px-4 py-1.5 rounded-full shadow-md uppercase tracking-wider flex items-center gap-1.5">
              <Sparkles size={13} /> Recommandé pour les examens
            </div>

            <div>
              <div className="flex items-center justify-between mb-4 mt-2">
                <span className="text-xs font-bold uppercase tracking-wider text-emerald-300 bg-white/10 px-3 py-1 rounded-full">
                  Accès Intégral
                </span>
                <Crown className="text-[#FAF6EB] w-7 h-7" />
              </div>
              <h3 className="font-display text-2xl font-extrabold text-white">
                Location Mensuelle
              </h3>
              <p className="text-sm text-creme-200/90 mt-2">
                Accédez à tout le catalogue académique et importez vos propres documents.
              </p>
              
              <div className="my-6">
                <span className="text-4xl font-extrabold text-white">500 FCFA</span>
                <span className="text-creme-200/80 text-sm font-medium ml-2">/ 30 jours net</span>
              </div>

              <ul className="space-y-3 text-sm text-creme-100">
                <li className="flex items-center gap-2">
                  <Check size={16} className="text-[#10B981] flex-shrink-0" />
                  <strong className="text-white">Accès illimité à tous les cours et annales</strong>
                </li>
                <li className="flex items-center gap-2">
                  <Check size={16} className="text-[#10B981] flex-shrink-0" />
                  <strong className="text-white">Import & Stockage de 75 documents PDF personnels</strong>
                </li>
                <li className="flex items-center gap-2">
                  <Check size={16} className="text-[#10B981] flex-shrink-0" />
                  <span>Mode hors-ligne complet sur Mobile & Web</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check size={16} className="text-[#10B981] flex-shrink-0" />
                  <span>Frais marchands inclus (prix rond sans supplément)</span>
                </li>
              </ul>
            </div>

            <button
              onClick={onOpenWebApp}
              className="mt-8 w-full py-4 rounded-2xl bg-[#10B981] hover:bg-emerald-600 text-white font-extrabold text-sm shadow-xl glow-vert hover:scale-105 active:scale-95 transition-all"
            >
              Louer pour 30 jours (500 FCFA)
            </button>
          </div>

          {/* Card 3: À l'acte */}
          <div className="bg-white rounded-3xl p-8 border border-gray-200/80 shadow-sm flex flex-col justify-between hover:shadow-lg transition-all">
            <div>
              <div className="flex items-center justify-between mb-4">
                <span className="text-xs font-bold uppercase tracking-wider text-gray-500 bg-gray-100 px-3 py-1 rounded-full">
                  À la carte
                </span>
                <Zap className="text-[#10B981] w-6 h-6" />
              </div>
              <h3 className="font-display text-2xl font-extrabold text-gray-900">
                Achat à l'Acte
              </h3>
              <p className="text-sm text-gray-600 mt-2">
                Payez uniquement le cours ou l'épreuve spécifique dont vous avez besoin.
              </p>
              
              <div className="my-6">
                <span className="text-4xl font-extrabold text-gray-900">100 FCFA</span>
                <span className="text-gray-500 text-sm font-medium ml-2">/ document</span>
              </div>

              <ul className="space-y-3 text-sm text-gray-700">
                <li className="flex items-center gap-2">
                  <Check size={16} className="text-[#10B981] flex-shrink-0" />
                  <span>Accès à vie pour le document acheté</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check size={16} className="text-[#10B981] flex-shrink-0" />
                  <span>Lecture et téléchargement hors-ligne</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check size={16} className="text-[#10B981] flex-shrink-0" />
                  <span>Paiement par Wave / Orange / MTN / Moov</span>
                </li>
              </ul>
            </div>

            <button
              onClick={onOpenWebApp}
              className="mt-8 w-full py-3.5 rounded-2xl bg-[#6B1124] text-white hover:bg-bordeaux-800 font-bold text-sm transition-all"
            >
              Parcourir le catalogue
            </button>
          </div>

        </div>

        {/* Extension de Stockage Personnel (+75 Docs) Banner */}
        <div className="mt-12 bg-white rounded-3xl p-6 sm:p-8 border border-gray-200 shadow-sm flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-[#FAF6EB] border border-[#6B1124]/15 flex items-center justify-center text-[#6B1124] flex-shrink-0">
              <Sparkles size={24} className="text-[#10B981]" />
            </div>
            <div>
              <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full bg-[#6B1124]/10 text-xs font-bold text-[#6B1124] mb-1">
                Option Complémentaire
              </div>
              <h4 className="text-lg font-bold text-gray-900">
                Extension de Stockage Cloud Personnel (+75 Documents)
              </h4>
              <p className="text-xs sm:text-sm text-gray-600">
                Augmentez votre capacité d'importation pour héberger tous vos fascicules de TD, mémoires et PDF externes.
              </p>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row items-center gap-4 flex-shrink-0 w-full md:w-auto">
            <div className="text-center md:text-right">
              <span className="text-2xl font-extrabold text-gray-900">1 000 FCFA</span>
              <span className="block text-[11px] text-gray-500 font-medium">Prix net / pack de 75 docs</span>
            </div>
            <button
              onClick={onOpenWebApp}
              className="w-full sm:w-auto px-6 py-3 rounded-xl bg-[#6B1124] hover:bg-bordeaux-800 text-white font-bold text-xs shadow transition-all"
            >
              Ajouter 75 Documents
            </button>
          </div>
        </div>

      </div>
    </section>
  );
};

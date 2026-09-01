import React, { useState } from 'react';
import { ChevronDown, ChevronUp, HelpCircle } from 'lucide-react';

export const FAQ: React.FC = () => {
  const [openIdx, setOpenIdx] = useState<number | null>(0);

  const questions = [
    {
      q: "Comment accéder à cauZon sans télécharger l'application ?",
      a: "Vous pouvez cliquer directement sur 'Lancer l'Application Web' depuis notre site. L'interface s'ouvre immédiatement dans votre navigateur (sur PC, Mac, tablette ou smartphone) sans nécessiter aucune installation."
    },
    {
      q: "Comment payer avec Wave, Orange Money, MTN MoMo ou Moov Money ?",
      a: "Lors de l'achat d'un cours ou de la souscription au Pass VIP (500 FCFA), sélectionnez simplement votre moyen de paiement habituel. Grâce à notre passerelle sécurisée FeexPay, la validation s'effectue en quelques secondes sur votre téléphone."
    },
    {
      q: "L'application fonctionne-t-elle sans connexion Internet ?",
      a: "Oui ! Tous les documents que vous avez débloqués ou téléchargés dans votre espace restent accessibles à 100% en mode hors-ligne, même sans réseau."
    },
    {
      q: "Pourquoi installer le fichier APK plutôt que le Play Store ?",
      a: "L'APK officiel cauZon vous permet de bénéficier des toutes dernières mises à jour en avant-première, sans attendre les délais de publication des magasins d'applications et avec un poids optimisé pour votre forfait mobile."
    },
    {
      q: "Mes documents restent-ils accessibles si je change de téléphone ?",
      a: "Absolument ! Si vous vous connectez avec votre compte Google ou votre profil, toutes vos acquisitions et votre statut VIP sont automatiquement synchronisés sur votre nouvel appareil."
    }
  ];

  return (
    <section id="faq" className="py-24 bg-[#FAF6EB] border-b border-[#6B1124]/10">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        
        <div className="text-center space-y-4 mb-16">
          <span className="text-xs font-extrabold uppercase tracking-widest text-[#6B1124] bg-[#6B1124]/10 px-3.5 py-1.5 rounded-full">
            Questions Fréquentes
          </span>
          <h2 className="font-display text-3xl sm:text-4xl font-extrabold text-gray-900">
            Tout ce que vous devez savoir sur cauZon
          </h2>
        </div>

        <div className="space-y-4">
          {questions.map((item, idx) => {
            const isOpen = openIdx === idx;
            return (
              <div
                key={idx}
                className="bg-white rounded-2xl border border-gray-200/80 overflow-hidden shadow-sm transition-all"
              >
                <button
                  onClick={() => setOpenIdx(isOpen ? null : idx)}
                  className="w-full px-6 py-5 text-left flex items-center justify-between gap-4 hover:bg-gray-50/50 transition-colors"
                >
                  <span className="font-bold text-gray-900 text-base sm:text-lg">
                    {item.q}
                  </span>
                  <span className="text-[#6B1124] p-1 rounded-lg bg-[#FAF6EB]">
                    {isOpen ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                  </span>
                </button>

                {isOpen && (
                  <div className="px-6 pb-6 text-sm sm:text-base text-gray-600 leading-relaxed border-t border-gray-100 pt-4 bg-[#FAF6EB]/20 font-light">
                    {item.a}
                  </div>
                )}
              </div>
            );
          })}
        </div>

      </div>
    </section>
  );
};

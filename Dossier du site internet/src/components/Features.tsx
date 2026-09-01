import React from 'react';
import { BookOpen, Crown, Smartphone, WifiOff, ShieldCheck, Zap, CreditCard, Award } from 'lucide-react';

export const Features: React.FC = () => {
  const list = [
    {
      icon: <BookOpen className="w-6 h-6 text-[#6B1124]" />,
      title: "Annales & Cours d'Excellence",
      desc: "Des sujets d'examens complets, des TD et des cours corrigés rédigés par les meilleurs enseignants universitaires et majors de promotion."
    },
    {
      icon: <Crown className="w-6 h-6 text-[#6B1124]" />,
      title: "Location Mensuelle (500F / 30j)",
      desc: "Accédez à tout le catalogue en illimité et importez jusqu'à 75 documents PDF personnels dans votre espace cloud sécurisé."
    },
    {
      icon: <Smartphone className="w-6 h-6 text-[#6B1124]" />,
      title: "Double Accès : Web & Mobile",
      desc: "Travaillez sur votre téléphone Android avec l'APK ou ouvrez directement cauZon sur votre ordinateur portable via le Web sans rien installer."
    },
    {
      icon: <WifiOff className="w-6 h-6 text-[#10B981]" />,
      title: "Lecture 100% Hors-Ligne",
      desc: "Téléchargez vos épreuves une seule fois. Révisez à tout moment en amphi, au foyer ou à la bibliothèque, même sans connexion Internet."
    },
    {
      icon: <CreditCard className="w-6 h-6 text-[#10B981]" />,
      title: "Paiement Mobile Money Simplifié",
      desc: "Payez vos documents à l'unité dès 100 FCFA via Wave, Orange Money, MTN MoMo, Moov Money et Carte Bancaire avec FeexPay."
    },
    {
      icon: <ShieldCheck className="w-6 h-6 text-[#6B1124]" />,
      title: "Visualiseur PDF Haute Sécurité",
      desc: "Lecture ultra-fluide avec zoom intelligent, protection contre la corruption de fichiers et conservation à vie de vos documents débloqués."
    }
  ];

  return (
    <section id="fonctionnalites" className="py-24 bg-[#FAF6EB] border-b border-[#6B1124]/10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto space-y-4">
          <span className="text-xs font-extrabold uppercase tracking-widest text-[#6B1124] bg-[#6B1124]/10 px-3.5 py-1.5 rounded-full">
            Tout pour maximiser votre réussite
          </span>
          <h2 className="font-display text-3xl sm:text-4xl lg:text-5xl font-extrabold text-gray-900 tracking-tight">
            Une expérience pensée pour les étudiants modernes
          </h2>
          <p className="text-base sm:text-lg text-gray-600 font-light">
            cauZon résout définitivement le problème des photocopies illisibles, des fascicules égarés et des frais excessifs.
          </p>
        </div>

        {/* Features Grid */}
        <div className="mt-16 grid md:grid-cols-2 lg:grid-cols-3 gap-8">
          {list.map((item, idx) => (
            <div
              key={idx}
              className="bg-white p-8 rounded-3xl border border-gray-200/80 shadow-sm hover:shadow-xl hover:border-[#6B1124]/30 hover:-translate-y-1 transition-all duration-300 flex flex-col justify-between"
            >
              <div>
                <div className="w-12 h-12 rounded-2xl bg-[#FAF6EB] border border-[#6B1124]/15 flex items-center justify-center mb-6 shadow-sm">
                  {item.icon}
                </div>
                <h3 className="font-display text-xl font-bold text-gray-900 mb-3">
                  {item.title}
                </h3>
                <p className="text-sm text-gray-600 leading-relaxed font-normal">
                  {item.desc}
                </p>
              </div>
              <div className="mt-6 pt-4 border-t border-gray-100 flex items-center gap-1 text-xs font-bold text-[#6B1124]">
                <span>En savoir plus</span>
                <span>→</span>
              </div>
            </div>
          ))}
        </div>

      </div>
    </section>
  );
};

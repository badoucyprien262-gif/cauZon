import React, { useState } from 'react';
import { Download, Globe, Menu, X, BookOpen, Crown, Shield, Smartphone } from 'lucide-react';

interface NavbarProps {
  onOpenWebApp: () => void;
  onScrollToApk: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ onOpenWebApp, onScrollToApk }) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 bg-creme/90 backdrop-blur-md border-b border-bordeaux/10 transition-all">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-20">
          
          {/* Logo */}
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
            <div className="w-11 h-11 rounded-2xl bg-bordeaux text-creme flex items-center justify-center font-display font-extrabold text-2xl shadow-md transform hover:rotate-3 transition-transform">
              C
            </div>
            <div>
              <span className="font-display font-extrabold text-2xl tracking-tight text-bordeaux block leading-none">
                cauZon
              </span>
              <span className="text-[10px] font-semibold tracking-wider text-gray-500 uppercase block mt-0.5">
                Excellence Académique
              </span>
            </div>
          </div>

          {/* Desktop Navigation Links */}
          <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-gray-700">
            <a href="#catalogue" className="hover:text-bordeaux transition-colors flex items-center gap-1.5">
              <BookOpen size={16} className="text-bordeaux" /> Épreuves & Cours
            </a>
            <a href="#fonctionnalites" className="hover:text-bordeaux transition-colors flex items-center gap-1.5">
              <Smartphone size={16} className="text-bordeaux" /> Fonctionnalités
            </a>
            <a href="#pass-vip" className="hover:text-bordeaux transition-colors flex items-center gap-1.5">
              <Crown size={16} className="text-bordeaux" /> Pass VIP
            </a>
            <a href="#securite" className="hover:text-bordeaux transition-colors flex items-center gap-1.5">
              <Shield size={16} className="text-vert" /> Sécurité
            </a>
          </nav>

          {/* Action CTAs */}
          <div className="hidden lg:flex items-center gap-3">
            {/* APK Download Button */}
            <button
              onClick={onScrollToApk}
              className="px-4 py-2.5 rounded-xl border border-bordeaux/20 text-bordeaux font-semibold text-sm hover:bg-bordeaux/5 flex items-center gap-2 transition-all"
            >
              <Download size={16} />
              Télécharger l'APK
            </button>

            {/* Direct Web Launch Button */}
            <button
              onClick={onOpenWebApp}
              className="px-5 py-2.5 rounded-xl bg-bordeaux text-creme font-bold text-sm hover:bg-bordeaux-800 flex items-center gap-2 shadow-md glow-bordeaux hover:scale-[1.02] active:scale-[0.98] transition-all"
            >
              <Globe size={16} />
              Lancer cauZon Web
            </button>
          </div>

          {/* Mobile menu button */}
          <div className="flex md:hidden items-center gap-2">
            <button
              onClick={onOpenWebApp}
              className="px-3 py-1.5 bg-bordeaux text-creme rounded-lg font-bold text-xs flex items-center gap-1"
            >
              <Globe size={13} />
              Web
            </button>
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 rounded-xl text-gray-700 hover:text-bordeaux hover:bg-bordeaux/5"
            >
              {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
          </div>

        </div>
      </div>

      {/* Mobile Drawer Menu */}
      {mobileMenuOpen && (
        <div className="md:hidden border-b border-bordeaux/10 bg-creme px-6 py-5 flex flex-col gap-4 shadow-xl animate-fadeIn">
          <a
            href="#catalogue"
            onClick={() => setMobileMenuOpen(false)}
            className="flex items-center gap-3 text-base font-semibold text-gray-800 hover:text-bordeaux"
          >
            <BookOpen size={18} className="text-bordeaux" /> Épreuves & Cours
          </a>
          <a
            href="#fonctionnalites"
            onClick={() => setMobileMenuOpen(false)}
            className="flex items-center gap-3 text-base font-semibold text-gray-800 hover:text-bordeaux"
          >
            <Smartphone size={18} className="text-bordeaux" /> Fonctionnalités
          </a>
          <a
            href="#pass-vip"
            onClick={() => setMobileMenuOpen(false)}
            className="flex items-center gap-3 text-base font-semibold text-gray-800 hover:text-bordeaux"
          >
            <Crown size={18} className="text-bordeaux" /> Pass VIP
          </a>
          <a
            href="#securite"
            onClick={() => setMobileMenuOpen(false)}
            className="flex items-center gap-3 text-base font-semibold text-gray-800 hover:text-bordeaux"
          >
            <Shield size={18} className="text-vert" /> Sécurité & Mobile Money
          </a>
          
          <div className="pt-3 border-t border-gray-200 flex flex-col gap-2.5">
            <button
              onClick={() => { setMobileMenuOpen(false); onOpenWebApp(); }}
              className="w-full py-3 bg-bordeaux text-creme rounded-xl font-bold text-sm flex items-center justify-center gap-2 shadow-md"
            >
              <Globe size={18} />
              Accéder à cauZon Web (Direct)
            </button>
            <button
              onClick={() => { setMobileMenuOpen(false); onScrollToApk(); }}
              className="w-full py-3 border border-bordeaux/30 text-bordeaux rounded-xl font-semibold text-sm flex items-center justify-center gap-2"
            >
              <Download size={18} />
              Télécharger l'APK Android (Gratuit)
            </button>
          </div>
        </div>
      )}
    </header>
  );
};

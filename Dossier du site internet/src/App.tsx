import React, { useState } from 'react';
import { Navbar } from './components/Navbar';
import { Hero } from './components/Hero';
import { Features } from './components/Features';
import { ApkDownload } from './components/ApkDownload';
import { Pricing } from './components/Pricing';
import { FAQ } from './components/FAQ';
import { Footer } from './components/Footer';
import { LiveWebModal } from './components/LiveWebModal';

export default function App() {
  const [isWebModalOpen, setIsWebModalOpen] = useState(false);

  const handleOpenWebApp = () => {
    setIsWebModalOpen(true);
  };

  const handleScrollToApk = () => {
    const el = document.getElementById('apk-download');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#FAF6EB] text-gray-900 selection:bg-[#6B1124] selection:text-[#FAF6EB]">
      {/* Top Navbar */}
      <Navbar onOpenWebApp={handleOpenWebApp} onScrollToApk={handleScrollToApk} />

      {/* Main Content Sections */}
      <main className="flex-1">
        <Hero onOpenWebApp={handleOpenWebApp} onScrollToApk={handleScrollToApk} />
        <Features />
        <ApkDownload onOpenWebApp={handleOpenWebApp} />
        <Pricing onOpenWebApp={handleOpenWebApp} />
        <FAQ />
      </main>

      {/* Footer */}
      <Footer onOpenWebApp={handleOpenWebApp} onScrollToApk={handleScrollToApk} />

      {/* Live Web Modal (Opens direct web app in iframe simulator & external link) */}
      <LiveWebModal isOpen={isWebModalOpen} onClose={() => setIsWebModalOpen(false)} />
    </div>
  );
}

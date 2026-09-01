import React, { useState } from 'react';
import { Plus, BookOpen, BellRing, Edit3, Trash2, CheckCircle, AlignLeft, Hash, FunctionSquare, Scale, Table, CheckSquare, Lightbulb, AlertTriangle, Target, ArrowUp, ArrowDown, Download, Copy } from 'lucide-react';
import type { BannerRow, DocumentRow } from '../types';
import { BannerWizard } from '../components/BannerWizard';
import { saveBanner, deleteBanner, toggleBannerStatus } from '../services/serviceBanners';

interface StudioViewProps {
  banners: BannerRow[];
  setBanners: React.Dispatch<React.SetStateAction<BannerRow[]>>;
  documents: DocumentRow[];
  darkMode: boolean;
  onReload: () => void;
  studioTab?: 'banners' | 'editor';
  setStudioTab?: (tab: 'banners' | 'editor') => void;
}

type StudioTab = 'banners' | 'editor';

export type BlockType =
  | 'title'
  | 'subtitle'
  | 'paragraph'
  | 'formula'
  | 'law_article'
  | 'table'
  | 'qcm'
  | 'callout_note'
  | 'callout_warning'
  | 'callout_exam';

export interface StudioBlock {
  id: string;
  type: BlockType;
  title?: string;
  content: string;
  subContent?: string;
  extraData?: Record<string, any>;
}

const IMPORTANCE_COLORS: Record<string, string> = { info: '#3B82F6', promo: '#10B981', urgent: '#E74C3C' };
const IMPORTANCE_BG: Record<string, string> = { info: '#EFF6FF', promo: '#ECFDF5', urgent: '#FEF2F2' };

const INITIAL_BLOCKS: StudioBlock[] = [
  {
    id: 'b1',
    type: 'title',
    content: 'COURS MAGISTRAL : INTRODUCTION AUX SCIENCES PHYSIQUES & JURIDIQUES',
    title: 'Université cauZon — Semestre 1',
  },
  {
    id: 'b2',
    type: 'callout_exam',
    title: '🎯 Objectifs Pédagogiques & Barème Examen',
    content: 'Ce chapitre constitue 35% de la note finale de l\'examen terminal. Maîtrisez les lois fondamentales et les formules associées.',
  },
  {
    id: 'b3',
    type: 'subtitle',
    content: 'Section 1 : Principes Fondamentaux & Formulation Mathématique',
  },
  {
    id: 'b4',
    type: 'paragraph',
    content: 'L\'énergie cinétique d\'un solide en translation rectiligne est directement proportionnelle à sa masse et au carré de sa vitesse instantanée.',
  },
  {
    id: 'b5',
    type: 'formula',
    title: 'Formule Fondamentale (Énergie Cinétique)',
    content: 'E_c = \\frac{1}{2} m \\cdot v^2',
    subContent: 'Avec m en kilogrammes (kg), v en mètres par seconde (m/s) et Ec en Joules (J).',
  },
  {
    id: 'b6',
    type: 'law_article',
    title: 'Article 1382 du Code Civil — Responsabilité du Fait Personnel',
    content: 'Tout fait quelconque de l\'homme, qui cause à autrui un dommage, oblige celui par la faute duquel il est arrivé, à le réparer.',
    subContent: 'Alinéa 1er — Jurisprudence constante.',
  },
  {
    id: 'b7',
    type: 'table',
    title: 'Tableau Comparatif des Constantes Fondamentales',
    content: JSON.stringify({
      headers: ['Grandeur', 'Symbole', 'Valeur SI', 'Unité'],
      rows: [
        ['Vitesse de la lumière', 'c', '3,00 × 10⁸', 'm·s⁻¹'],
        ['Constante de Planck', 'h', '6,626 × 10⁻³⁴', 'J·s'],
        ['Accélération de la pesanteur', 'g', '9,81', 'm·s⁻²'],
      ],
    }),
  },
  {
    id: 'b8',
    type: 'qcm',
    title: 'Question d\'évaluation formative (QCM)',
    content: 'Quelle est la dimension exacte d\'une force en analyse dimensionnelle ?',
    extraData: {
      options: ['[M] · [L] · [T]⁻²', '[M] · [L]² · [T]⁻¹', '[M] · [L]⁻¹ · [T]', '[M]² · [L] · [T]⁻²'],
      correctIndex: 0,
      explanation: 'La force est le produit d\'une masse par une accélération : F = m · a = kg · m · s⁻².',
    },
  },
  {
    id: 'b9',
    type: 'callout_warning',
    title: '⚠️ Attention aux pièges d\'unités lors des calculs',
    content: 'Pensez toujours à convertir les kilomètres par heure (km/h) en mètres par seconde (m/s) en divisant par 3,6 avant d\'appliquer la formule !',
  },
];

export function StudioView({
  banners,
  setBanners,
  documents,
  darkMode,
  onReload,
  studioTab: propStudioTab,
  setStudioTab: propSetStudioTab
}: StudioViewProps) {
  const [internalStudioTab, setInternalStudioTab] = useState<StudioTab>('editor');
  const studioTab = propStudioTab ?? internalStudioTab;
  const setStudioTab = propSetStudioTab ?? setInternalStudioTab;
  const [showBannerWizard, setShowBannerWizard] = useState(false);
  const [editingBanner, setEditingBanner] = useState<BannerRow | null>(null);

  // Rich Academic Blocks State
  const [blocks, setBlocks] = useState<StudioBlock[]>(INITIAL_BLOCKS);
  const [docTitle, setDocTitle] = useState('Nouveau Polycopié de Cours cauZon');

  const textColor = darkMode ? '#FAF6EB' : '#1F2937';
  const subText = darkMode ? '#9CA3AF' : '#6B7280';
  const border = darkMode ? '#2D1220' : '#E5E7EB';
  const cardBg = darkMode ? '#1e1e1e' : '#FFFFFF';
  const inputBg = darkMode ? '#121212' : '#F9FAFB';

  const handleSaveBanner = async (data: Omit<BannerRow, 'id' | 'created_at'>, editingId: string | null) => {
    await saveBanner(data, editingId);
    onReload();
  };

  const handleDeleteBanner = async (id: string) => {
    if (!window.confirm('Supprimer cette bannière ?')) return;
    await deleteBanner(id);
    setBanners(prev => prev.filter(b => b.id !== id));
  };

  const handleToggleStatus = async (b: BannerRow) => {
    await toggleBannerStatus(b.id, b.statut);
    setBanners(prev => prev.map(bb => bb.id === b.id ? { ...bb, statut: bb.statut === 'actif' ? 'inactif' : 'actif' } : bb));
  };

  // Block management
  const addBlock = (type: BlockType) => {
    const id = `block_${Date.now()}`;
    let newBlock: StudioBlock = { id, type, content: '' };

    switch (type) {
      case 'title':
        newBlock = { id, type, title: 'Sous-titre institutionnel', content: 'TITRE PRINCIPAL DU DOCUMENT' };
        break;
      case 'subtitle':
        newBlock = { id, type, content: 'Chapitre I : Titre de la section' };
        break;
      case 'paragraph':
        newBlock = { id, type, content: 'Saisissez ici le texte explicatif de votre cours académique…' };
        break;
      case 'formula':
        newBlock = {
          id,
          type,
          title: 'Formule / Équation mathématique',
          content: 'f(x) = \\int_{a}^{b} \\frac{P(x)}{Q(x)} dx',
          subContent: 'Conditions de validité et domaine de définition.',
        };
        break;
      case 'law_article':
        newBlock = {
          id,
          type,
          title: 'Article N du Code Juridique',
          content: 'Texte officiel de la disposition légale ou réglementaire…',
          subContent: 'Alinéa unique — Entrée en vigueur immédiate.',
        };
        break;
      case 'table':
        newBlock = {
          id,
          type,
          title: 'Tableau Récapitulatif',
          content: JSON.stringify({
            headers: ['Colonne A', 'Colonne B', 'Colonne C'],
            rows: [
              ['Donnée 1', 'Donnée 2', 'Donnée 3'],
              ['Donnée 4', 'Donnée 5', 'Donnée 6'],
            ],
          }),
        };
        break;
      case 'qcm':
        newBlock = {
          id,
          type,
          title: 'Question d\'évaluation (QCM)',
          content: 'Énoncé de la question à choix multiples ?',
          extraData: {
            options: ['Option A (Exemple)', 'Option B (Exemple)', 'Option C (Exemple)', 'Option D (Exemple)'],
            correctIndex: 0,
            explanation: 'Justification de la bonne réponse.',
          },
        };
        break;
      case 'callout_note':
        newBlock = {
          id,
          type,
          title: '💡 Remarque & Astuce Méthodologique',
          content: 'Conseil clé pour réussir les exercices et mémoriser le cours.',
        };
        break;
      case 'callout_warning':
        newBlock = {
          id,
          type,
          title: '⚠️ Attention / Piège d\'Examen',
          content: 'Erreur classique commise par les étudiants à éviter absolument.',
        };
        break;
      case 'callout_exam':
        newBlock = {
          id,
          type,
          title: '🎯 Sujet d\'Examen Type / Exercice d\'Application (5 Points)',
          content: 'Énoncé complet du problème avec les consignes de rédaction requises.',
        };
        break;
    }

    setBlocks(prev => [...prev, newBlock]);
  };

  const updateBlock = (id: string, field: keyof StudioBlock, value: any) => {
    setBlocks(prev => prev.map(b => b.id === id ? { ...b, [field]: value } : b));
  };

  const moveBlock = (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= blocks.length) return;
    const updated = [...blocks];
    const temp = updated[index];
    updated[index] = updated[targetIndex];
    updated[targetIndex] = temp;
    setBlocks(updated);
  };

  const duplicateBlock = (block: StudioBlock) => {
    const duplicated: StudioBlock = {
      ...JSON.parse(JSON.stringify(block)),
      id: `block_${Date.now()}`,
    };
    setBlocks(prev => [...prev, duplicated]);
  };

  const deleteBlock = (id: string) => {
    setBlocks(prev => prev.filter(b => b.id !== id));
  };

  const handleExportPdf = () => {
    window.print();
  };

  return (
    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', paddingBottom: studioTab === 'editor' ? '0px' : '80px' }}>
      {/* ----------------- TAB 1 : ÉDITEUR ACADÉMIQUE COMPLET (LAYOUT SPLIT & SCROLL FLUIDE) ----------------- */}
      {studioTab === 'editor' && (
        <div className="studio-editor-container" style={{ display: 'flex', width: '100%', position: 'relative' }}>
          
          {/* Palette d'outils latérale (Strictement Fixe et Immobile, bornée au-dessus de la BottomNav) */}
          <div className="studio-palette-sidebar print-hide" style={{
            width: '330px',
            position: 'fixed',
            top: '76px',
            bottom: '76px',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
            paddingRight: '8px',
            paddingBottom: '20px',
            zIndex: 30
          }}>
            
            {/* Actions supérieures */}
            <div style={{ backgroundColor: cardBg, border: `1px solid ${border}`, borderRadius: '12px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px', position: 'sticky', top: 0, zIndex: 10, backdropFilter: 'blur(8px)' }}>
              <label style={{ fontSize: '12px', fontWeight: 700, color: subText, textTransform: 'uppercase' }}>Titre du document</label>
              <input
                value={docTitle}
                onChange={e => setDocTitle(e.target.value)}
                style={{ padding: '8px 12px', borderRadius: '8px', border: `1px solid ${border}`, backgroundColor: inputBg, color: textColor, fontSize: '13px', fontWeight: 600, outline: 'none' }}
              />
              <button
                onClick={handleExportPdf}
                style={{ padding: '10px', backgroundColor: '#6B1124', color: '#FAF6EB', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 700, fontSize: '13px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', boxShadow: '0 2px 8px rgba(107,17,36,0.2)' }}
              >
                <Download size={15} /> Imprimer / Exporter en PDF
              </button>
            </div>

            {/* Palette des blocs */}
            <div style={{ backgroundColor: cardBg, border: `1px solid ${border}`, borderRadius: '12px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <span style={{ fontSize: '13px', fontWeight: 800, color: textColor, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Palette de Blocs Académiques
              </span>

              {/* Groupe 1 : Structure & Textes */}
              <div>
                <span style={{ fontSize: '11px', fontWeight: 700, color: subText, textTransform: 'uppercase', marginBottom: '8px', display: 'block' }}>
                  Structure & Textes
                </span>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                  <button onClick={() => addBlock('title')} style={{ padding: '8px', border: `1px solid ${border}`, borderRadius: '6px', background: 'none', color: textColor, cursor: 'pointer', fontSize: '12px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Hash size={14} color="#6B1124" /> Titre H1
                  </button>
                  <button onClick={() => addBlock('subtitle')} style={{ padding: '8px', border: `1px solid ${border}`, borderRadius: '6px', background: 'none', color: textColor, cursor: 'pointer', fontSize: '12px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Hash size={14} color="#3B82F6" /> Sous-Titre
                  </button>
                  <button onClick={() => addBlock('paragraph')} style={{ gridColumn: 'span 2', padding: '8px', border: `1px solid ${border}`, borderRadius: '6px', background: 'none', color: textColor, cursor: 'pointer', fontSize: '12px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <AlignLeft size={14} color="#10B981" /> Paragraphe de Cours
                  </button>
                </div>
              </div>

              {/* Groupe 2 : Sciences & Droit */}
              <div>
                <span style={{ fontSize: '11px', fontWeight: 700, color: subText, textTransform: 'uppercase', marginBottom: '8px', display: 'block' }}>
                  Sciences & Droit
                </span>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <button onClick={() => addBlock('formula')} style={{ padding: '8px 10px', border: `1px solid ${border}`, borderRadius: '6px', background: 'none', color: textColor, cursor: 'pointer', fontSize: '12px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <FunctionSquare size={16} color="#8B5CF6" /> Formule Mathématique (LaTeX)
                  </button>
                  <button onClick={() => addBlock('law_article')} style={{ padding: '8px 10px', border: `1px solid ${border}`, borderRadius: '6px', background: 'none', color: textColor, cursor: 'pointer', fontSize: '12px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Scale size={16} color="#F59E0B" /> Article de Loi / Juridique
                  </button>
                  <button onClick={() => addBlock('table')} style={{ padding: '8px 10px', border: `1px solid ${border}`, borderRadius: '6px', background: 'none', color: textColor, cursor: 'pointer', fontSize: '12px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Table size={16} color="#06B6D4" /> Tableau Personnalisé
                  </button>
                </div>
              </div>

              {/* Groupe 3 : Évaluation & Encadrés */}
              <div>
                <span style={{ fontSize: '11px', fontWeight: 700, color: subText, textTransform: 'uppercase', marginBottom: '8px', display: 'block' }}>
                  Évaluation & Encadrés
                </span>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <button onClick={() => addBlock('qcm')} style={{ padding: '8px 10px', border: `1px solid ${border}`, borderRadius: '6px', background: 'none', color: textColor, cursor: 'pointer', fontSize: '12px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <CheckSquare size={16} color="#10B981" /> QCM Évaluation (4 Choix)
                  </button>
                  <button onClick={() => addBlock('callout_exam')} style={{ padding: '8px 10px', border: `1px solid ${border}`, borderRadius: '6px', background: 'none', color: textColor, cursor: 'pointer', fontSize: '12px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Target size={16} color="#6B1124" /> Sujet d'Examen Type
                  </button>
                  <button onClick={() => addBlock('callout_note')} style={{ padding: '8px 10px', border: `1px solid ${border}`, borderRadius: '6px', background: 'none', color: textColor, cursor: 'pointer', fontSize: '12px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Lightbulb size={16} color="#EAB308" /> Encadré Remarque & Astuce
                  </button>
                  <button onClick={() => addBlock('callout_warning')} style={{ padding: '8px 10px', border: `1px solid ${border}`, borderRadius: '6px', background: 'none', color: textColor, cursor: 'pointer', fontSize: '12px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <AlertTriangle size={16} color="#EF4444" /> Encadré Attention / Piège
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Zone de prévisualisation & édition A4 (Feuille continue et fluide défilant librement) */}
          <div className="studio-sheet-wrapper" style={{
            marginLeft: '358px',
            flex: 1,
            minWidth: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            paddingBottom: '120px'
          }}>
            
            {/* Simulation feuille A4 continue et généreuse */}
            <div id="studio-printable-document" className="studio-printable-sheet" style={{ width: '100%', maxWidth: '860px', minHeight: '880px', backgroundColor: '#FFFFFF', borderRadius: '12px', boxShadow: '0 8px 36px rgba(0,0,0,0.12)', padding: '48px 44px', color: '#1F2937', boxSizing: 'border-box', border: '1px solid #E5E7EB', display: 'flex', flexDirection: 'column', flexShrink: 0, marginBottom: '60px' }}>
              
              {/* En-tête officiel A4 */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid #6B1124', paddingBottom: '14px', marginBottom: '26px' }}>
                <div>
                  <span style={{ fontSize: '18px', fontWeight: 800, color: '#6B1124', letterSpacing: '-0.5px' }}>cauZon Studio</span>
                  <span style={{ fontSize: '12px', color: '#6B7280', display: 'block', fontWeight: 600 }}>Support Pédagogique Officiel</span>
                </div>
                <div style={{ textAlign: 'right', fontSize: '12px', color: '#9CA3AF', fontWeight: 600 }}>
                  <span>Année Universitaire 2025–2026</span>
                </div>
              </div>

              {/* Rendu dynamique continu de tous les blocs */}
              <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '22px' }}>
                {blocks.map((block, index) => (
                  <div
                    key={block.id}
                    className="studio-block-item"
                    style={{
                      position: 'relative',
                      border: '1px dashed transparent',
                      borderRadius: '8px',
                      padding: '8px',
                      transition: 'border 0.2s',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.borderColor = '#6B1124')}
                    onMouseLeave={e => (e.currentTarget.style.borderColor = 'transparent')}
                  >
                    {/* Barre d'actions du bloc */}
                    <div className="studio-block-actions print-hide" style={{ position: 'absolute', top: '-12px', right: '8px', display: 'flex', gap: '4px', backgroundColor: '#6B1124', padding: '2px 6px', borderRadius: '4px', zIndex: 10 }}>
                      <button onClick={() => moveBlock(index, 'up')} disabled={index === 0} title="Monter" style={{ background: 'none', border: 'none', color: '#FFF', cursor: index === 0 ? 'default' : 'pointer', opacity: index === 0 ? 0.3 : 1 }}>
                        <ArrowUp size={12} />
                      </button>
                      <button onClick={() => moveBlock(index, 'down')} disabled={index === blocks.length - 1} title="Descendre" style={{ background: 'none', border: 'none', color: '#FFF', cursor: index === blocks.length - 1 ? 'default' : 'pointer', opacity: index === blocks.length - 1 ? 0.3 : 1 }}>
                        <ArrowDown size={12} />
                      </button>
                      <button onClick={() => duplicateBlock(block)} title="Dupliquer" style={{ background: 'none', border: 'none', color: '#FFF', cursor: 'pointer' }}>
                        <Copy size={12} />
                      </button>
                      <button onClick={() => deleteBlock(block.id)} title="Supprimer" style={{ background: 'none', border: 'none', color: '#FCA5A5', cursor: 'pointer' }}>
                        <Trash2 size={12} />
                      </button>
                    </div>

                    {/* Bloc Type : TITRE PRINCIPAL */}
                    {block.type === 'title' && (
                      <div style={{ textAlign: 'center', marginBottom: '8px' }}>
                        <input
                          value={block.title || ''}
                          onChange={e => updateBlock(block.id, 'title', e.target.value)}
                          placeholder="Sous-titre institutionnel…"
                          style={{ width: '100%', textAlign: 'center', border: 'none', outline: 'none', fontSize: '12px', color: '#6B7280', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 700 }}
                        />
                        <textarea
                          value={block.content}
                          onChange={e => updateBlock(block.id, 'content', e.target.value)}
                          rows={2}
                          style={{ width: '100%', textAlign: 'center', border: 'none', outline: 'none', fontSize: '20px', fontWeight: 800, color: '#6B1124', fontFamily: 'Outfit, sans-serif', resize: 'none', marginTop: '4px' }}
                        />
                      </div>
                    )}

                    {/* Bloc Type : SOUS-TITRE */}
                    {block.type === 'subtitle' && (
                      <input
                        value={block.content}
                        onChange={e => updateBlock(block.id, 'content', e.target.value)}
                        style={{ width: '100%', border: 'none', borderBottom: '2px solid #E5E7EB', outline: 'none', fontSize: '15px', fontWeight: 700, color: '#1F2937', padding: '4px 0' }}
                      />
                    )}

                    {/* Bloc Type : PARAGRAPHE */}
                    {block.type === 'paragraph' && (
                      <textarea
                        value={block.content}
                        onChange={e => updateBlock(block.id, 'content', e.target.value)}
                        rows={3}
                        style={{ width: '100%', border: 'none', outline: 'none', fontSize: '13px', lineHeight: 1.7, color: '#374151', resize: 'vertical' }}
                      />
                    )}

                    {/* Bloc Type : FORMULE SCIENTIFIQUE / LATEX */}
                    {block.type === 'formula' && (
                      <div style={{ backgroundColor: '#F8FAFC', border: '1px solid #CBD5E1', borderLeft: '4px solid #8B5CF6', borderRadius: '8px', padding: '12px' }}>
                        <input
                          value={block.title || ''}
                          onChange={e => updateBlock(block.id, 'title', e.target.value)}
                          placeholder="Nom de la formule…"
                          style={{ width: '100%', border: 'none', background: 'none', outline: 'none', fontSize: '12px', fontWeight: 700, color: '#8B5CF6', marginBottom: '6px' }}
                        />
                        <div style={{ textAlign: 'center', padding: '10px', backgroundColor: '#FFFFFF', borderRadius: '6px', border: '1px solid #E2E8F0', fontFamily: 'monospace', fontSize: '16px', fontWeight: 700, color: '#1E293B', margin: '4px 0' }}>
                          <input
                            value={block.content}
                            onChange={e => updateBlock(block.id, 'content', e.target.value)}
                            style={{ width: '100%', textAlign: 'center', border: 'none', outline: 'none', background: 'none', fontFamily: 'monospace', fontSize: '16px', fontWeight: 700, color: '#1E293B' }}
                          />
                        </div>
                        <input
                          value={block.subContent || ''}
                          onChange={e => updateBlock(block.id, 'subContent', e.target.value)}
                          placeholder="Explication des variables et unités…"
                          style={{ width: '100%', border: 'none', background: 'none', outline: 'none', fontSize: '11px', color: '#64748B', marginTop: '4px' }}
                        />
                      </div>
                    )}

                    {/* Bloc Type : ARTICLE DE LOI / TEXTE JURIDIQUE */}
                    {block.type === 'law_article' && (
                      <div style={{ backgroundColor: '#FFFBEB', border: '1px solid #FCD34D', borderLeft: '4px solid #D97706', borderRadius: '8px', padding: '14px' }}>
                        <input
                          value={block.title || ''}
                          onChange={e => updateBlock(block.id, 'title', e.target.value)}
                          placeholder="Titre de l'article (ex: Article 1382 du Code Civil)…"
                          style={{ width: '100%', border: 'none', background: 'none', outline: 'none', fontSize: '13px', fontWeight: 800, color: '#92400E', marginBottom: '6px' }}
                        />
                        <textarea
                          value={block.content}
                          onChange={e => updateBlock(block.id, 'content', e.target.value)}
                          rows={3}
                          placeholder="Texte de la disposition juridique…"
                          style={{ width: '100%', border: 'none', background: 'none', outline: 'none', fontSize: '13px', fontStyle: 'italic', lineHeight: 1.6, color: '#78350F', resize: 'vertical' }}
                        />
                        <input
                          value={block.subContent || ''}
                          onChange={e => updateBlock(block.id, 'subContent', e.target.value)}
                          placeholder="Commentaire ou référence de jurisprudence…"
                          style={{ width: '100%', border: 'none', background: 'none', outline: 'none', fontSize: '11px', color: '#B45309', marginTop: '4px' }}
                        />
                      </div>
                    )}

                    {/* Bloc Type : TABLEAU PERSONNALISÉ */}
                    {block.type === 'table' && (
                      <div style={{ border: '1px solid #E2E8F0', borderRadius: '8px', padding: '12px', backgroundColor: '#F8FAFC' }}>
                        <input
                          value={block.title || ''}
                          onChange={e => updateBlock(block.id, 'title', e.target.value)}
                          placeholder="Titre du tableau…"
                          style={{ width: '100%', border: 'none', background: 'none', outline: 'none', fontSize: '13px', fontWeight: 700, color: '#0F172A', marginBottom: '8px' }}
                        />
                        <div style={{ overflowX: 'auto' }}>
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                            <thead>
                              <tr style={{ backgroundColor: '#6B1124', color: '#FFFFFF' }}>
                                {['Colonne 1', 'Colonne 2', 'Colonne 3', 'Colonne 4'].map((h, hi) => (
                                  <th key={hi} style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 700 }}>{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {[1, 2, 3].map((row, ri) => (
                                <tr key={ri} style={{ borderBottom: '1px solid #E2E8F0' }}>
                                  {[1, 2, 3, 4].map((col, ci) => (
                                    <td key={ci} style={{ padding: '8px 10px', color: '#334155' }}>Donnée {ri + 1}-{ci + 1}</td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {/* Bloc Type : QCM ÉVALUATION */}
                    {block.type === 'qcm' && (
                      <div style={{ backgroundColor: '#F0FDF4', border: '1px solid #BBF7D0', borderLeft: '4px solid #16A34A', borderRadius: '8px', padding: '14px' }}>
                        <input
                          value={block.title || ''}
                          onChange={e => updateBlock(block.id, 'title', e.target.value)}
                          placeholder="Titre du QCM…"
                          style={{ width: '100%', border: 'none', background: 'none', outline: 'none', fontSize: '13px', fontWeight: 800, color: '#15803D', marginBottom: '6px' }}
                        />
                        <textarea
                          value={block.content}
                          onChange={e => updateBlock(block.id, 'content', e.target.value)}
                          rows={2}
                          placeholder="Énoncé de la question…"
                          style={{ width: '100%', border: 'none', background: 'none', outline: 'none', fontSize: '13px', fontWeight: 600, color: '#166534', resize: 'vertical' }}
                        />
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '8px' }}>
                          {(block.extraData?.options || ['Option A', 'Option B', 'Option C', 'Option D']).map((opt: string, oi: number) => (
                            <div key={oi} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 10px', backgroundColor: oi === (block.extraData?.correctIndex ?? 0) ? '#DCFCE7' : '#FFFFFF', borderRadius: '6px', border: '1px solid #E2E8F0' }}>
                              <input
                                type="radio"
                                name={`qcm_${block.id}`}
                                checked={oi === (block.extraData?.correctIndex ?? 0)}
                                onChange={() => {
                                  const updatedData = { ...(block.extraData || {}), correctIndex: oi };
                                  updateBlock(block.id, 'extraData', updatedData);
                                }}
                              />
                              <span style={{ fontSize: '12px', fontWeight: 700, color: '#166534' }}>{String.fromCharCode(65 + oi)}.</span>
                              <input
                                value={opt}
                                onChange={e => {
                                  const opts = [...(block.extraData?.options || ['Option A', 'Option B', 'Option C', 'Option D'])];
                                  opts[oi] = e.target.value;
                                  updateBlock(block.id, 'extraData', { ...(block.extraData || {}), options: opts });
                                }}
                                style={{ flex: 1, border: 'none', outline: 'none', background: 'none', fontSize: '12px', color: '#1F2937' }}
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Bloc Type : SUJET EXAMEN */}
                    {block.type === 'callout_exam' && (
                      <div style={{ backgroundColor: '#FAF6EB', border: '1px solid #E5C158', borderLeft: '4px solid #6B1124', borderRadius: '8px', padding: '14px' }}>
                        <input
                          value={block.title || ''}
                          onChange={e => updateBlock(block.id, 'title', e.target.value)}
                          placeholder="Titre du sujet d'examen…"
                          style={{ width: '100%', border: 'none', background: 'none', outline: 'none', fontSize: '13px', fontWeight: 800, color: '#6B1124', marginBottom: '6px' }}
                        />
                        <textarea
                          value={block.content}
                          onChange={e => updateBlock(block.id, 'content', e.target.value)}
                          rows={3}
                          placeholder="Énoncé du problème…"
                          style={{ width: '100%', border: 'none', background: 'none', outline: 'none', fontSize: '13px', lineHeight: 1.6, color: '#451A03', resize: 'vertical' }}
                        />
                      </div>
                    )}

                    {/* Bloc Type : REMARQUE & ASTUCE */}
                    {block.type === 'callout_note' && (
                      <div style={{ backgroundColor: '#FEF9C3', border: '1px solid #FDE047', borderLeft: '4px solid #EAB308', borderRadius: '8px', padding: '12px' }}>
                        <input
                          value={block.title || ''}
                          onChange={e => updateBlock(block.id, 'title', e.target.value)}
                          placeholder="Titre de la remarque…"
                          style={{ width: '100%', border: 'none', background: 'none', outline: 'none', fontSize: '13px', fontWeight: 700, color: '#854D0E', marginBottom: '4px' }}
                        />
                        <textarea
                          value={block.content}
                          onChange={e => updateBlock(block.id, 'content', e.target.value)}
                          rows={2}
                          style={{ width: '100%', border: 'none', background: 'none', outline: 'none', fontSize: '12px', lineHeight: 1.6, color: '#713F12', resize: 'vertical' }}
                        />
                      </div>
                    )}

                    {/* Bloc Type : ATTENTION / PIÈGE */}
                    {block.type === 'callout_warning' && (
                      <div style={{ backgroundColor: '#FEF2F2', border: '1px solid #FECACA', borderLeft: '4px solid #EF4444', borderRadius: '8px', padding: '12px' }}>
                        <input
                          value={block.title || ''}
                          onChange={e => updateBlock(block.id, 'title', e.target.value)}
                          placeholder="Titre de l'avertissement…"
                          style={{ width: '100%', border: 'none', background: 'none', outline: 'none', fontSize: '13px', fontWeight: 700, color: '#991B1B', marginBottom: '4px' }}
                        />
                        <textarea
                          value={block.content}
                          onChange={e => updateBlock(block.id, 'content', e.target.value)}
                          rows={2}
                          style={{ width: '100%', border: 'none', background: 'none', outline: 'none', fontSize: '12px', lineHeight: 1.6, color: '#7F1D1D', resize: 'vertical' }}
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ----------------- TAB 2 : BANNIÈRES & ANNONCES ----------------- */}
      {studioTab === 'banners' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
            <div>
              <h2 style={{ color: textColor, fontSize: '18px', fontWeight: 700, margin: 0 }}>Bannières & Annonces</h2>
              <p style={{ color: subText, fontSize: '14px', margin: '4px 0 0' }}>{banners.length} bannière(s) configurée(s)</p>
            </div>
            <button
              onClick={() => { setEditingBanner(null); setShowBannerWizard(true); }}
              style={{ padding: '10px 20px', backgroundColor: '#6B1124', color: '#FAF6EB', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 700, fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px' }}
            >
              <Plus size={16} /> Nouvelle bannière
            </button>
          </div>

          {banners.length === 0 ? (
            <div style={{ backgroundColor: cardBg, border: `2px dashed ${border}`, borderRadius: '14px', padding: '60px', textAlign: 'center' }}>
              <BellRing size={48} color="#2D1220" style={{ marginBottom: '16px' }} />
              <h3 style={{ color: textColor, fontSize: '18px', fontWeight: 700 }}>Aucune bannière créée</h3>
              <p style={{ color: subText, fontSize: '14px', maxWidth: '360px', margin: '8px auto 0' }}>Créez des annonces pour informer vos étudiants directement dans l'application.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {banners.map(b => {
                const impColor = IMPORTANCE_COLORS[b.type_importance] ?? '#6B7280';
                const impBg = darkMode ? '#1e1e1e' : (IMPORTANCE_BG[b.type_importance] ?? '#F9FAFB');
                const mediaMatch = b.contenu_detaille?.match(/\[MEDIA:(image|video):([^\]]+)\]/);
                const mediaType = mediaMatch ? mediaMatch[1] : null;
                const mediaUrl = mediaMatch ? mediaMatch[2] : null;
                const cleanDesc = b.contenu_detaille?.replace(/\[MEDIA:(image|video):([^\]]+)\]/, '').trim();

                return (
                  <div key={b.id} style={{ backgroundColor: cardBg, border: `1px solid ${border}`, borderLeft: `4px solid ${impColor}`, borderRadius: '10px', padding: '18px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', flexWrap: 'wrap' }}>
                        <span style={{ backgroundColor: impBg, color: impColor, fontSize: '11px', fontWeight: 700, padding: '3px 10px', borderRadius: '20px', textTransform: 'uppercase' }}>
                          {b.type_importance}
                        </span>
                        <span style={{ fontSize: '11px', color: subText, fontWeight: 600 }}>{b.ciblage_role}</span>
                        <span style={{ padding: '3px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 700, backgroundColor: b.statut === 'actif' ? '#D1FAE5' : (darkMode ? '#1e1e1e' : '#F3F4F6'), color: b.statut === 'actif' ? '#065F46' : subText }}>
                          {b.statut === 'actif' ? '● Active' : '○ Inactive'}
                        </span>
                        {mediaType && (
                          <span style={{ backgroundColor: 'rgba(107, 17, 36, 0.12)', color: '#6B1124', fontSize: '11px', fontWeight: 700, padding: '3px 9px', borderRadius: '14px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                            {mediaType === 'video' ? '🎬 Vidéo' : '🖼️ Image'}
                          </span>
                        )}
                        {b.document_id_associe && (
                          <span style={{ backgroundColor: 'rgba(59, 130, 246, 0.12)', color: '#3B82F6', fontSize: '11px', fontWeight: 700, padding: '3px 9px', borderRadius: '14px' }}>
                            📄 Cours lié
                          </span>
                        )}
                      </div>
                      <h3 style={{ color: textColor, fontWeight: 700, fontSize: '15px', margin: '0 0 6px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.titre_bande}</h3>
                      <p style={{ color: subText, fontSize: '13px', margin: '0 0 8px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cleanDesc || b.contenu_detaille}</p>
                      <p style={{ fontSize: '12px', color: darkMode ? '#4B5563' : '#D1D5DB', margin: 0 }}>
                        {new Date(b.date_debut).toLocaleDateString('fr-FR')} → {new Date(b.date_fin).toLocaleDateString('fr-FR')}
                      </p>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                      <button onClick={() => handleToggleStatus(b)} title={b.statut === 'actif' ? 'Désactiver' : 'Activer'}
                        style={{ padding: '7px 14px', borderRadius: '7px', border: `1px solid ${b.statut === 'actif' ? '#10B981' : border}`, backgroundColor: b.statut === 'actif' ? '#10B981' : 'transparent', color: b.statut === 'actif' ? '#FFF' : subText, cursor: 'pointer', fontWeight: 600, fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <CheckCircle size={13} /> {b.statut === 'actif' ? 'Active' : 'Inactiver'}
                      </button>
                      <button onClick={() => { setEditingBanner(b); setShowBannerWizard(true); }} title="Modifier"
                        style={{ padding: '7px 12px', borderRadius: '7px', border: `1px solid ${border}`, background: 'none', color: '#6B1124', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                        <Edit3 size={15} />
                      </button>
                      <button onClick={() => handleDeleteBanner(b.id)} title="Supprimer"
                        style={{ padding: '7px 12px', borderRadius: '7px', border: '1px solid #E74C3C', background: 'none', color: '#E74C3C', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Banner Wizard */}
      {showBannerWizard && (
        <BannerWizard
          documents={documents}
          editingBanner={editingBanner}
          onSave={handleSaveBanner}
          onClose={() => { setShowBannerWizard(false); setEditingBanner(null); }}
          darkMode={darkMode}
        />
      )}
    </div>
  );
}

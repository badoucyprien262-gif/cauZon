import React from 'react';

export interface LecteurPdfWebProps {
  documentId?: string;
  urlFichier?: string | Uint8Array | null;
  pdfUrl?: string | null;
  estVerrouille?: boolean;
  limiteApercuPages?: number;
  limiteApercuType?: string;
  limiteApercuValeur?: number;
  prix?: number;
  estSombre?: boolean;
  onAcheter?: () => void;
  onVip?: () => void;
  onPageChange?: (currentPage: number, totalPages: number) => void;
  onDocumentLoad?: (totalPages: number) => void;
  onReessayer?: () => void;
}

export const LecteurPdfWeb: React.FC<LecteurPdfWebProps> = () => null;

export interface LecteurPdfProps {
  documentId?: string;
  urlFichier?: string | Uint8Array | null;
  pdfUrl?: string | null;
  titre?: string;
  estVerrouille?: boolean;
  limiteApercuPages?: number;
  limiteApercuType?: string;
  limiteApercuValeur?: number;
  prix?: number;
  estSombre?: boolean;
  scale?: number;
  onAcheter?: () => void;
  onVip?: () => void;
  onPageChange?: (currentPage: number, totalPages: number) => void;
  onDocumentLoad?: (totalPages: number) => void;
  onError?: (error: any) => void;
  onReessayer?: () => void;
}

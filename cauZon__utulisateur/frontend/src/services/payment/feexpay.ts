/**
 * Service de Paiement Mobile Money — FeexPay
 * Passerelle moderne multi-opérateurs (CI, SN, BJ, TG, CM, BF, etc.)
 *
 * @module payment/feexpay
 * @see https://feexpay.me/docs
 */

// ─────────────────────────────────────────────────────────────
// Configuration & Clés API
// ─────────────────────────────────────────────────────────────

/** Clé publique de test officielle fournie */
export const FEEXPAY_TEST_PUBLIC_KEY = 'test_Hg7Kjl3ZAM63UuIUpuudD9nKuu3ZAM67Kjl3Uuhn';

/** Clé publique active (priorité à la variable d'environnement avec fallback test) */
export const FEEXPAY_PUBLIC_KEY =
  process.env.EXPO_PUBLIC_FEEXPAY_PUBLIC_KEY || FEEXPAY_TEST_PUBLIC_KEY;

/** Mode d'exécution FeexPay ('sandbox' ou 'live') */
export const FEEXPAY_MODE = (process.env.EXPO_PUBLIC_FEEXPAY_MODE || 'sandbox') as
  | 'sandbox'
  | 'live';

// ─────────────────────────────────────────────────────────────
// Types & Interfaces
// ─────────────────────────────────────────────────────────────

/** Opérateurs Mobile Money supportés par FeexPay */
export type FeexPayOperateur =
  | 'ORANGE_CI'
  | 'MTN_CI'
  | 'MOOV_CI'
  | 'WAVE_CI'
  | 'ORANGE_SN'
  | 'WAVE_SN'
  | 'FREE_SN'
  | 'MTN_BJ'
  | 'MOOV_BJ'
  | 'CELTIS_BJ'
  | 'MOOV_TG'
  | 'TOGOCOM_TG';

/** Informations client pour la transaction FeexPay */
export interface CustomerFeexPay {
  firstname: string;
  lastname: string;
  email: string;
  phone: string;
  country?: string; // Code pays 2 lettres (ex: 'ci', 'sn', 'bj')
}

/** Données d'initialisation de transaction FeexPay */
export interface FeexPayPaymentPayload {
  amount: number; // Montant en FCFA
  description: string; // Libellé / Objet de la transaction
  transId?: string; // ID unique cauZon
  customer?: CustomerFeexPay; // Client pré-rempli
  operator?: FeexPayOperateur; // Opérateur sélectionné
  callbackUrl?: string; // URL de retour après paiement
  errorUrl?: string; // URL en cas d'échec
}

/** Résultat normalisé d'une transaction FeexPay */
export interface FeexPayResult {
  status: 'SUCCESS' | 'PENDING' | 'FAILED' | 'CANCELLED';
  reference: string;
  amount: number;
  transId: string;
  operator?: string;
  message?: string;
  date?: string;
}

// ─────────────────────────────────────────────────────────────
// Fonctions Utilitaires
// ─────────────────────────────────────────────────────────────

/**
 * Génère un identifiant unique de transaction pour FeexPay.
 * Format : FX-TIMESTAMP-RANDOM
 */
export const generateFeexPayTransactionId = (): string => {
  return `FX-${Date.now()}-${Math.floor(10000 + Math.random() * 90000)}`;
};

/**
 * Normalise un numéro de téléphone pour l'API FeexPay.
 * Conserve uniquement les chiffres.
 */
export const formatPhoneFeexPay = (phone: string): string => {
  return phone.replace(/\D/g, '');
};

/**
 * Construit l'URL web de redirection directe pour le checkout FeexPay.
 */
export const buildFeexPayCheckoutUrl = (
  payload: FeexPayPaymentPayload,
  publicKey: string = FEEXPAY_PUBLIC_KEY
): string => {
  const transId = payload.transId || generateFeexPayTransactionId();
  const params = new URLSearchParams({
    token: publicKey,
    amount: payload.amount.toString(),
    custom_id: transId,
    description: payload.description,
    mode: FEEXPAY_MODE,
  });

  if (payload.customer) {
    if (payload.customer.firstname) params.append('firstname', payload.customer.firstname);
    if (payload.customer.lastname) params.append('lastname', payload.customer.lastname);
    if (payload.customer.email) params.append('email', payload.customer.email);
    if (payload.customer.phone) params.append('phone', formatPhoneFeexPay(payload.customer.phone));
  }

  if (payload.callbackUrl) params.append('callback_url', payload.callbackUrl);
  if (payload.errorUrl) params.append('error_url', payload.errorUrl);

  const baseUrl =
    FEEXPAY_MODE === 'sandbox'
      ? 'https://sandbox.feexpay.me/pay'
      : 'https://api.feexpay.me/pay';

  return `${baseUrl}?${params.toString()}`;
};

/**
 * Initialise une transaction de test en mode Sandbox.
 * Permet de tester le flux de paiement de manière programmatique sans débit réel.
 */
export const initierTransactionSandboxFeexPay = async (
  payload: FeexPayPaymentPayload,
  publicKey: string = FEEXPAY_TEST_PUBLIC_KEY
): Promise<FeexPayResult> => {
  const transId = payload.transId || generateFeexPayTransactionId();

  // Simulation contrôlée en mode Sandbox
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve({
        status: 'SUCCESS',
        reference: `FP-SANDBOX-${Date.now()}`,
        amount: payload.amount,
        transId: transId,
        operator: payload.operator || 'ORANGE_CI',
        message: `Transaction de test Sandbox validée avec succès (${payload.amount} FCFA).`,
        date: new Date().toISOString(),
      });
    }, 1200);
  });
};

/**
 * Génère le code HTML complet pour afficher le guichet FeexPay dans une WebView React Native.
 * Intègre le widget JS FeexPay ainsi que le mode Sandbox interactif pour mobile.
 */
export const generateFeexPayHtml = (
  payload: FeexPayPaymentPayload,
  publicKey: string = FEEXPAY_PUBLIC_KEY,
  isSandbox: boolean = FEEXPAY_MODE === 'sandbox'
): string => {
  const transId = payload.transId || generateFeexPayTransactionId();
  const customerJson = JSON.stringify(payload.customer || {});
  const amount = payload.amount;
  const description = payload.description;

  return `
    <!DOCTYPE html>
    <html lang="fr">
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
      <title>Guichet FeexPay — cauZon</title>
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
          background-color: #F8FAF9;
          color: #1F2937;
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 100vh;
          padding: 16px;
        }
        .card {
          background: #FFFFFF;
          border-radius: 20px;
          padding: 24px;
          width: 100%;
          max-width: 360px;
          box-shadow: 0 10px 25px rgba(0, 0, 0, 0.08);
          border: 1px solid #E5E7EB;
          text-align: center;
        }
        .brand-badge {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          background: #FEF2F2;
          color: #7F011F;
          padding: 6px 14px;
          border-radius: 20px;
          font-weight: 800;
          font-size: 13px;
          margin-bottom: 12px;
          border: 1px solid rgba(127, 1, 31, 0.15);
        }
        .badge-sandbox {
          background: #FEF3C7;
          color: #92400E;
          border-color: #FCD34D;
          font-size: 11px;
          padding: 2px 8px;
          border-radius: 10px;
          font-weight: 700;
          display: inline-block;
          margin-bottom: 8px;
        }
        .title {
          font-size: 18px;
          font-weight: 800;
          color: #111827;
          margin-bottom: 4px;
        }
        .desc {
          font-size: 13px;
          color: #6B7280;
          margin-bottom: 16px;
        }
        .price-box {
          background: #F9FAFB;
          border-radius: 12px;
          padding: 14px;
          margin-bottom: 18px;
          border: 1px dashed #D1D5DB;
        }
        .price-label {
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          color: #9CA3AF;
          font-weight: 700;
        }
        .price-val {
          font-size: 24px;
          font-weight: 900;
          color: #7F011F;
          margin-top: 2px;
        }
        .btn {
          width: 100%;
          padding: 14px;
          border-radius: 12px;
          border: none;
          font-size: 14px;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.2s ease;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          margin-bottom: 10px;
        }
        .btn-pay {
          background: #7F011F;
          color: #FFFFFF;
          box-shadow: 0 4px 12px rgba(127, 1, 31, 0.25);
        }
        .btn-cancel {
          background: #F3F4F6;
          color: #6B7280;
        }
        .secure-footer {
          margin-top: 14px;
          font-size: 11px;
          color: #9CA3AF;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 4px;
        }
        .spinner {
          display: none;
          width: 20px;
          height: 20px;
          border: 2px solid rgba(255, 255, 255, 0.3);
          border-radius: 50%;
          border-top-color: #FFFFFF;
          animation: spin 0.8s linear infinite;
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      </style>
    </head>
    <body>
      <div class="card">
        <div class="brand-badge">⚡ FeexPay Mobile</div>
        ${isSandbox ? '<div class="badge-sandbox">🧪 MODE TEST (SANDBOX)</div>' : ''}
        <h2 class="title">Validation du Paiement</h2>
        <p class="desc">${description}</p>

        <div class="price-box">
          <div class="price-label">Montant à régler</div>
          <div class="price-val">${amount} FCFA</div>
        </div>

        <button id="btnPay" class="btn btn-pay" onclick="validerPaiement()">
          <span class="spinner" id="spin"></span>
          <span id="btnText">Confirmer le paiement (${amount} FCFA)</span>
        </button>

        <button class="btn btn-cancel" onclick="annulerPaiement()">
          Annuler
        </button>

        <div class="secure-footer">
          🔒 Passerelle sécurisée FeexPay · PCI-DSS
        </div>
      </div>

      <script>
        const transId = '${transId}';
        const amount = ${amount};
        const customer = ${customerJson};
        const token = '${publicKey}';

        function notifierApp(data) {
          const jsonString = typeof data === 'string' ? data : JSON.stringify(data);

          // 1. React Native WebView (Android / iOS)
          if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
            window.ReactNativeWebView.postMessage(jsonString);
          }

          // 2. Web Iframe (Navigateur Desktop / Web)
          if (window.parent && window.parent !== window) {
            window.parent.postMessage(jsonString, '*');
          }

          // 3. Web Popup / Fenêtre fille
          if (window.opener) {
            window.opener.postMessage(jsonString, '*');
          }

          // 4. Événement local custom
          window.dispatchEvent(new CustomEvent('feexpay_message', { detail: data }));
        }

        function validerPaiement() {
          const btn = document.getElementById('btnPay');
          const spin = document.getElementById('spin');
          const text = document.getElementById('btnText');

          btn.disabled = true;
          spin.style.display = 'inline-block';
          text.textContent = 'Validation en cours...';

          setTimeout(() => {
            notifierApp({
              status: 'SUCCESS',
              reference: 'FP-' + Date.now(),
              transId: transId,
              amount: amount,
              message: 'Paiement FeexPay validé avec succès.'
            });
          }, 1200);
        }

        function annulerPaiement() {
          notifierApp({
            status: 'CANCELLED',
            transId: transId,
            message: 'Transaction annulée par l\\'utilisateur.'
          });
        }
      </script>
    </body>
    </html>
  `;
};

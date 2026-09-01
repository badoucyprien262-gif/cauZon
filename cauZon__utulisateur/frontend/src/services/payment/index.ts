/**
 * Module Paiement Mobile Money — cauZon
 * Passerelle UNIQUE et EXCLUSIVE : FEEXPAY
 * Supporte : Wave, Orange Money, MTN MoMo, Moov Money, Carte Bancaire
 *
 * @module services/payment
 */

// ─── FeexPay (Passerelle UNIQUE et ACTIVE) ───────────────────
export {
  FEEXPAY_TEST_PUBLIC_KEY,
  FEEXPAY_PUBLIC_KEY,
  FEEXPAY_MODE,
  generateFeexPayTransactionId,
  formatPhoneFeexPay,
  initierTransactionSandboxFeexPay,
  generateFeexPayHtml,
  buildFeexPayCheckoutUrl,
} from './feexpay';
export type {
  FeexPayOperateur,
  CustomerFeexPay,
  FeexPayPaymentPayload,
  FeexPayResult,
} from './feexpay';

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
  FEEXPAY_TEST_SHOP_ID,
  FEEXPAY_SHOP_ID,
  FEEXPAY_MODE,
  FEEXPAY_DEFAULT_WEBHOOK_URL,
  FEEXPAY_WEBHOOK_URL,
  generateFeexPayTransactionId,
  formatPhoneFeexPay,
  encoderCustomIdFeexPay,
  initierTransactionSandboxFeexPay,
  generateFeexPayHtml,
  buildFeexPayCheckoutUrl,
} from './feexpay';
export type {
  FeexPayOperateur,
  CustomerFeexPay,
  FeexPayPaymentPayload,
  FeexPayResult,
  FeexPayMetadata,
} from './feexpay';

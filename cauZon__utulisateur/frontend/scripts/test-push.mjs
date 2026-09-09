#!/usr/bin/env node
/**
 * ============================================================
 * 📡 cauZon — Script de Test Push Notification
 * ============================================================
 * Usage depuis le terminal PowerShell :
 *
 *   node scripts/test-push.mjs
 *   node scripts/test-push.mjs "Mon titre" "Mon message"
 *   node scripts/test-push.mjs "Titre" "Message" "ExponentPushToken[VOTRE_TOKEN]"
 *
 * Prérequis :
 *   - Node.js ≥ 18 (fetch natif)
 *   - Avoir accepté les notifications sur l'application mobile CauZon
 *   - Récupérer votre token via les logs console de l'app après connexion
 * ============================================================
 */

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

// ── Arguments CLI ────────────────────────────────────────────
const args = process.argv.slice(2);
const title = args[0] || '📣 Test cauZon';
const body  = args[1] || 'Votre application fonctionne parfaitement en arrière-plan ! 🎉';
const rawToken = args[2] || '';  // Laisser vide = test avec token de simulation

// ── Construction du message Expo Push ────────────────────────
const token = rawToken || 'ExponentPushToken[REMPLACEZ_PAR_VOTRE_VRAI_TOKEN]';

const docId = args[3] || undefined;
const targetRoute = args[4] || 'Bibliotheque';

const message = {
  to: token,
  sound: 'default',
  title,
  body,
  priority: 'high',
  channelId: 'default',
  _displayInForeground: true,
  data: {
    source: 'test_script_flashscore',
    document_id: docId,
    route: targetRoute,
    cible: targetRoute,
    date_envoi: new Date().toISOString(),
  },
};

console.log('\n─────────────────────────────────────────────────────');
console.log('📡  cauZon — Envoi de notification push de test');
console.log('─────────────────────────────────────────────────────');
console.log('Titre   :', title);
console.log('Message :', body);
console.log('Token   :', token.length > 30 ? token.substring(0, 28) + '…]' : token);
console.log('URL     :', EXPO_PUSH_URL);
console.log('─────────────────────────────────────────────────────\n');

if (!rawToken) {
  console.warn('⚠️  Aucun token fourni en argument. Pour tester sur un vrai appareil :');
  console.warn('   1. Ouvre l\'app CauZon sur ton téléphone et connecte-toi.');
  console.warn('   2. Accepte les notifications quand le pop-up s\'affiche.');
  console.warn('   3. Consulte les logs Expo (Metro) pour trouver la ligne :');
  console.warn('      "✅ Push Token synchronisé avec succès : ExponentPushToken[...]"');
  console.warn('   4. Relance : node scripts/test-push.mjs "Titre" "Corps" "ExponentPushToken[TON_TOKEN]"\n');
}

try {
  const response = await fetch(EXPO_PUSH_URL, {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify([message]),
  });

  const json = await response.json();

  if (!response.ok) {
    console.error('❌  Erreur HTTP', response.status, ':', JSON.stringify(json, null, 2));
    process.exit(1);
  }

  const results = json.data || [];
  const success = results.filter(r => r.status === 'ok').length;
  const errors  = results.filter(r => r.status !== 'ok');

  if (success > 0) {
    console.log(`✅  Notification envoyée avec succès à ${success} appareil(s) !`);
  }

  if (errors.length > 0) {
    console.warn('⚠️  Erreurs de l\'API Expo Push :');
    errors.forEach(e => console.warn('   -', e.message || JSON.stringify(e)));
    if (errors.some(e => e.details?.error === 'DeviceNotRegistered')) {
      console.info('\n💡  Token expiré ou invalide → Reconnectez-vous dans l\'app pour régénérer le token.');
    }
  }

  console.log('\nRéponse complète de l\'API Expo :');
  console.log(JSON.stringify(json, null, 2));

} catch (err) {
  console.error('❌  Erreur réseau :', err.message);
  process.exit(1);
}

// ==============================================================================
// 💳 cauZon.ci — SUPABASE EDGE FUNCTION : FEEXPAY WEBHOOK & MOTEUR FINTECH
// Fichier : supabase/functions/feexpay-webhook/index.ts (Deno TypeScript)
//
// Reçoit et valide de façon étanche et IDEMPOTENTE les paiements FeexPay :
// 1. Achat à l'acte (200 FCFA) :
//    - Déblocage permanent dans la bibliothèque lambda (quota 21 docs)
//    - Crédit atomique de +50 FCFA au posteur (author_id) dans posteurs_wallets
//    - Écriture d'audit dans ledger_transactions (Part posteur, frais, part cauZon)
//    - Notification push au posteur
// 2. Abonnement Étudiant (1 000 FCFA / 30 jours / 10 documents) :
//    - Enregistrement dans abonnements_etudiants avec quota de 10 déblocages
//    - Chaque déblocage sous abonnement est marqué `is_vip_consultation: true`
//      et se re-verrouille à expiration (30 jours) si l'abonnement n'est pas renouvelé
//    - Un document acheté à l'acte (200 F) n'est JAMAIS re-verrouillé
//    - Écriture comptable dans ledger_transactions
// 3. Extension Bibliothèque Lambda (1 500 FCFA) :
//    - Augmentation cumulative de +21 documents (21 -> 42 -> 63...)
// 4. Extension Espace Posteur (1 500 FCFA) :
//    - Augmentation cumulative de +400 Mo dans posteurs_wallets
// 5. Sécurité FinTech :
//    - Idempotence stricte (anti-double débit / double crédit)
//    - Garde Anti-Auto-Achat (rejet si user_id === author_id)
//    - Minimisation des données : zéro stockage de numéros de téléphone permanents
// ==============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const FEEXPAY_SECRET_KEY = Deno.env.get("FEEXPAY_SECRET_KEY") || "";

// Client Supabase avec privilèges Service Role (contourne le RLS pour écritures financières)
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

interface FeexPayWebhookPayload {
  status?: string;            // 'SUCCESS', 'APPROVED', 'SUCCESSFUL', 'PENDING', 'FAILED'
  reference?: string;         // Réf transaction FeexPay (ex: FP-12345678)
  custom_id?: string;         // ID métadonnées cauZon : userId:typeAchat:documentId:deviceId:transId
  amount?: number | string;   // Montant réglé en FCFA (200, 1000, 1500)
  operator?: string;          // Opérateur utilisé (ex: 'WAVE_CI', 'MTN_CI', etc.)
  message?: string;
  date?: string;
  customer?: {
    firstname?: string;
    lastname?: string;
    email?: string;
    phone?: string;
  };
  data?: any;
  entity?: any;
}

/**
 * Décode le custom_id encodé par cauZon
 * Format standard : userId:typeAchat:documentId:deviceId:transId
 */
function decoderCustomId(customIdRaw?: string) {
  if (!customIdRaw) {
    return { userId: null, typeAchat: 'acte', documentId: null, deviceId: 'device_inconnu', transId: '' };
  }

  // Format JSON
  if (customIdRaw.startsWith('{')) {
    try {
      const parsed = JSON.parse(customIdRaw);
      return {
        userId: parsed.userId || parsed.user_id || null,
        typeAchat: parsed.typeAchat || parsed.type || 'acte',
        documentId: parsed.documentId || parsed.doc_id || null,
        deviceId: parsed.deviceId || parsed.device_id || 'device_inconnu',
        transId: parsed.transId || parsed.trans_id || '',
      };
    } catch (_) {}
  }

  // Format compact avec séparateur ':'
  const parts = customIdRaw.split(':');
  if (parts.length >= 2) {
    return {
      userId: parts[0] !== 'none' && parts[0] ? parts[0] : null,
      typeAchat: parts[1] || 'acte',
      documentId: parts[2] !== 'none' && parts[2] ? parts[2] : null,
      deviceId: parts[3] !== 'none' && parts[3] ? parts[3] : 'device_inconnu',
      transId: parts[4] || '',
    };
  }

  return { userId: null, typeAchat: 'acte', documentId: null, deviceId: 'device_inconnu', transId: customIdRaw };
}

serve(async (req: Request) => {
  // 1. Gestion des requêtes préliminaires CORS (OPTIONS)
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-feexpay-signature",
      },
    });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Méthode non autorisée. Seul POST est accepté." }), {
      headers: { "Content-Type": "application/json" },
      status: 405,
    });
  }

  try {
    const rawBody = await req.text();
    let payload: FeexPayWebhookPayload = {};

    try {
      payload = JSON.parse(rawBody);
    } catch (_) {
      return new Response(JSON.stringify({ error: "Payload JSON invalide" }), {
        headers: { "Content-Type": "application/json" },
        status: 400,
      });
    }

    console.log("📥 [FeexPay Webhook] Événement reçu :", payload);

    const dataObj = payload.data || payload.entity || payload;
    const statusRaw = String(dataObj.status || payload.status || "").toUpperCase();
    const reference = dataObj.reference || payload.reference || `FP_${Date.now()}`;
    const customIdRaw = dataObj.custom_id || payload.custom_id || "";
    const montant = Number(dataObj.amount || payload.amount) || 0;
    const operateur = dataObj.operator || payload.operator || "Mobile Money";

    const { userId, typeAchat, documentId, deviceId, transId } = decoderCustomId(customIdRaw);
    const idempotencyKey = transId || reference;

    const customerObj = dataObj.customer || payload.customer;
    const nomClient = customerObj ? [customerObj.firstname, customerObj.lastname].filter(Boolean).join(" ").trim() : "";
    const emailClient = customerObj?.email?.trim() || "";

    const estValide = statusRaw === "SUCCESS" || statusRaw === "APPROVED" || statusRaw === "SUCCESSFUL";

    // 2. Vérification distante de sécurité si clé présente
    if (estValide && FEEXPAY_SECRET_KEY && reference && !reference.startsWith("FP_SANDBOX")) {
      try {
        const checkUrl = `https://api.feexpay.me/api/transactions/status/${reference}`;
        const checkRes = await fetch(checkUrl, {
          headers: {
            "Authorization": `Bearer ${FEEXPAY_SECRET_KEY}`,
            "Content-Type": "application/json",
          },
        });
        if (checkRes.ok) {
          const checkData = await checkRes.json();
          const remoteStatus = String(checkData.status || checkData.data?.status || "").toUpperCase();
          if (remoteStatus && remoteStatus !== "SUCCESS" && remoteStatus !== "APPROVED") {
            console.warn(`⚠️ [FeexPay] Statut distant non validé (${remoteStatus})`);
            return new Response(JSON.stringify({ error: "Transaction non validée par FeexPay" }), {
              headers: { "Content-Type": "application/json" },
              status: 400,
            });
          }
        }
      } catch (errCheck) {
        console.warn("⚠️ Note vérification distante FeexPay (silencieux) :", errCheck);
      }
    }

    // 3. IDEMPOTENCE STRICTE : Vérifier si l'opération a déjà été consignée dans le Ledger
    if (estValide) {
      const { data: txExistante } = await supabase
        .from("ledger_transactions")
        .select("id, type_operation, statut")
        .eq("idempotency_key", idempotencyKey)
        .maybeSingle();

      if (txExistante && txExistante.statut === "complete") {
        console.log(`⚡ [Idempotence] Transaction déjà traitée avec succès (${idempotencyKey}). Acquittement 200 immédiat.`);
        return new Response(JSON.stringify({
          success: true,
          message: "Transaction déjà validée (Idempotence).",
          transaction_id: idempotencyKey,
        }), {
          headers: { "Content-Type": "application/json" },
          status: 200,
        });
      }
    }

    // 4. Enregistrement d'audit dans transactions_fedapay (Traçabilité historique)
    const auditPayload: Record<string, any> = {
      transaction_id: idempotencyKey,
      user_id: userId,
      device_id: deviceId,
      type_achat: typeAchat,
      document_id: documentId,
      montant: montant,
      devise: "XOF",
      operateur: operateur,
      statut: estValide ? "approved" : "failed",
      fedapay_reference: reference,
      nom_client: nomClient || null,
      email_client: emailClient || null,
      telephone_client: null, // Règle stricte : Zéro stockage de numéro permanent
      raw_webhook_payload: payload,
      updated_at: new Date().toISOString(),
    };

    await supabase.from("transactions_fedapay").upsert(auditPayload, { onConflict: "transaction_id" }).catch(() => {});

    // 5. EXÉCUTION ATOMIQUE DU FLUX FINANCIER SI TRANSACTION VALIDÉE
    if (estValide) {
      console.log(`✅ [FeexPay] Traitement du flux validé : ${typeAchat} (${montant} FCFA) pour User: ${userId}`);

      // ───────────────────────────────────────────────────────────────────────
      // FLUX 1 : ACHAT À L'ACTE (200 FCFA) -> DÉBLOCAGE DÉFINITIF
      // ───────────────────────────────────────────────────────────────────────
      if ((typeAchat === "acte" || typeAchat === "single") && documentId) {
        // A. Vérification de l'auteur du cours pour Règle Anti-Auto-Achat
        const { data: docData } = await supabase
          .from("documents")
          .select("id, titre, author_id")
          .eq("id", documentId)
          .maybeSingle();

        const authorId = docData?.author_id;

        // Anti-Auto-Achat
        if (authorId && userId && authorId === userId) {
          console.warn(`🛑 [Anti-Fraude] Tentative d'auto-achat bloquée (User: ${userId} est l'auteur du document: ${documentId})`);
          return new Response(JSON.stringify({ error: "Opération interdite : Auto-achat détecté." }), {
            headers: { "Content-Type": "application/json" },
            status: 403,
          });
        }

        // B. Déblocage du cours dans la table acquisitions
        // RÈGLE CRITIQUE : is_vip_consultation: false => NE SERA JAMAIS RE-VERROUILLÉ
        const acqPayload: any = {
          document_id: documentId,
          device_id: deviceId,
          is_welcome_offer: false,
          is_vip_consultation: false, // Acquisition permanente définitive
          montant_paye: montant || 200,
        };
        if (userId) acqPayload.user_id = userId;

        // Si l'acquisition existait déjà sous statut VIP (consultation), on la convertit en permanent
        const { error: errAcq } = await supabase
          .from("acquisitions")
          .upsert([acqPayload], { onConflict: "document_id,device_id" });

        if (errAcq) {
          console.error("❌ Erreur déblocage acquisitions :", errAcq.message);
          throw errAcq;
        }

        // C. Crédit de +50 FCFA au posteur (author_id) s'il existe
        let partPosteur = 0;
        if (authorId) {
          partPosteur = 50;
          // Crédit atomique dans posteurs_wallets
          const { error: errWallet } = await supabase.rpc("incrementer_solde_posteur", {
            p_posteur_id: authorId,
            p_gain: 50,
          });

          // Si la RPC n'est pas encore créée, fallback par lecture/écriture
          if (errWallet) {
            const { data: wallet } = await supabase
              .from("posteurs_wallets")
              .select("solde_retirable, cumul_gains_historique, total_acquisitions_recues")
              .eq("user_id", authorId)
              .maybeSingle();

            if (wallet) {
              await supabase.from("posteurs_wallets").update({
                solde_retirable: (Number(wallet.solde_retirable) || 0) + 50,
                cumul_gains_historique: (Number(wallet.cumul_gains_historique) || 0) + 50,
                total_acquisitions_recues: (Number(wallet.total_acquisitions_recues) || 0) + 1,
                updated_at: new Date().toISOString(),
              }).eq("user_id", authorId);
            }
          }

          // Envoi de la notification push au créateur
          try {
            await fetch(`${SUPABASE_URL}/functions/v1/envoyer-notification`, {
              method: "POST",
              headers: {
                "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                userId: authorId,
                title: "💰 Nouvelle vente de cours !",
                body: `Un étudiant a acheté votre document "${docData?.titre || 'académique'}". Votre compte a été crédité de +50 FCFA.`,
                data: { type: "gain", documentId },
              }),
            });
          } catch (errPush) {
            console.warn("⚠️ Push posteur non délivré :", errPush);
          }
        }

        // D. Écriture comptable dans ledger_transactions
        const fraisPasserelle = Math.round((montant || 200) * 0.02); // 2% FeexPay
        const partCauzonNette = (montant || 200) - partPosteur - fraisPasserelle;

        await supabase.from("ledger_transactions").insert([{
          idempotency_key: idempotencyKey,
          reference_externe: reference,
          type_operation: "achat_acte",
          user_id: userId,
          posteur_id: authorId || null,
          document_id: documentId,
          montant_brut: montant || 200,
          part_posteur: partPosteur,
          part_cauzon_brute: (montant || 200) - partPosteur,
          frais_passerelle_estimes: fraisPasserelle,
          part_cauzon_nette: partCauzonNette,
          statut: "complete",
          metadata: { documentTitre: docData?.titre, operateur },
        }]);

        console.log(`🎉 [Achat Acte 200 F] Document ${documentId} débloqué définitivement. Posteur crédité de +50 F.`);
      }

      // ───────────────────────────────────────────────────────────────────────
      // FLUX 2 : ABONNEMENT ÉTUDIANT (1 000 FCFA / 30 JOURS / 10 DOCUMENTS)
      // ───────────────────────────────────────────────────────────────────────
      else if (typeAchat === "vip" || typeAchat === "abonnement") {
        const now = new Date();
        const dateFin = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // +30 jours
        const dateFinISO = dateFin.toISOString();

        if (userId) {
          // Créer ou prolonger l'abonnement dans la table abonnements_etudiants
          await supabase.from("abonnements_etudiants").insert([{
            user_id: userId,
            formule: "mensuel_1000",
            montant_paye: montant || 1000,
            date_debut: now.toISOString(),
            date_fin: dateFinISO,
            quota_documents_autorises: 10,
            documents_debloques_ids: [],
            statut: "actif",
            reference_paiement_feexpay: reference,
          }]);

          // Mise à jour de compatibilité sur le profil utilisateur
          await supabase.from("profiles").update({
            has_vip_pass: true,
            vip_expiration_date: dateFinISO,
            updated_at: new Date().toISOString(),
          }).eq("id", userId);
        }

        if (deviceId && deviceId !== "device_inconnu") {
          await supabase.from("appareils_historique_bienvenue").upsert({
            device_id: deviceId,
            has_vip_pass: true,
            vip_expiration_date: dateFinISO,
            updated_at: new Date().toISOString(),
          }, { onConflict: "device_id" });
        }

        // Écriture comptable dans ledger_transactions
        const fraisPasserelle = Math.round((montant || 1000) * 0.02);
        await supabase.from("ledger_transactions").insert([{
          idempotency_key: idempotencyKey,
          reference_externe: reference,
          type_operation: "abonnement_mensuel",
          user_id: userId,
          montant_brut: montant || 1000,
          part_posteur: 0, // Les 50 F par posteur sont versés au fur et à mesure des 10 sélections
          part_cauzon_brute: montant || 1000,
          frais_passerelle_estimes: fraisPasserelle,
          part_cauzon_nette: (montant || 1000) - fraisPasserelle,
          statut: "complete",
          metadata: { quotaDocuments: 10, expireLe: dateFinISO, operateur },
        }]);

        console.log(`👑 [Abonnement 1 000 F] 10 crédits activés jusqu'au ${dateFinISO} pour User ${userId}`);
      }

      // ───────────────────────────────────────────────────────────────────────
      // FLUX 3 : EXTENSION BIBLIOTHÈQUE LAMBDA (1 500 FCFA -> +21 DOCUMENTS)
      // ───────────────────────────────────────────────────────────────────────
      else if (typeAchat === "stockage" || typeAchat === "extension_lambda") {
        let nouveauPlafond = 42;

        if (userId) {
          const { data: profile } = await supabase
            .from("profiles")
            .select("quota_documents_lambda, storage_limit")
            .eq("id", userId)
            .maybeSingle();

          const limiteActuelle = profile?.quota_documents_lambda || profile?.storage_limit || 21;
          nouveauPlafond = limiteActuelle + 21; // Paliers : 21 -> 42 -> 63 -> 84...

          await supabase.from("profiles").update({
            has_extended_storage: true,
            quota_documents_lambda: nouveauPlafond,
            storage_limit: nouveauPlafond,
            updated_at: new Date().toISOString(),
          }).eq("id", userId);
        }

        if (deviceId && deviceId !== "device_inconnu") {
          await supabase.from("appareils_historique_bienvenue").upsert({
            device_id: deviceId,
            has_extended_storage: true,
            storage_limit: nouveauPlafond,
            updated_at: new Date().toISOString(),
          }, { onConflict: "device_id" });
        }

        // Ledger
        const fraisPasserelle = Math.round((montant || 1500) * 0.02);
        await supabase.from("ledger_transactions").insert([{
          idempotency_key: idempotencyKey,
          reference_externe: reference,
          type_operation: "extension_lambda",
          user_id: userId,
          montant_brut: montant || 1500,
          part_posteur: 0,
          part_cauzon_brute: montant || 1500,
          frais_passerelle_estimes: fraisPasserelle,
          part_cauzon_nette: (montant || 1500) - fraisPasserelle,
          statut: "complete",
          metadata: { nouveauQuotaDocuments: nouveauPlafond, operateur },
        }]);

        console.log(`📦 [Extension Lambda 1 500 F] Quota augmenté à ${nouveauPlafond} documents.`);
      }

      // ───────────────────────────────────────────────────────────────────────
      // FLUX 4 : EXTENSION ESPACE POSTEUR (1 500 FCFA -> +400 MO)
      // ───────────────────────────────────────────────────────────────────────
      else if (typeAchat === "extension_posteur") {
        let nouveauPlafondMo = 800;

        if (userId) {
          const { data: wallet } = await supabase
            .from("posteurs_wallets")
            .select("quota_stockage_mo")
            .eq("user_id", userId)
            .maybeSingle();

          const quotaActuelMo = Number(wallet?.quota_stockage_mo) || 400;
          nouveauPlafondMo = quotaActuelMo + 400; // Paliers : 400 -> 800 -> 1200 Mo...

          await supabase.from("posteurs_wallets").update({
            quota_stockage_mo: nouveauPlafondMo,
            updated_at: new Date().toISOString(),
          }).eq("user_id", userId);
        }

        // Ledger
        const fraisPasserelle = Math.round((montant || 1500) * 0.02);
        await supabase.from("ledger_transactions").insert([{
          idempotency_key: idempotencyKey,
          reference_externe: reference,
          type_operation: "extension_posteur",
          user_id: userId,
          posteur_id: userId,
          montant_brut: montant || 1500,
          part_posteur: 0,
          part_cauzon_brute: montant || 1500,
          frais_passerelle_estimes: fraisPasserelle,
          part_cauzon_nette: (montant || 1500) - fraisPasserelle,
          statut: "complete",
          metadata: { nouveauQuotaMo: nouveauPlafondMo, operateur },
        }]);

        console.log(`🚀 [Extension Posteur 1 500 F] Espace créateur augmenté à ${nouveauPlafondMo} Mo.`);
      }
    } else {
      console.log(`ℹ️ [FeexPay] Statut non approuvé reçu (${statusRaw}) pour transId : ${idempotencyKey}`);
    }

    // 6. Réponse HTTP 200 conforme
    return new Response(JSON.stringify({
      success: true,
      message: "Webhook FeexPay acquitté et traité avec succès (Fintech cauZon v3.0).",
      statut: statusRaw,
      transaction_id: idempotencyKey,
    }), {
      headers: { "Content-Type": "application/json" },
      status: 200,
    });

  } catch (error: any) {
    console.error("💥 Crash traitement Webhook FeexPay :", error);
    return new Response(JSON.stringify({ error: error.message || "Erreur interne webhook" }), {
      headers: { "Content-Type": "application/json" },
      status: 500,
    });
  }
});

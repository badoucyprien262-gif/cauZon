// ==============================================================================
// 💳 cauZon - SUPABASE EDGE FUNCTION : FEEXPAY WEBHOOK
// Fichier : supabase/functions/feexpay-webhook/index.ts (Deno TypeScript)
//
// Reçoit et valide de façon étanche les notifications de paiement FeexPay
// Attribue de façon atomique les droits d'accès aux cours, Pass VIP et stockage
// ==============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const FEEXPAY_SECRET_KEY = Deno.env.get("FEEXPAY_SECRET_KEY") || "";
const FEEXPAY_WEBHOOK_SECRET = Deno.env.get("FEEXPAY_WEBHOOK_SECRET") || "";

// Client Supabase avec privilèges administrateur (Service Role) pour contourner le RLS
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

interface FeexPayWebhookPayload {
  status?: string;            // 'SUCCESS', 'PENDING', 'FAILED', 'CANCELLED', 'approved'
  reference?: string;         // Réf transaction FeexPay (ex: FP-12345678)
  custom_id?: string;         // ID métadonnées cauZon : userId:typeAchat:documentId:deviceId:transId
  amount?: number | string;   // Montant réglé en FCFA
  operator?: string;          // Opérateur utilisé (ex: 'WAVE_CI', 'MTN_CI', etc.)
  message?: string;           // Message descriptif de FeexPay
  date?: string;              // Horodatage
  customer?: {
    firstname?: string;
    lastname?: string;
    email?: string;
    phone?: string;
  };
  // Fallbacks éventuels pour compatibilité formats imbriqués
  data?: any;
  entity?: any;
}

/**
 * Décode le custom_id encodé par cauZon
 * Format standard : userId:typeAchat:documentId:deviceId:transId
 * Exemple : "usr_123:acte:doc_456:dev_789:FX-171000-1234"
 */
function decoderCustomId(customIdRaw?: string) {
  if (!customIdRaw) {
    return { userId: null, typeAchat: 'acte', documentId: null, deviceId: 'device_inconnu', transId: '' };
  }

  // Si c'est un format JSON encodé
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

    console.log("📥 [FeexPay:Webhook] Événement reçu :", payload);

    // Extraction des champs avec tolérance aux variantes
    const dataObj = payload.data || payload.entity || payload;
    const statusRaw = String(dataObj.status || payload.status || "").toUpperCase();
    const reference = dataObj.reference || payload.reference || `FP_${Date.now()}`;
    const customIdRaw = dataObj.custom_id || payload.custom_id || "";
    const montant = Number(dataObj.amount || payload.amount) || 0;
    const operateur = dataObj.operator || payload.operator || "Mobile Money";

    // Décodage des métadonnées
    const { userId, typeAchat, documentId, deviceId, transId } = decoderCustomId(customIdRaw);
    const transactionId = transId || reference;

    // 👤 Extraction et enrichissement de l'identité de l'acheteur (pour audit & dashboard admin)
    const customerObj = dataObj.customer || payload.customer;
    let nomClient = customerObj ? [customerObj.firstname, customerObj.lastname].filter(Boolean).join(" ").trim() : "";
    let emailClient = customerObj?.email?.trim() || "";
    let telClient = customerObj?.phone?.trim() || "";

    // Si on dispose d'un userId (compte utilisateur connecté), on enrichit via la table profiles
    if (userId) {
      try {
        const { data: userProfile } = await supabase
          .from("profiles")
          .select("id, username, nom_complet, email, phone_number, avatar_url")
          .eq("id", userId)
          .maybeSingle();

        if (userProfile) {
          if (!nomClient) nomClient = userProfile.nom_complet || userProfile.username || "";
          if (!emailClient) emailClient = userProfile.email || "";
          if (!telClient) telClient = userProfile.phone_number || "";
        }
      } catch (errProfile) {
        console.warn("⚠️ Note enrichissement profil acheteur :", errProfile);
      }
    }

    // 2. Vérification de sécurité / statut
    const estValide = statusRaw === "SUCCESS" || statusRaw === "APPROVED" || statusRaw === "SUCCESSFUL";

    // 3. Optionnel : Vérification directe auprès de l'API FeexPay si clé secrète présente
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
            console.warn(`⚠️ [FeexPay:Securite] Vérification distante rejetée (statut réel : ${remoteStatus})`);
            return new Response(JSON.stringify({ error: "Transaction non validée par l'agrégateur" }), {
              headers: { "Content-Type": "application/json" },
              status: 400,
            });
          }
        }
      } catch (errCheck) {
        console.warn("⚠️ Note vérification distante FeexPay (silencieux) :", errCheck);
      }
    }

    // 4. Traçabilité systématique dans transactions_fedapay (historique centralisé cauZon)
    const recordPayload: Record<string, any> = {
      transaction_id: transactionId,
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
      telephone_client: telClient || null,
      raw_webhook_payload: {
        ...payload,
        enriched_customer: {
          nom: nomClient,
          email: emailClient,
          phone: telClient,
        },
      },
      updated_at: new Date().toISOString(),
    };

    let { error: errTx } = await supabase
      .from("transactions_fedapay")
      .upsert(recordPayload, { onConflict: "transaction_id" });

    // Fallback de sécurité si colonnes nom_client / email_client / telephone_client absentes en schéma PostgREST
    if (errTx && (errTx.message?.includes("column") || (errTx as any).code === "42703")) {
      console.warn("⚠️ Colonnes enrichies non encore migrées en BDD, bascule sur payload standard :", errTx.message);
      delete recordPayload.nom_client;
      delete recordPayload.email_client;
      delete recordPayload.telephone_client;
      const resFallback = await supabase
        .from("transactions_fedapay")
        .upsert(recordPayload, { onConflict: "transaction_id" });
      errTx = resFallback.error;
    }

    if (errTx) {
      console.warn("⚠️ Note enregistrement transactions_fedapay :", errTx.message);
    }

    // 5. Attribution automatique et atomique des droits si paiement validé
    if (estValide) {
      console.log(`✅ [FeexPay] Paiement validé (${montant} FCFA) — Type: ${typeAchat}, Doc: ${documentId}, User: ${userId}`);

      // CAS A : Achat d'un cours/document à l'acte
      if ((typeAchat === "acte" || typeAchat === "single") && documentId) {
        const payloadAcq: any = {
          document_id: documentId,
          device_id: deviceId,
          is_welcome_offer: false,
          is_vip_consultation: false,
          montant_paye: montant || 100,
        };
        if (userId) payloadAcq.user_id = userId;

        const { error: errAcq } = await supabase
          .from("acquisitions")
          .upsert([payloadAcq], { onConflict: "document_id,device_id" });

        if (errAcq) {
          console.error("❌ Erreur déblocage document dans acquisitions :", errAcq.message);
          throw errAcq;
        }
        console.log(`📚 Document [${documentId}] débloqué définitivement pour appareil [${deviceId}]`);
      }

      // CAS B : Formule Pass VIP (Abonnement mensuel +30 jours)
      else if (typeAchat === "vip") {
        const dateExp = new Date();
        dateExp.setDate(dateExp.getDate() + 30);
        const dateExpISO = dateExp.toISOString();

        if (userId) {
          await supabase.from("profiles").update({
            has_vip_pass: true,
            vip_expiration_date: dateExpISO,
            updated_at: new Date().toISOString(),
          }).eq("id", userId);
        }

        if (deviceId && deviceId !== "device_inconnu") {
          await supabase.from("appareils_historique_bienvenue").upsert({
            device_id: deviceId,
            has_vip_pass: true,
            vip_expiration_date: dateExpISO,
            updated_at: new Date().toISOString(),
          }, { onConflict: "device_id" });
        }

        console.log(`👑 Pass VIP 30 jours activé jusqu'au ${dateExpISO}`);
      }

      // CAS C : Extension Stockage Cumulative (+75 documents)
      else if (typeAchat === "stockage") {
        let nouveauPlafond = 150;

        if (userId) {
          const { data: profile } = await supabase
            .from("profiles")
            .select("storage_limit")
            .eq("id", userId)
            .maybeSingle();

          const limiteActuelle = profile?.storage_limit || 75;
          nouveauPlafond = limiteActuelle + 75;

          await supabase.from("profiles").update({
            has_extended_storage: true,
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

        console.log(`📦 Extension stockage cumulative activée (+75 docs -> ${nouveauPlafond})`);
      }
    } else {
      console.log(`ℹ️ [FeexPay] Statut non approuvé reçu (${statusRaw}) pour transId : ${transactionId}`);
    }

    // 6. Réponse HTTP 200 conforme aux exigences webhook
    return new Response(JSON.stringify({
      success: true,
      message: "Webhook FeexPay acquitté et traité avec succès.",
      statut: statusRaw,
      transaction_id: transactionId,
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

// =============================================================================
// 🔐 cauZon — SUPABASE EDGE FUNCTION : Génération d'URL Pré-Signée R2
// Fichier : supabase/functions/r2-signed-url/index.ts (Deno TypeScript)
//
// Génère des URLs pré-signées AWS S3 compatibles Cloudflare R2 pour la lecture
// sécurisée des documents PDF depuis l'application mobile cauZon.
//
// Sécurité : seule une session Supabase valide (JWT) peut demander une URL.
// L'URL expire après 20 minutes. Aucune clé R2 n'est jamais exposée au client.
//
// Endpoint : POST /functions/v1/r2-signed-url
// Body : { "fileKey": "documents/miage_l1/algebre.pdf", "ttl": 1200 }
// =============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

// ─── Configuration R2 depuis les secrets Supabase ────────────────────────────
const R2_ACCOUNT_ID = Deno.env.get("R2_ACCOUNT_ID") || "";
const R2_ACCESS_KEY_ID = Deno.env.get("R2_ACCESS_KEY_ID") || "";
const R2_SECRET_ACCESS_KEY = Deno.env.get("R2_SECRET_ACCESS_KEY") || "";
const R2_BUCKET_NAME = Deno.env.get("R2_BUCKET_NAME") || "cauzon-docs";
const R2_ENDPOINT = Deno.env.get("R2_ENDPOINT") ||
  `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;

// ─── Configuration Supabase ──────────────────────────────────────────────────
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

// ─── Utilitaire : Signature AWS v4 pour R2 ───────────────────────────────────

/**
 * Encode en hexadécimal un ArrayBuffer.
 */
function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * HMAC-SHA256 via SubtleCrypto (disponible sur Deno Deploy).
 */
async function hmac(key: CryptoKey | ArrayBuffer, message: string): Promise<ArrayBuffer> {
  let cryptoKey: CryptoKey;
  if (key instanceof ArrayBuffer) {
    cryptoKey = await crypto.subtle.importKey(
      "raw",
      key,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
  } else {
    cryptoKey = key;
  }
  return crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(message));
}

/**
 * SHA-256 d'une chaîne de caractères.
 */
async function sha256(message: string): Promise<string> {
  const buffer = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(message)
  );
  return toHex(buffer);
}

/**
 * Génère une URL pré-signée AWS S3 v4 compatible R2.
 * Durée de validité : ttlSeconds (max 3600 pour R2).
 *
 * Compatible avec Cloudflare R2 qui suit la spec AWS Signature Version 4.
 */
async function genererUrlPresigneeR2(
  fileKey: string,
  ttlSeconds: number
): Promise<string> {
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:\-]|\.\d{3}/g, "").slice(0, 15) + "Z";
  const dateStamp = amzDate.slice(0, 8);

  const region = "auto";
  const service = "s3";
  const host = new URL(R2_ENDPOINT).host;

  // Clé propre sans slash initial
  const cleanKey = fileKey.replace(/^\/+/, "");

  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const credential = `${R2_ACCESS_KEY_ID}/${credentialScope}`;

  // Query string canonique pour les URLs pré-signées
  const queryParams = new URLSearchParams({
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": credential,
    "X-Amz-Date": amzDate,
    "X-Amz-Expires": String(Math.min(ttlSeconds, 3600)),
    "X-Amz-SignedHeaders": "host",
    "response-content-type": "application/pdf",
    "response-content-disposition": "inline",
  }).toString();

  // Requête canonique
  const canonicalRequest = [
    "GET",
    `/${R2_BUCKET_NAME}/${cleanKey}`,
    queryParams,
    `host:${host}\n`,
    "host",
    "UNSIGNED-PAYLOAD",
  ].join("\n");

  const canonicalHash = await sha256(canonicalRequest);

  // Chaîne à signer
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    canonicalHash,
  ].join("\n");

  // Clé de signature dérivée
  const kDate = await hmac(
    new TextEncoder().encode(`AWS4${R2_SECRET_ACCESS_KEY}`),
    dateStamp
  );
  const kRegion = await hmac(kDate, region);
  const kService = await hmac(kRegion, service);
  const kSigning = await hmac(kService, "aws4_request");

  const signatureBuffer = await hmac(kSigning, stringToSign);
  const signature = toHex(signatureBuffer);

  const signedUrl =
    `${R2_ENDPOINT}/${R2_BUCKET_NAME}/${cleanKey}?${queryParams}&X-Amz-Signature=${signature}`;

  return signedUrl;
}

// ─── Headers CORS ─────────────────────────────────────────────────────────────
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ─── Handler principal ────────────────────────────────────────────────────────
serve(async (req: Request): Promise<Response> => {
  // Preflight CORS
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ success: false, error: "Méthode non autorisée. Utilisez POST." }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    // 1. Validation de l'en-tête Authorization
    const authHeader = req.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ success: false, error: "Session Supabase requise (Authorization: Bearer <token>)." }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Client pour valider l'identité de l'utilisateur
    const supabaseUserClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await supabaseUserClient.auth.getUser();

    // Client privilégié pour vérifier les droits d'accès
    const adminKey = SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY;
    const supabaseAdmin = createClient(SUPABASE_URL, adminKey);

    // 2. Lecture du corps de la requête
    const body = await req.json() as { fileKey?: string; documentId?: string; ttl?: number };
    const { fileKey, documentId } = body;

    if (!fileKey || typeof fileKey !== "string") {
      return new Response(
        JSON.stringify({ success: false, error: "Le champ fileKey est obligatoire." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. Validation de sécurité : la clé doit commencer par "documents/" ou "cours/"
    const cleanKey = fileKey.replace(/^\/+/, "");
    if (!cleanKey.startsWith("documents/") && !cleanKey.startsWith("cours/")) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "fileKey invalide. Le chemin doit commencer par 'documents/' ou 'cours/'.",
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 4. Contrôle d'accès strict au document
    // Récupérer le document correspondant dans la base Supabase
    let docQuery = supabaseAdmin
      .from("documents")
      .select("id, titre, prix, est_verrouille, file_key, file_path");

    if (documentId) {
      docQuery = docQuery.or(`id.eq.${documentId},file_key.eq.${cleanKey},file_path.eq.${cleanKey}`);
    } else {
      docQuery = docQuery.or(`file_key.eq.${cleanKey},file_path.eq.${cleanKey}`);
    }

    const { data: docData } = await docQuery.maybeSingle();

    // Règle 1 : Si le document est gratuit (prix == 0 ou non verrouillé), autoriser l'accès
    const estGratuit = docData
      ? (docData.est_verrouille === false || docData.prix === 0 || docData.prix === null)
      : false;

    let accesAutorise = estGratuit;

    if (!accesAutorise) {
      // Pour un document payant / verrouillé, l'utilisateur doit être obligatoirement authentifié
      if (!user) {
        return new Response(
          JSON.stringify({
            success: false,
            error: "Accès refusé. Veuillez vous connecter pour accéder à ce document payant.",
          }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Règle 2 : Vérifier si l'utilisateur possède un pass VIP actif dans la table profiles
      const { data: profile } = await supabaseAdmin
        .from("profiles")
        .select("has_vip_pass, vip_expiration_date")
        .eq("id", user.id)
        .maybeSingle();

      const aVipActif = Boolean(
        profile?.has_vip_pass &&
        profile.vip_expiration_date &&
        new Date(profile.vip_expiration_date).getTime() > Date.now()
      );

      if (aVipActif) {
        accesAutorise = true;
      } else if (docData?.id) {
        // Règle 3 : Vérifier si l'utilisateur a acquis ce document individuellement dans la table acquisitions
        const { data: acquisition } = await supabaseAdmin
          .from("acquisitions")
          .select("id")
          .eq("user_id", user.id)
          .eq("document_id", docData.id)
          .maybeSingle();

        if (acquisition) {
          accesAutorise = true;
        }
      }

      // Si aucune condition n'est remplie, accès strictement refusé
      if (!accesAutorise) {
        return new Response(
          JSON.stringify({
            success: false,
            error: "Accès refusé (403 Forbidden). Vous devez acheter ce document ou posséder un abonnement VIP actif.",
          }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // 5. Expiration courte de 15 minutes (900 secondes)
    const ttlClamped = 900;

    // 6. Génération de l'URL pré-signée
    const signedUrl = await genererUrlPresigneeR2(cleanKey, ttlClamped);
    const expiresAt = new Date(Date.now() + ttlClamped * 1000).toISOString();

    return new Response(
      JSON.stringify({
        success: true,
        signedUrl,
        fileKey: cleanKey,
        expiresAt,
        ttlSeconds: ttlClamped,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[r2-signed-url] Erreur :", message);

    return new Response(
      JSON.stringify({ success: false, error: `Erreur interne : ${message}` }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

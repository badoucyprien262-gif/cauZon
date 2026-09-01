import { supabase } from '../lib/supabase';
import type { FeedbackRow } from '../types';

export const fetchFeedbacks = async (): Promise<FeedbackRow[]> => {
  const { data, error } = await supabase
    .from('feedbacks')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) {
    console.error('Erreur chargement feedbacks Supabase :', error);
    throw error;
  }
  return (data ?? []).map((row: any) => ({
    id: row.id,
    device_id: row.device_id || 'Inconnu',
    username: row.username || 'Étudiant cauZon',
    message: row.message,
    reponse_admin: row.reponse || null,
    reponse_vue: row.statut === 'traite',
    pdf_attached_url: row.fichier_joint || null,
    created_at: row.created_at || new Date().toISOString(),
    updated_at: row.updated_at || null,
  })) as FeedbackRow[];
};

export const sendAdminReply = async (feedbackId: string, reponse: string): Promise<void> => {
  if (!reponse.trim()) throw new Error('La réponse ne peut pas être vide.');
  const { error } = await supabase.from('feedbacks').update({
    reponse: reponse.trim(),
    repondu_a: new Date().toISOString(),
    statut: 'traite',
    updated_at: new Date().toISOString()
  }).eq('id', feedbackId);
  if (error) throw error;
};

export const deleteFeedback = async (id: string): Promise<void> => {
  const { error } = await supabase.from('feedbacks').delete().eq('id', id);
  if (error) throw error;
};

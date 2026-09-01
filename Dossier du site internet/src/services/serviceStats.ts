import { supabase } from '../lib/supabase';

export interface PlatformLiveStats {
  documentsCount: number;
  certifiesCount: number;
}

export const fetchLivePlatformStats = async (): Promise<PlatformLiveStats> => {
  try {
    const { count: docsCount } = await supabase
      .from('documents')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'published');

    const { count: certCount } = await supabase
      .from('documents')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'published')
      .eq('est_certifie', true);

    return {
      documentsCount: docsCount && docsCount > 0 ? docsCount : 28,
      certifiesCount: certCount && certCount > 0 ? certCount : 28,
    };
  } catch {
    return {
      documentsCount: 28,
      certifiesCount: 28,
    };
  }
};

// Único ponto que cria o cliente do Supabase. Só arquivos de src/dados/ importam daqui.
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.58.0/+esm';
import { SUPABASE_URL, SUPABASE_CHAVE_PUBLICA } from '../config.js';

// O link de "Esqueci a senha" chega como #access_token=...&type=recovery.
// Guardamos isso antes do Supabase limpar o endereço.
export const chegouPeloLinkDeNovaSenha = /(^|[#&])type=recovery(&|$)/.test(globalThis.location?.hash ?? '');

export const supabase = createClient(SUPABASE_URL, SUPABASE_CHAVE_PUBLICA, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: 'implicit',
  },
});

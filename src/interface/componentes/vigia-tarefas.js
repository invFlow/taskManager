// Mantém uma tela de tarefas em dia (até o tempo real da etapa 6):
//  - recarrega quando alguma tarefa muda (evento "invflow:tarefas"),
//    quando a janela volta a ficar visível e a cada 5 minutos;
//  - redesenha a cada minuto (selo "Atrasada", "há 45 min"), menos com menu ou janela aberta.
// Para sozinho quando a tela sai da página.

export function vigiarTarefas(raiz, { carregar, desenhar }) {
  const aoMudar = () => { if (!raiz.isConnected) return parar(); carregar(); };
  const aoVoltar = () => { if (document.visibilityState === 'visible') aoMudar(); };
  window.addEventListener('invflow:tarefas', aoMudar);
  document.addEventListener('visibilitychange', aoVoltar);
  const relogio = setInterval(() => {
    if (!raiz.isConnected) return parar();
    if (!document.querySelector('details.menu-mais[open], dialog[open]')) desenhar();
  }, 60_000);
  const recarga = setInterval(() => {
    if (!raiz.isConnected) return parar();
    if (document.visibilityState === 'visible') carregar();
  }, 5 * 60_000);
  function parar() {
    window.removeEventListener('invflow:tarefas', aoMudar);
    document.removeEventListener('visibilitychange', aoVoltar);
    clearInterval(relogio);
    clearInterval(recarga);
  }
  return parar;
}

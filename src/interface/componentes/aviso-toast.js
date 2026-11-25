// Aviso rápido no rodapé ("Salvo", "Algo deu errado").
let timer;
export function mostrarAviso(texto, { tipo = 'info', duracao = 3500 } = {}) {
  const aviso = document.getElementById('aviso');
  if (!aviso) return;
  aviso.textContent = texto;
  aviso.dataset.tipo = tipo;
  aviso.hidden = false;
  clearTimeout(timer);
  timer = setTimeout(() => { aviso.hidden = true; }, duracao);
}

// Estado de filtros guardado na URL (?tipo=cotacao&resultado=falhou):
// o link pode ser mandado pronto para outra pessoa, e o filtro sobrevive a
// ir e voltar de outra tela.

export function lerFiltros(padroes = {}) {
    const q = new URLSearchParams(window.location.search);
    const saida = { ...padroes };
    Object.keys(padroes).forEach((chave) => {
        if (q.has(chave)) saida[chave] = q.get(chave);
    });
    return saida;
}

export function gravarFiltros(filtros, padroes = {}) {
    const url = new URL(window.location.href);
    Object.entries(filtros).forEach(([chave, valor]) => {
        if (valor === undefined || valor === null || valor === '' || valor === padroes[chave]) url.searchParams.delete(chave);
        else url.searchParams.set(chave, valor);
    });
    window.history.replaceState(null, '', url);
}

/**
 * Liga um controle segmentado (<div class="segmentado" data-filtro="tipo">
 * com <button data-valor="...">) a um objeto de filtros.
 */
export function ligarSegmentado(raiz, filtros, chave, aoMudar) {
    const el = typeof raiz === 'string' ? document.querySelector(raiz) : raiz;
    if (!el) return;
    const marcar = () => el.querySelectorAll('[data-valor]').forEach((b) => {
        b.setAttribute('aria-pressed', String(b.dataset.valor === String(filtros[chave] ?? '')));
    });
    el.addEventListener('click', (ev) => {
        const botao = ev.target.closest('[data-valor]');
        if (!botao) return;
        filtros[chave] = botao.dataset.valor;
        marcar();
        aoMudar(filtros);
    });
    marcar();
}

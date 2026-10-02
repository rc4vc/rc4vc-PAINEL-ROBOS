// Atualização automática que respeita a pessoa e a máquina:
// - pausa quando a aba está escondida (não gasta a Central à toa)
// - atualiza na hora quando a aba volta a ficar visível
// - anuncia a última atualização num elemento com aria-live, se houver
//
//   const parar = aCada(30_000, carregar, { rotulo: '#ultima-atualizacao' });

export function aCada(intervaloMs, fn, { rotulo = null, imediato = true } = {}) {
    let timer = null;
    let rodando = false;
    let parado = false;
    // Pedido de "atualize agora" que chegou durante uma atualização em curso:
    // não pode ser descartado (a tela mostraria o estado de ANTES da ação que
    // a pessoa acabou de fazer). Roda de novo assim que a atual terminar.
    let pendente = false;

    const alvoRotulo = typeof rotulo === 'string' ? document.querySelector(rotulo) : rotulo;

    async function executar() {
        if (parado) return;
        if (rodando) { pendente = true; return; }
        rodando = true;
        try {
            do {
                pendente = false;
                await fn();
            } while (pendente && !parado);
            if (alvoRotulo) {
                alvoRotulo.textContent = `Atualizado às ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
            }
        } finally {
            rodando = false;
        }
    }

    function agendar() {
        clearTimeout(timer);
        if (parado || document.hidden) return;
        timer = setTimeout(async () => { await executar(); agendar(); }, intervaloMs);
    }

    function aoMudarVisibilidade() {
        if (document.hidden) clearTimeout(timer);
        else { executar().then(agendar); }
    }

    document.addEventListener('visibilitychange', aoMudarVisibilidade);
    if (imediato) executar().then(agendar); else agendar();

    return {
        agora: () => executar().then(agendar),
        parar: () => { parado = true; clearTimeout(timer); document.removeEventListener('visibilitychange', aoMudarVisibilidade); },
    };
}

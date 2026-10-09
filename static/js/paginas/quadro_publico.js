// O que vem por aí (sem login, antes "Kanban"): o mesmo quadro de 4 colunas
// do "Em construção" da Central, só leitura, sem banner e sem os robôs que já
// estão ativos (09-10-2026). Só a API pública construcoes-publicas.

import { html, montar, erroEmBloco } from '../core/ui.js';
import { relativo } from '../core/format.js';
import { aCada } from '../core/atualizacao.js';

const COLUNAS = [
// [chave, título, ícone, o que quer dizer] — a frase aparece no topo da coluna.
    ['planejado', 'Planejado', 'lightbulb', 'Ideias na fila.'],
    ['em_desenvolvimento', 'Em desenvolvimento', 'code-slash', 'Sendo construídas agora.'],
    ['pronto_para_testar', 'Pronto para testar', 'clipboard-check', 'Esperando o teste da equipe.'],
    ['em_producao', 'Em produção', 'rocket-takeoff', 'Já rodam sozinhas.'],
];

// API na Central; arquivo JSON no site estático (GitHub Pages). O `t=`
// fura o cache do Pages (~10 min) para pegar a última publicação.
const FONTE = document.querySelector('[data-fonte]').dataset.fonte;
// No GitHub Pages: os números do rc4vc.com/central, republicados a cada
// minuto. Se ele falhar ou demorar, vale a cópia do próprio site (FONTE).
const FONTE_AO_VIVO = document.querySelector('[data-fonte]').dataset.fonteAoVivo;

async function obter(url, { limiteMs } = {}) {
    const r = await fetch(`${url}${url.includes('?') ? '&' : '?'}t=${Date.now()}`, {
        headers: { Accept: 'application/json' },
        signal: limiteMs ? AbortSignal.timeout(limiteMs) : undefined,
    });
    if (!r.ok) throw new Error(`A Central respondeu com erro (HTTP ${r.status}).`);
    return r.json();
}

async function obterDados() {
    if (FONTE_AO_VIVO) {
        try { return await obter(FONTE_AO_VIVO, { limiteMs: 10_000 }); } catch (erro) { /* cópia local abaixo */ }
    }
    return obter(FONTE);
}

const recentes = (lista) => lista.slice().sort((a, b) => String(b.atualizado_em).localeCompare(String(a.atualizado_em)));


// Um nome curto por seguradora, igual nas três telas públicas (09-10-2026).
const NOMES_CURTOS = { AKAD: 'Akad', UNIMED: 'Unimed', 'PORTO SEGUROS': 'Porto', 'PORTO SEGURO': 'Porto', 'TOKIO MARINE': 'Tokio' };
function seguradoraCurta(s) {
    const t = String(s || '').trim();
    if (!t || /^todas$/i.test(t) || t.includes('/')) return 'Todas as seguradoras';
    return NOMES_CURTOS[t.toUpperCase()] || t;
}



// Kanban IGUAL ao "Em construção" da Central (09-10-2026, pedido do
// responsável): quatro colunas lado a lado, cada uma com ícone, título e
// contagem, e uma ficha por automação — "nome · seguradora", a descrição
// pública e "atualizado há X". Só leitura: sem arrastar, mover ou editar.
// Mesma estrutura de em_construcao.js; mudou lá, mudar aqui.
function desenharQuadro(q) {
    montar('#quadro', COLUNAS.map(([chave, titulo, icone]) => {
        // Robôs ativos (fichas que vêm do cadastro, com rpa_id) ficam fora do
        // quadro (09-10-2026, pedido do responsável): o Kanban mostra o que
        // está sendo construído; quem já roda é acompanhado no Painel ao vivo.
        const fichas = recentes((q[chave] || []).filter((x) => !x.rpa_id));
        return html`<section class="kanban-coluna" data-coluna="${chave}" aria-labelledby="col-${chave}">
            <div class="kanban-coluna-topo"><i class="bi bi-${icone}" aria-hidden="true"></i><h2 id="col-${chave}">${titulo}</h2><span class="selo kanban-contagem" data-estado="neutro">${fichas.length}</span></div>
            ${fichas.length ? fichas.map((x) => html`<article class="kanban-ficha">
                <h3>${x.tipo_rpa} · ${seguradoraCurta(x.seguradora)}</h3>
                ${x.descricao ? html`<p>${x.descricao}</p>` : ''}
                <div class="kanban-ficha-rodape"><span class="minimo fraco">atualizado ${relativo(x.atualizado_em)}</span></div>
            </article>`) : html`<div class="minimo fraco" style="padding: var(--e-3)">Nada aqui.</div>`}
        </section>`;
    }));
}

async function carregar() {
    let q;
    try {
        q = await obterDados();
    } catch (erro) {
        montar('#quadro', erroEmBloco(erro, carregar));
        return;
    }
    desenharQuadro(q);
}

aCada(60_000, carregar, { rotulo: '#ultima-atualizacao' });

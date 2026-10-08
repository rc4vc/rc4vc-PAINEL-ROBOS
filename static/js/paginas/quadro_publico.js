// Quadro ao vivo (sem login): o "Em construção" contado como história - a
// manchete diz o que está andando, os números contam cada coluna e o quadro
// mostra os cartões. Só a API pública construcoes-publicas.

import { html, montar, $, erroEmBloco } from '../core/ui.js';
import { relativo, plural } from '../core/format.js';
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

function desenharManchete(q) {
    const n = (k) => (q[k] || []).length;
    const andando = n('em_desenvolvimento') + n('pronto_para_testar');
    const ultimaEntrega = recentes(q.em_producao || [])[0];
    montar('#manchete-texto', andando
        ? html`<em>${plural(andando, 'automação está andando', 'automações estão andando')}</em>: ${n('em_desenvolvimento')} em desenvolvimento e ${n('pronto_para_testar')} ${n('pronto_para_testar') === 1 ? 'pronta' : 'prontas'} para testar.`
        : html`Nenhuma automação em construção agora; <em>${plural(n('em_producao'), 'já está em produção', 'já estão em produção')}</em>.`);
    $('#manchete-contexto').textContent = [
        n('planejado') ? `${plural(n('planejado'), 'ideia espera', 'ideias esperam')} na fila.` : 'A fila de ideias está vazia.',
        ultimaEntrega ? `A mais recente em produção: ${ultimaEntrega.tipo_rpa} (${ultimaEntrega.seguradora}), ${relativo(ultimaEntrega.atualizado_em)}.` : '',
    ].filter(Boolean).join(' ');
}

function desenharQuadro(q) {
    montar('#quadro-vivo', COLUNAS.map(([chave, titulo, icone, frase]) => {
        const cartoes = recentes(q[chave] || []);
        return html`<section class="quadro-coluna" data-coluna="${chave}" aria-label="${titulo}">
            <header><i class="bi bi-${icone}" aria-hidden="true"></i><h3>${titulo}</h3><span class="selo" data-estado="neutro">${cartoes.length}</span><p>${frase}</p></header>
            ${cartoes.length ? cartoes.map((c) => html`<article class="quadro-cartao">
                <h4>${c.tipo_rpa}</h4>
                <span class="chip-robo">${c.seguradora}</span>
                ${c.descricao ? html`<p>${c.descricao}</p>` : ''}
                <span class="minimo fraco">${c.rpa_id ? `robô da Central, entrou ${relativo(c.criado_em)}` : `atualizado ${relativo(c.atualizado_em)}`}</span>
            </article>`) : html`<p class="minimo fraco quadro-vazio">Nada aqui agora.</p>`}
        </section>`;
    }));
}

async function carregar() {
    let q;
    try {
        q = await obterDados();
    } catch (erro) {
        montar('#quadro-vivo', erroEmBloco(erro, carregar));
        return;
    }
    desenharManchete(q);
    desenharQuadro(q);
}

aCada(60_000, carregar, { rotulo: '#ultima-atualizacao' });

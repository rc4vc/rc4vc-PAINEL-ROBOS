// Quadro ao vivo (sem login): o "Em construção" contado como história - a
// manchete diz o que está andando, os números contam cada coluna e o quadro
// mostra os cartões. Só a API pública construcoes-publicas.

import { html, montar, $, erroEmBloco } from '../core/ui.js';
import { relativo, plural } from '../core/format.js';
import { aCada } from '../core/atualizacao.js';

const COLUNAS = [
    ['planejado', 'Planejado', 'lightbulb', 'a ideia já está anotada'],
    ['em_desenvolvimento', 'Em desenvolvimento', 'code-slash', 'sendo construída agora'],
    ['pronto_para_testar', 'Pronto para testar', 'clipboard-check', 'esperando o teste da equipe'],
    ['em_producao', 'Em produção', 'rocket-takeoff', 'já roda sozinha'],
];

// API na Central; arquivo JSON no site estático (GitHub Pages). O `t=`
// fura o cache do Pages (~10 min) para pegar a última publicação.
const FONTE = document.querySelector('[data-fonte]').dataset.fonte;

async function obter(url) {
    const r = await fetch(`${url}${url.includes('?') ? '&' : '?'}t=${Date.now()}`, { headers: { Accept: 'application/json' } });
    if (!r.ok) throw new Error(`A Central respondeu com erro (HTTP ${r.status}).`);
    return r.json();
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

function desenharNumeros(q) {
    COLUNAS.forEach(([chave, , , frase]) => {
        const el = document.getElementById(`kpi-${chave}`);
        montar(el.querySelector('[data-valor]'), html`${(q[chave] || []).length}`);
        el.querySelector('[data-nota]').textContent = frase;
    });
}

function desenharQuadro(q) {
    montar('#quadro-vivo', COLUNAS.map(([chave, titulo, icone]) => {
        const cartoes = recentes(q[chave] || []);
        return html`<section class="quadro-coluna" data-coluna="${chave}" aria-label="${titulo}">
            <header><i class="bi bi-${icone}" aria-hidden="true"></i><h3>${titulo}</h3><span class="selo" data-estado="neutro">${cartoes.length}</span></header>
            ${cartoes.length ? cartoes.map((c) => html`<article class="quadro-cartao">
                <h4>${c.tipo_rpa}</h4>
                <span class="chip-robo">${c.seguradora}</span>
                ${c.descricao ? html`<p>${c.descricao}</p>` : ''}
                <span class="minimo fraco">atualizado ${relativo(c.atualizado_em)}</span>
            </article>`) : html`<p class="minimo fraco quadro-vazio">Nada aqui agora.</p>`}
        </section>`;
    }));
}

async function carregar() {
    let q;
    try {
        q = await obter(FONTE);
    } catch (erro) {
        montar('#quadro-vivo', erroEmBloco(erro, carregar));
        return;
    }
    desenharManchete(q);
    desenharNumeros(q);
    desenharQuadro(q);
}

aCada(60_000, carregar, { rotulo: '#ultima-atualizacao' });

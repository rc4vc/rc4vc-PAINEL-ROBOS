// O que vem por aí (sem login, antes "Kanban"): o "Em construção" contado como
// história - a manchete diz o que está chegando e o que já trabalha, a
// esteira mostra as 4 etapas e o que está em produção vem agrupado por tipo
// (09-10-2026). Só a API pública construcoes-publicas.

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

// "Novo" = entrou em produção nos últimos 15 dias.
const DIAS_NOVO = 15;
const diasDesde = (iso) => (Date.now() - new Date(`${String(iso).replace(/Z$/, '')}Z`).getTime()) / 86_400_000;
const novo = (c) => diasDesde(c.criado_em) <= DIAS_NOVO;

// Um nome curto por seguradora, igual nas três telas públicas (09-10-2026).
const NOMES_CURTOS = { AKAD: 'Akad', UNIMED: 'Unimed', 'PORTO SEGUROS': 'Porto', 'PORTO SEGURO': 'Porto', 'TOKIO MARINE': 'Tokio' };
function seguradoraCurta(s) {
    const t = String(s || '').trim();
    if (!t || /^todas$/i.test(t) || t.includes('/')) return 'Todas as seguradoras';
    return NOMES_CURTOS[t.toUpperCase()] || t;
}

// Em produção, por TIPO de trabalho (09-10-2026): a mesma descrição deixava de
// se repetir 7 vezes. O tipo sai do nome do robô; cartão sem robô = ferramenta.
const TIPOS = [
    ['apolices', 'Apólices e comissão', 'baixam apólices e extratos e conferem a comissão', (c) => /^ap[oó]lices/i.test(c.tipo_rpa)],
    ['cotacoes', 'Cotações', 'cotam nos portais e gravam os preços para o comercial', (c) => /^cota[cç]/i.test(c.tipo_rpa)],
    ['renovacoes', 'Renovações', 'preparam as renovações de madrugada', (c) => /^renova/i.test(c.tipo_rpa)],
    ['propostas', 'Propostas', 'criam a proposta e enviam o link de pagamento', (c) => /^propostas/i.test(c.tipo_rpa)],
    ['ferramentas', 'Ferramentas', 'apoio à equipe, não rodam sozinhas', (c) => !c.rpa_id],
    ['relatorios', 'Relatórios e avisos', 'juntam, conferem e avisam a equipe', () => true],
];
const tipoDe = (c) => TIPOS.find(([, , , cabe]) => cabe(c))[0];

function desenharManchete(q) {
    const n = (k) => (q[k] || []).length;
    const andando = n('em_desenvolvimento') + n('pronto_para_testar');
    const producao = q.em_producao || [];
    const robos = producao.filter((c) => c.rpa_id).length;
    const ferramentas = producao.length - robos;
    montar('#manchete-texto', andando
        ? html`<span class="destaque-ok">${plural(andando, 'automação está chegando', 'automações estão chegando')}</span>: ${n('em_desenvolvimento')} em desenvolvimento e ${n('pronto_para_testar')} ${n('pronto_para_testar') === 1 ? 'pronta' : 'prontas'} para testar.`
        : html`Nada em construção agora. <span class="destaque-ok">${plural(robos, 'robô', 'robôs')}</span> já ${robos === 1 ? 'trabalha' : 'trabalham'} sozinhos.`);
    const ultima = producao.slice().sort((a, b) => String(b.criado_em).localeCompare(String(a.criado_em))).find((c) => c.rpa_id);
    const novos = producao.filter(novo).length;
    $('#manchete-contexto').textContent = [
        n('planejado') ? `${plural(n('planejado'), 'ideia espera', 'ideias esperam')} na fila.` : 'A fila de ideias está vazia.',
        ultima ? `A entrada mais recente foi ${ultima.tipo_rpa}, ${relativo(ultima.criado_em)}.` : '',
        novos ? `${plural(novos, 'automação entrou', 'automações entraram')} nos últimos ${DIAS_NOVO} dias.` : '',
        ferramentas ? `Além dos robôs, ${plural(ferramentas, 'ferramenta apoia', 'ferramentas apoiam')} a equipe.` : '',
    ].filter(Boolean).join(' ');
}

const cartao = (c) => html`<article class="cartao-producao">
    <div class="topo"><strong>${c.tipo_rpa}</strong>${novo(c) ? html`<span class="selo" data-estado="ok">Novo</span>` : ''}</div>
    <span class="nome">${seguradoraCurta(c.seguradora)}</span>
    <span class="quando">${c.rpa_id ? `entrou ${relativo(c.criado_em)}` : `atualizado ${relativo(c.atualizado_em)}`}</span>
</article>`;

function desenharQuadro(q) {
    // 1. A esteira: etapa vazia fica pequena (antes 3 colunas vazias ocupavam
    //    3/4 da largura e a produção virava uma coluna estreita e longa).
    montar('#esteira', COLUNAS.map(([chave, titulo, icone, frase]) => {
        const qtd = (q[chave] || []).length;
        return html`<li class="esteira-etapa" data-coluna="${chave}" data-cheia="${qtd ? 'sim' : ''}">
            <span class="topo"><span><i class="bi bi-${icone}" aria-hidden="true"></i>${titulo}</span><span class="selo" data-estado="${qtd && chave === 'em_producao' ? 'ok' : 'neutro'}">${qtd}</span></span>
            <p>${frase}${qtd ? '' : ' Nada agora.'}</p>
        </li>`;
    }));
    // O que está andando aparece em cartões, logo abaixo da esteira.
    const andando = ['planejado', 'em_desenvolvimento', 'pronto_para_testar'].flatMap((k) => recentes(q[k] || []).map((c) => ({ ...c, etapa: k })));
    montar('#andando', andando.length ? html`<div class="esteira-cartoes">${andando.map((c) => html`<article class="cartao-producao">
        <div class="topo"><strong>${c.tipo_rpa}</strong><span class="selo" data-estado="neutro">${COLUNAS.find(([k]) => k === c.etapa)[1]}</span></div>
        <span class="nome">${seguradoraCurta(c.seguradora)}</span>
        ${c.descricao ? html`<span class="quando">${c.descricao}</span>` : ''}
    </article>`)}</div>` : '');

    // 2. Em produção, por tipo de trabalho.
    const producao = recentes(q.em_producao || []);
    const grupos = TIPOS.map(([chave, titulo, oque]) => ({ chave, titulo, oque, itens: producao.filter((c) => tipoDe(c) === chave) }))
        .filter((g) => g.itens.length);
    montar('#producao', grupos.map((g) => html`<section class="producao-tipo" aria-label="${g.titulo}">
        <header><h3>${g.titulo}</h3><span>${plural(g.itens.length, 'automação', 'automações')} · ${g.oque}</span></header>
        <div class="esteira-cartoes">${g.itens.map(cartao)}</div>
    </section>`));
}

async function carregar() {
    let q;
    try {
        q = await obterDados();
    } catch (erro) {
        montar('#producao', erroEmBloco(erro, carregar));
        return;
    }
    desenharManchete(q);
    desenharQuadro(q);
}

aCada(60_000, carregar, { rotulo: '#ultima-atualizacao' });

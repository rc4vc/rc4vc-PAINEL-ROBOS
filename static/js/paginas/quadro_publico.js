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

// Identidade própria do Kanban (09-10-2026, pedido do responsável: "mais
// simples e objetiva"): um QUADRO DE LISTAS — um cartão por tipo de trabalho,
// uma linha por automação (nome, seguradora, desde quando). Sem anel e sem
// cartão que vira, que são do Painel ao vivo. A descrição pública fica no
// título da linha (passar o mouse).
const ETAPA_TEXTO = { planejado: 'Planejado', em_desenvolvimento: 'Em desenvolvimento', pronto_para_testar: 'Pronto para testar' };
const dataCurta = (iso) => new Date(`${String(iso).replace(/Z$/, '')}Z`).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });

function quandoDaLinha(c) {
    if (c.etapa) return ETAPA_TEXTO[c.etapa];
    if (!c.rpa_id) return `atualizada ${relativo(c.atualizado_em)}`;
    return `desde ${dataCurta(c.criado_em)}`;
}

const linha = (c) => html`<li class="kanban-linha" title="${c.descricao || ''}">
    <span class="ponto" data-estado="${c.etapa ? 'rodando' : (novo(c) ? 'ok' : 'neutro')}" aria-hidden="true"></span>
    <span class="kanban-nome">${c.tipo_rpa}${novo(c) && !c.etapa ? html` <span class="kanban-novo">novo</span>` : ''}</span>
    <span class="kanban-seg">${seguradoraCurta(c.seguradora)}</span>
    <span class="kanban-quando" title="${c.rpa_id ? `entrou ${relativo(c.criado_em)}` : ''}">${quandoDaLinha(c)}</span>
</li>`;

const cartaoLista = (titulo, oque, itens) => html`<section class="kanban-tipo" aria-label="${titulo}">
    <header><h3>${titulo}</h3><span class="selo" data-estado="neutro">${itens.length}</span>${oque ? html`<p>${oque}</p>` : ''}</header>
    <ul class="kanban-lista">${itens.map(linha)}</ul>
</section>`;

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
    // O que está andando aparece numa lista, logo abaixo da esteira.
    const andando = ['planejado', 'em_desenvolvimento', 'pronto_para_testar'].flatMap((k) => recentes(q[k] || []).map((c) => ({ ...c, etapa: k })));
    montar('#andando', andando.length ? html`<div class="kanban-tipos esteira-andando">${cartaoLista('Em andamento', 'da ideia ao teste', andando)}</div>` : '');

    // 2. Em produção, por tipo de trabalho.
    const producao = recentes(q.em_producao || []);
    const grupos = TIPOS.map(([chave, titulo, oque]) => ({ chave, titulo, oque, itens: producao.filter((c) => tipoDe(c) === chave) }))
        .filter((g) => g.itens.length);
    // Um cartão de lista por tipo, em colunas corridas: cada cartão encaixa
    // logo abaixo do anterior, sem fileira vazia.
    montar('#producao', html`<div class="kanban-tipos">${grupos.map((g) => cartaoLista(g.titulo, g.oque, g.itens))}</div>`);
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

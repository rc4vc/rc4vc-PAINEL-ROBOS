// Farol de cotações (sem login, 15-10-2026): em que pé está a atualização
// das cotações no nosso sistema, por seguradora x profissão (aba Planilha2
// da planilha do farol). Não fala de robô. A história em capítulos sai dos
// próprios dados, então continua certa depois de qualquer edição.
// Edição: só na Central, para operador/admin (`data-pode-editar`); grava
// tudo de uma vez em PUT /api/farol-cotacoes.

import { html, montar, $, aoClicar, erroEmBloco, toast } from '../core/ui.js';
import { aCada } from '../core/atualizacao.js';

const RAIZ = document.querySelector('[data-fonte]');
const FONTE = RAIZ.dataset.fonte;
const FONTE_AO_VIVO = RAIZ.dataset.fonteAoVivo;
const PODE_EDITAR = RAIZ.hasAttribute('data-pode-editar');

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const MESES_LONGOS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

// Estado da tela.
let farol = null;          // como veio da API
const rascunho = new Map(); // "seguradora|coluna" -> {situacao, data} | null (em branco)
let editando = false;
let selecionada = null;    // {seguradora, coluna}
let filtro = null;         // situação destacada pela legenda

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

// --- Leitura -----------------------------------------------------------------
const chave = (seguradora, coluna) => `${seguradora}|${coluna}`;
const nomeSituacao = (id) => farol.situacoes.find((s) => s.id === id)?.nome || id;
const nomeColuna = (c) => c.profissao + (c.tipo ? ` ${c.tipo}` : '');
const dataBR = (iso) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '');
const dataCurta = (iso) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(2, 4)}` : '');
const hojeIso = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const pct = (n, total) => (total ? `${Math.round((n / total) * 100)}%` : '0%');
const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;

/** Célula como está na tela (rascunho por cima do que veio da Central). */
function celula(seguradora, coluna) {
    const k = chave(seguradora, coluna);
    if (rascunho.has(k)) return rascunho.get(k);
    return farol.celulas[seguradora]?.[coluna] || null;
}
function celulaSalva(seguradora, coluna) {
    return farol.celulas[seguradora]?.[coluna] || null;
}
const iguais = (a, b) => (a?.situacao || null) === (b?.situacao || null) && (a?.data || null) === (b?.data || null);

function contar(filtroColuna = () => true, seguradoras = farol.seguradoras) {
    const c = Object.fromEntries(farol.situacoes.map((s) => [s.id, 0]));
    for (const s of seguradoras) {
        for (const col of farol.colunas) {
            if (!filtroColuna(col)) continue;
            const x = celula(s, col.id);
            if (x) c[x.situacao]++;
        }
    }
    c.total = Object.values(c).reduce((a, b) => a + b, 0);
    return c;
}

// --- Capítulos ---------------------------------------------------------------
function barraSituacoes(c) {
    return html`<div class="farol-barra">${farol.situacoes.map((s) => (c[s.id]
        ? html`<span data-situacao="${s.id}" style="width: ${(c[s.id] / c.total * 100).toFixed(2)}%"></span>` : ''))}</div>`;
}

function desenharManchete(geral, areas) {
    const lider = areas.slice().sort((a, b) => b.c.producao - a.c.producao)[0];
    const pend = geral.pendente_faq + geral.pendente_comparativo;
    $('#manchete-texto').textContent = geral.producao
        ? `${plural(geral.producao, 'cotação de seguradora e profissão já está atualizada', 'cotações de seguradora e profissão já estão atualizadas')} no nosso sistema.`
        : 'Nenhuma cotação atualizada no nosso sistema ainda.';
    $('#manchete-contexto').textContent = [
        lider?.c.producao ? `${lider.nome} concentra ${lider.c.producao}.` : '',
        `Outras ${geral.nao_cotado} ainda não foram cotadas, ${plural(pend, 'está pendente', 'estão pendentes')} e em ${geral.nao_trabalha} a seguradora não trabalha com a profissão.`,
    ].join(' ');
}

function desenharAreas(areas) {
    montar('#farol-areas', areas.map((a) => {
        const c = a.c;
        const quota = c.total ? c.producao / c.total : 0;
        const frase = !c.total ? 'Sem situação marcada ainda.'
            : !c.producao ? 'Nenhuma atualizada no sistema ainda.'
                : quota >= 0.4 ? `${Math.round(quota * 100)}% do que está mapeado já está atualizado no sistema.`
                    : `A atualização começou: ${c.producao} em produção, ${c.nao_cotado} ainda sem cotação.`;
        return html`<article class="farol-cartao" aria-label="${a.nome}">
            <div class="farol-cartao-topo"><h3>${a.nome}</h3><span>${a.preenchidas} de ${a.colunas} colunas preenchidas</span></div>
            <p class="farol-frase">${frase}</p>
            <div role="img" aria-label="${farol.situacoes.map((s) => `${c[s.id]} ${s.nome.toLowerCase()}`).join(', ')}">${barraSituacoes(c)}</div>
            <p class="farol-detalhe">${c.producao} em produção · ${plural(c.nao_cotado, 'não cotada', 'não cotadas')} · ${plural(c.pendente_faq + c.pendente_comparativo, 'pendente', 'pendentes')} · ${c.nao_trabalha} não trabalha</p>
        </article>`;
    }));
}

function desenharRitmo() {
    const porMes = {};
    for (const s of farol.seguradoras) {
        for (const col of farol.colunas) {
            const x = celula(s, col.id);
            if (x?.situacao === 'producao' && x.data) porMes[x.data.slice(0, 7)] = (porMes[x.data.slice(0, 7)] || 0) + 1;
        }
    }
    const chaves = Object.keys(porMes).sort();
    if (!chaves.length) {
        $('#frase-ritmo').textContent = 'Ainda sem datas de atualização.';
        montar('#farol-ritmo', '');
        return;
    }
    const meses = [];
    let [ano, mes] = chaves[0].split('-').map(Number);
    const [fimAno, fimMes] = chaves[chaves.length - 1].split('-').map(Number);
    while (ano < fimAno || (ano === fimAno && mes <= fimMes)) {
        const k = `${ano}-${String(mes).padStart(2, '0')}`;
        meses.push({ k, ano, mes, n: porMes[k] || 0 });
        if (++mes > 12) { mes = 1; ano++; }
    }
    const max = Math.max(...meses.map((m) => m.n), 1);
    const topo = meses.reduce((a, b) => (b.n > a.n ? b : a));
    const total = meses.reduce((n, m) => n + m.n, 0);
    const mesTopo = MESES_LONGOS[topo.mes - 1];
    $('#frase-ritmo').textContent = `Desde ${MESES_LONGOS[meses[0].mes - 1]} de ${meses[0].ano}, ${plural(total, 'cotação foi atualizada', 'cotações foram atualizadas')} no sistema. ${mesTopo[0].toUpperCase()}${mesTopo.slice(1)} de ${topo.ano} foi o mês mais forte, com ${topo.n}.`;
    const ritmo = $('#farol-ritmo');
    ritmo.style.setProperty('--meses', meses.length);
    ritmo.setAttribute('aria-label', meses.map((m) => `${MESES[m.mes - 1]}/${String(m.ano).slice(2)}: ${m.n}`).join(', '));
    montar(ritmo, meses.map((m) => html`<div class="farol-mes"${m.k === topo.k ? html` data-topo` : ''}>
        <span class="n">${m.n || ''}</span>
        <span class="barra" style="--h: ${Math.round((m.n / max) * 100)}%"></span>
        <span class="rot">${MESES[m.mes - 1]}/${String(m.ano).slice(2)}</span>
    </div>`));
}

function desenharRankings() {
    const porSeg = farol.seguradoras.map((s) => ({ nome: s, c: contar(() => true, [s]) }));

    const lideres = porSeg.filter((x) => x.c.producao).sort((a, b) => b.c.producao - a.c.producao);
    const semNada = porSeg.filter((x) => !x.c.producao).map((x) => x.nome);
    $('#frase-lider').textContent = lideres.length
        ? `${lideres[0].nome} lidera com ${plural(lideres[0].c.producao, 'cotação atualizada', 'cotações atualizadas')}${semNada.length ? `; ${semNada.join(', ')} ainda não ${semNada.length === 1 ? 'tem' : 'têm'} nenhuma.` : '.'}`
        : 'Nenhuma seguradora com cotação atualizada ainda.';
    const maxP = lideres[0]?.c.producao || 1;
    montar('#farol-lider', lideres.map((x) => html`<li><span class="nome">${x.nome}</span>
        <span class="trilho"><span data-situacao="producao" style="width: ${(x.c.producao / maxP * 100).toFixed(1)}%; background: var(--farol-producao)"></span></span>
        <span class="n">${x.c.producao}</span></li>`));

    const fila = porSeg.map((x) => ({ nome: x.nome, c: x.c, t: x.c.nao_cotado + x.c.pendente_faq + x.c.pendente_comparativo }))
        .filter((x) => x.t).sort((a, b) => b.t - a.t);
    const totalFila = fila.reduce((n, x) => n + x.t, 0);
    $('#frase-falta').textContent = fila.length
        ? `${plural(totalFila, 'cotação ainda falta', 'cotações ainda faltam')} atualizar. ${fila[0].nome} tem a maior fila, com ${fila[0].t}.`
        : 'Nada pendente: tudo o que foi mapeado já está atualizado.';
    const maxT = fila[0]?.t || 1;
    const fatia = (n, sit) => (n ? html`<span data-situacao="${sit}" style="width: ${(n / maxT * 100).toFixed(1)}%; background: var(--cor-farol)"></span>` : '');
    montar('#farol-falta', fila.map((x) => html`<li><span class="nome">${x.nome}</span>
        <span class="trilho" role="img" aria-label="${x.c.nao_cotado} não cotadas, ${x.c.pendente_faq} pendente FAQ, ${x.c.pendente_comparativo} pendente comparativo">${fatia(x.c.nao_cotado, 'nao_cotado')}${fatia(x.c.pendente_faq, 'pendente_faq')}${fatia(x.c.pendente_comparativo, 'pendente_comparativo')}</span>
        <span class="n">${x.t}</span></li>`));
}

// --- Mapa ----------------------------------------------------------------------
function desenharLegenda(geral) {
    const legenda = $('#farol-legenda');
    if (filtro) legenda.dataset.filtro = filtro; else delete legenda.dataset.filtro;
    montar(legenda, farol.situacoes.map((s) => html`<button type="button" class="farol-chip" data-filtro="${s.id}" aria-pressed="${String(filtro === s.id)}">
        <span class="farol-amostra" data-situacao="${s.id}" aria-hidden="true"></span>
        <span><span class="rotulo">${s.nome}</span><span class="valor">${geral[s.id]}</span><span class="pct">${pct(geral[s.id], geral.total)}</span></span>
    </button>`));
}

function desenharMapa() {
    const mapa = $('#farol-mapa');
    mapa.style.setProperty('--colunas', farol.colunas.length);
    if (filtro) mapa.dataset.filtro = filtro; else delete mapa.dataset.filtro;
    if (editando) mapa.dataset.editando = ''; else delete mapa.dataset.editando;

    // Faixa das áreas: colunas seguidas da mesma área.
    const faixas = [];
    farol.colunas.forEach((c) => {
        const ult = faixas[faixas.length - 1];
        if (ult && ult.area === c.area) ult.n++; else faixas.push({ area: c.area, n: 1 });
    });
    const nomeArea = (id) => farol.areas.find((a) => a.id === id)?.nome || id;

    // Cabeçalho: profissão com PJ/PF vira um grupo de duas colunas.
    const cab = [];
    for (let i = 0; i < farol.colunas.length; i++) {
        const c = farol.colunas[i];
        const prox = farol.colunas[i + 1];
        if (c.tipo && prox?.tipo && prox.profissao === c.profissao) {
            cab.push(html`<div class="prof grupo" style="grid-column: span 2"><span>${c.profissao}</span></div>`);
            cab.push(html`<div class="tipo">${c.tipo}</div>`, html`<div class="tipo">${prox.tipo}</div>`);
            i++;
        } else {
            cab.push(html`<div class="prof solo"><span>${nomeColuna(c)}</span></div>`);
        }
    }

    const linhas = farol.seguradoras.map((s) => {
        const prod = farol.colunas.filter((c) => celula(s, c.id)?.situacao === 'producao').length;
        const celulas = farol.colunas.map((c) => {
            const x = celula(s, c.id);
            const rotulo = `${s} · ${nomeColuna(c)}: ${x ? nomeSituacao(x.situacao) : 'em branco'}${x?.data ? ` desde ${dataBR(x.data)}` : ''}`;
            const texto = x?.situacao === 'producao' ? dataCurta(x.data) : '';
            const sit = x ? html` data-situacao="${x.situacao}"` : '';
            if (!PODE_EDITAR) return html`<span class="farol-cel" role="img"${sit} title="${rotulo}" aria-label="${rotulo}">${texto}</span>`;
            const sel = selecionada?.seguradora === s && selecionada?.coluna === c.id;
            const mudou = !iguais(x, celulaSalva(s, c.id));
            return html`<button type="button" class="farol-cel"${sit} data-seg="${s}" data-col="${c.id}" aria-pressed="${String(sel)}"${mudou ? html` data-mudou` : ''} title="${rotulo}" aria-label="${rotulo}">${texto}</button>`;
        });
        return html`<div class="farol-grade farol-linha">
            <div class="farol-fixa"><span>${s}</span><span class="conta" title="Cotações atualizadas no sistema">${prod}</span></div>
            ${celulas}
        </div>`;
    });

    montar(mapa, html`
        <div class="farol-grade farol-areas-faixa"><div class="farol-fixa"></div>${faixas.map((f) => html`<div class="area" style="grid-column: span ${f.n}" title="${nomeArea(f.area)}">${nomeArea(f.area)}</div>`)}</div>
        <div class="farol-grade farol-cabecalho"><div class="canto farol-fixa">Seguradora</div>${cab}</div>
        ${linhas}`);
    mapa.removeAttribute('aria-busy');
}

// --- Edição (só na Central, operador/admin) -------------------------------------
function pendentes() {
    return [...rascunho.entries()].filter(([k, v]) => {
        const [s, c] = k.split('|');
        return !iguais(v, celulaSalva(s, c));
    });
}

function desenharEdicao() {
    const barra = $('#farol-edicao');
    const botao = $('#farol-editar');
    if (!barra || !botao) return;
    botao.setAttribute('aria-pressed', String(editando));
    botao.classList.toggle('btn-primaria', editando);
    botao.classList.toggle('btn-contorno', !editando);
    botao.querySelector('span').textContent = editando ? 'Concluir edição' : 'Editar tabela';
    barra.hidden = !editando;
    if (!editando) return;
    const n = pendentes().length;
    const atual = selecionada ? celula(selecionada.seguradora, selecionada.coluna) : null;
    const coluna = selecionada ? farol.colunas.find((c) => c.id === selecionada.coluna) : null;
    montar(barra, html`
        ${selecionada ? html`
            <div class="sel"><small>Célula selecionada</small><strong>${selecionada.seguradora} · ${nomeColuna(coluna)}</strong></div>
            <div class="farol-opcoes" role="group" aria-label="Situação da célula">
                ${farol.situacoes.map((s) => html`<button type="button" class="btn btn-contorno" data-definir="${s.id}" aria-pressed="${String(atual?.situacao === s.id)}"><span class="farol-amostra" data-situacao="${s.id}" aria-hidden="true"></span>${s.nome}</button>`)}
                <button type="button" class="btn btn-contorno" data-definir="" aria-pressed="${String(!atual)}"><span class="farol-amostra" aria-hidden="true"></span>Em branco</button>
            </div>
            ${atual?.situacao === 'producao' ? html`<label>Em produção desde<input type="date" id="farol-data" value="${atual.data || ''}"></label>` : ''}
        ` : html`<span>Clique numa célula da tabela para mudar a situação.</span>`}
        <div class="fim">
            <span>${n ? plural(n, 'alteração pendente', 'alterações pendentes') : 'Nenhuma alteração pendente'}</span>
            <button type="button" class="btn btn-contorno" id="farol-desfazer"${n ? '' : html` disabled`}>Desfazer</button>
            <button type="button" class="btn btn-primaria" id="farol-salvar"${n ? '' : html` disabled`}><i class="bi bi-check2" aria-hidden="true"></i>Salvar alterações</button>
        </div>`);
}

function definir(situacao, data) {
    const { seguradora, coluna } = selecionada;
    const atual = celula(seguradora, coluna);
    let novo = null;
    if (situacao) {
        novo = { situacao };
        if (situacao === 'producao') novo.data = data ?? (atual?.situacao === 'producao' ? atual.data : null) ?? hojeIso();
        if (!novo.data) delete novo.data;
    }
    rascunho.set(chave(seguradora, coluna), novo);
    desenhar();
}

async function salvar() {
    const lista = pendentes().map(([k, v]) => {
        const [seguradora, coluna] = k.split('|');
        return { seguradora, coluna, situacao: v?.situacao || null, data: v?.data || null };
    });
    if (!lista.length) return;
    const botao = $('#farol-salvar');
    if (botao) botao.disabled = true;
    try {
        const r = await fetch('/api/farol-cotacoes', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({ alteracoes: lista }),
        });
        const corpo = await r.json().catch(() => ({}));
        if (r.status === 401) throw new Error('Sua sessão expirou. Entre de novo na Central para salvar.');
        if (r.status === 403) throw new Error('Só operador ou administrador pode editar o farol.');
        if (!r.ok) throw new Error(corpo.detail || `A Central respondeu com erro (HTTP ${r.status}).`);
        farol = corpo.farol;
        rascunho.clear();
        toast(corpo.alteradas === 1 ? '1 célula salva.' : `${corpo.alteradas} células salvas.`);
        desenhar();
    } catch (erro) {
        toast(erro.message || 'Não deu para salvar.', { estado: 'falha', duracao: 0 });
        if (botao) botao.disabled = false;
    }
}

if (PODE_EDITAR) {
    $('#farol-editar')?.addEventListener('click', () => {
        editando = !editando;
        if (!editando) selecionada = null;
        desenhar();
    });
    aoClicar('#farol-mapa', 'button.farol-cel', (ev, el) => {
        editando = true;
        selecionada = { seguradora: el.dataset.seg, coluna: el.dataset.col };
        desenhar();
    });
    aoClicar('#farol-edicao', '[data-definir]', (ev, el) => definir(el.dataset.definir || null));
    aoClicar('#farol-edicao', '#farol-desfazer', () => { rascunho.clear(); desenhar(); });
    aoClicar('#farol-edicao', '#farol-salvar', salvar);
    $('#farol-edicao')?.addEventListener('change', (ev) => {
        if (ev.target.id === 'farol-data' && selecionada) definir('producao', ev.target.value || null);
    });
    window.addEventListener('beforeunload', (ev) => {
        if (pendentes().length) { ev.preventDefault(); ev.returnValue = ''; }
    });
}

aoClicar('#farol-legenda', '[data-filtro]', (ev, el) => {
    filtro = filtro === el.dataset.filtro ? null : el.dataset.filtro;
    desenhar();
});

// --- Montagem ----------------------------------------------------------------------
function desenhar() {
    const geral = contar();
    const areas = farol.areas.map((a) => {
        const daArea = (c) => c.area === a.id;
        const cols = farol.colunas.filter(daArea);
        return {
            nome: a.nome,
            colunas: cols.length,
            preenchidas: cols.filter((c) => farol.seguradoras.some((s) => celula(s, c.id))).length,
            c: contar(daArea),
        };
    });
    desenharManchete(geral, areas);
    desenharAreas(areas);
    desenharRitmo();
    desenharRankings();
    const preenchidas = farol.colunas.filter((c) => farol.seguradoras.some((s) => celula(s, c.id))).length;
    $('#farol-resumo-mapa').textContent = `${farol.seguradoras.length} seguradoras × ${farol.colunas.length} colunas de profissão (${preenchidas} preenchidas).${PODE_EDITAR ? ' Clique numa célula para editar.' : ''}`;
    desenharLegenda(geral);
    desenharMapa();
    desenharEdicao();
}

async function carregar() {
    // Com edição aberta ou alteração por salvar, a atualização automática
    // espera: senão apagaria o que a pessoa está fazendo.
    if (farol && (editando || rascunho.size)) return;
    try {
        farol = await obterDados();
    } catch (erro) {
        if (!farol) montar('#farol-mapa', erroEmBloco(erro, carregar));
        return;
    }
    desenhar();
}

aCada(60_000, carregar, { rotulo: '#ultima-atualizacao' });

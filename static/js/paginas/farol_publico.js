// Farol de cotações (sem login, 15-10-2026): em que pé está a atualização
// das cotações no nosso sistema, por seguradora x profissão (aba Planilha2
// da planilha do farol). Não fala de robô. Só a tabela de profissões com a
// legenda de cores (pedido do responsável: sem manchete nem capítulos).
// Edição: só na Central, para operador/admin (`data-pode-editar`); grava
// tudo de uma vez em PUT /api/farol-cotacoes.

import { html, montar, $, aoClicar, erroEmBloco, toast } from '../core/ui.js';
import { aCada } from '../core/atualizacao.js';

const RAIZ = document.querySelector('[data-fonte]');
const FONTE = RAIZ.dataset.fonte;
const FONTE_AO_VIVO = RAIZ.dataset.fonteAoVivo;
const PODE_EDITAR = RAIZ.hasAttribute('data-pode-editar');

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

function contar() {
    const c = Object.fromEntries(farol.situacoes.map((s) => [s.id, 0]));
    for (const s of farol.seguradoras) {
        for (const col of farol.colunas) {
            const x = celula(s, col.id);
            if (x) c[x.situacao]++;
        }
    }
    return c;
}

// --- Legenda e tabela --------------------------------------------------------
function desenharLegenda(cont) {
    const legenda = $('#farol-legenda');
    if (filtro) legenda.dataset.filtro = filtro; else delete legenda.dataset.filtro;
    montar(legenda, farol.situacoes.map((s) => html`<button type="button" class="farol-chip" data-filtro="${s.id}" aria-pressed="${String(filtro === s.id)}">
        <span class="farol-amostra" data-situacao="${s.id}" aria-hidden="true"></span>
        <span><span class="rotulo">${s.nome}</span><span class="valor">${cont[s.id]}</span></span>
    </button>`));
}

function desenharMapa() {
    const mapa = $('#farol-mapa');
    mapa.style.setProperty('--colunas', farol.colunas.length);
    if (filtro) mapa.dataset.filtro = filtro; else delete mapa.dataset.filtro;
    if (editando) mapa.dataset.editando = ''; else delete mapa.dataset.editando;

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
            <div class="farol-fixa"><span>${s}</span></div>
            ${celulas}
        </div>`;
    });

    montar(mapa, html`
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
    desenharLegenda(contar());
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

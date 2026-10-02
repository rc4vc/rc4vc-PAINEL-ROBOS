// Painel ao vivo (sem login; o quadro Em construção fica em quadro_publico.js): a história dos robôs num recorte escolhido
// pelos filtros (período, seguradora, tipo, situação). Os dados chegam uma
// vez por minuto de GET /api/dashboard/painel-publico; filtrar e escrever as
// frases acontece aqui, na hora, sem ir ao servidor. Só APIs públicas.

import { html, montar, $, vazio, erroEmBloco } from '../core/ui.js';
import { relativo, percentual, numero, plural, dataCurta, hora } from '../core/format.js';
import { aCada } from '../core/atualizacao.js';
import { lerFiltros, gravarFiltros, ligarSegmentado } from '../core/filtros.js';

const SISTEMAS = '__sistemas';
const PADROES = { periodo: 'hoje', seguradora: '', tipo: '', situacao: '' };
const TIPO_TEXTO = { cotacao: 'de cotação', renovacao: 'de renovação', outros: 'de operação' };
const SITUACAO_TEXTO = { problema: 'com problema', rodando: 'rodando agora', ok: 'que deram certo na última vez' };
// Abaixo disto o robô entra em "Quem precisa de atenção" (com ao menos 3 execuções no período).
const TAXA_MINIMA = 0.8;

const filtros = lerFiltros(PADROES);
let dados = null;
let grafico = null;
// Robôs com o cartão virado (mostrando o que fazem). Fica guardado aqui
// para a atualização de cada minuto não desvirar o cartão de ninguém.
const virados = new Set();

// API na Central; arquivo JSON no site estático (GitHub Pages). O `t=`
// fura o cache do Pages (~10 min) para pegar a última publicação.
const FONTE = document.querySelector('[data-fonte]').dataset.fonte;

async function obter(url) {
    const r = await fetch(`${url}${url.includes('?') ? '&' : '?'}t=${Date.now()}`, { headers: { Accept: 'application/json' } });
    if (!r.ok) throw new Error(`A Central respondeu com erro (HTTP ${r.status}).`);
    return r.json();
}

// --- Dados do recorte -----------------------------------------------------------
const chaveSeguradora = (s) => s.trim().toUpperCase();
const nomeSeguradora = (s) => s.toLowerCase().replace(/(^|\s)\S/g, (l) => l.toUpperCase());

function seguradorasDisponiveis() {
    const mapa = new Map();
    dados.robos.filter((r) => !r.sistema_nosso).forEach((r) => r.seguradoras.forEach((s) => mapa.set(chaveSeguradora(s), nomeSeguradora(s))));
    return [...mapa.entries()].sort((a, b) => a[1].localeCompare(b[1], 'pt-BR'));
}

function rotuloSeguradora(valor) {
    if (valor === SISTEMAS) return 'Sistemas nossos';
    return seguradorasDisponiveis().find(([k]) => k === valor)?.[1] || valor;
}

function situacao(r) {
    if (r.travado) return 'problema';
    if (r.rodando) return 'rodando';
    if (r.ultimo_status === 'erro') return 'problema';
    if (r.ultimo_status === 'sucesso') return 'ok';
    return '';
}

function robosDoRecorte() {
    return dados.robos.filter((r) => {
        if (filtros.tipo && r.tipo_robo !== filtros.tipo) return false;
        if (filtros.seguradora === SISTEMAS && !r.sistema_nosso) return false;
        if (filtros.seguradora && filtros.seguradora !== SISTEMAS
            && (r.sistema_nosso || !r.seguradoras.some((s) => chaveSeguradora(s) === filtros.seguradora))) return false;
        if (filtros.situacao && situacao(r) !== filtros.situacao) return false;
        return true;
    });
}

const somar = (pares) => pares.reduce((t, [s, e]) => [t[0] + s, t[1] + e], [0, 0]);

/** [sucesso, erro] do robô no período atual e no anterior (mesmo tamanho). */
function contagens(r) {
    if (filtros.periodo === 'hoje') {
        const h = new Date().getHours();
        return { atual: somar(r.horas_hoje), anterior: somar(r.horas_ontem.slice(0, h + 1)) };
    }
    const n = Number(filtros.periodo);
    return { atual: somar(r.dias.slice(-n)), anterior: somar(r.dias.slice(-2 * n, -n)) };
}

const taxaDe = ([s, e]) => (s + e ? s / (s + e) : null);

function precisaAtencao(r) {
    const { atual } = contagens(r);
    const taxa = taxaDe(atual);
    const motivos = [];
    if (r.travado) motivos.push(`parece travado: rodando desde ${relativo(r.ultima_execucao_em)}`);
    if (r.ultimo_status === 'erro' && !r.rodando) motivos.push('falhou na última execução');
    if (taxa !== null && atual[0] + atual[1] >= 3 && taxa < TAXA_MINIMA) motivos.push(`só ${percentual(taxa)} deram certo no período`);
    return motivos;
}

// --- Frases ---------------------------------------------------------------------------
function textoPeriodo() {
    return { hoje: 'Hoje, até agora', 7: 'Nos últimos 7 dias', 30: 'Nos últimos 30 dias' }[filtros.periodo];
}

function textoAnterior() {
    return { hoje: 'ontem até esta hora', 7: 'nos 7 dias anteriores', 30: 'nos 30 dias anteriores' }[filtros.periodo];
}

function textoEscopo(lista) {
    if (lista.length === 1) return `o robô ${lista[0].nome}`;
    const partes = [`os ${lista.length} robôs`];
    if (filtros.tipo) partes.push(TIPO_TEXTO[filtros.tipo]);
    if (filtros.seguradora === SISTEMAS) partes.push('de sistemas nossos');
    else if (filtros.seguradora) partes.push(`da ${rotuloSeguradora(filtros.seguradora)}`);
    if (filtros.situacao) partes.push(SITUACAO_TEXTO[filtros.situacao]);
    return partes.join(' ');
}

/** Complemento de "acima/abaixo" nas notas dos números. */
function textoVs() {
    return { hoje: 'de ontem até esta hora', 7: 'dos 7 dias anteriores', 30: 'dos 30 dias anteriores' }[filtros.periodo];
}

function variacao(atual, anterior) {
    if (!anterior) return null;
    return (atual - anterior) / anterior;
}

// --- Desenho --------------------------------------------------------------------------
function kpi(id, valor, nota, estado) {
    const el = document.getElementById(id);
    montar(el.querySelector('[data-valor]'), valor);
    montar(el.querySelector('[data-nota]'), nota || '');
    if (estado) el.dataset.estado = estado; else delete el.dataset.estado;
}

function tendencia(delta, { pontos = false, bomQuandoSobe = true } = {}) {
    if (delta === null || delta === undefined || Number.isNaN(delta)) return html`<span class="fraco">sem base para comparar</span>`;
    const valor = Math.round(delta * 100);
    if (valor === 0) return html`<span class="tendencia" data-direcao="igual"><i class="bi bi-dash"></i>igual ao período anterior</span>`;
    const sobe = valor > 0;
    // bomQuandoSobe = null: só informa (mais ou menos execuções não é bom nem ruim).
    const bom = bomQuandoSobe === null ? 'neutro' : String(sobe === bomQuandoSobe);
    return html`<span class="tendencia" data-direcao="${sobe ? 'sobe' : 'desce'}" data-bom="${bom}"><i class="bi bi-arrow-${sobe ? 'up' : 'down'}-right"></i>${pontos ? plural(Math.abs(valor), 'ponto', 'pontos') : `${Math.abs(valor)}%`} ${sobe ? 'acima' : 'abaixo'} ${textoVs()}</span>`;
}

function desenharManchete(lista, totais, atencao) {
    const [ok, falhas] = totais.atual;
    const execs = ok + falhas;
    if (!lista.length) {
        montar('#manchete-texto', html`Nenhum robô neste recorte.`);
        montar('#manchete-contexto', html`Troque os filtros ou clique em <strong>Limpar filtros</strong>.`);
        montar('#manchete-rodape', '');
        return;
    }
    const taxa = taxaDe(totais.atual);
    const estadoTaxa = taxa === null ? '' : (taxa >= 0.9 ? 'ok' : (taxa >= 0.7 ? 'atencao' : 'falha'));
    const abertura = execs
        ? html`${textoPeriodo()}, ${textoEscopo(lista)} ${lista.length === 1 ? 'rodou' : 'rodaram'} <em>${plural(execs, 'vez', 'vezes')}</em> e <span class="destaque-${estadoTaxa}">${percentual(taxa)} deu certo</span>.`
        : html`${textoPeriodo()}, ${lista.length === 1 ? `o robô ${lista[0].nome} ainda não rodou` : `nenhum d${textoEscopo(lista)} rodou`}.`;
    montar('#manchete-texto', html`${abertura} ${atencao.length
        ? html`<span class="destaque-falha">${plural(atencao.length, 'pede', 'pedem')} atenção</span>: <em>${atencao[0].robo.nome}</em>${atencao.length > 1 ? ` e mais ${atencao.length - 1}` : ''}.`
        : html`<span class="destaque-ok">${lista.length === 1 ? 'Não pede' : 'Nenhum pede'} atenção.</span>`}`);

    const [okAnt, falhasAnt] = totais.anterior;
    const execsAnt = okAnt + falhasAnt;
    let contexto;
    if (!execsAnt) {
        contexto = `Não houve execução ${textoAnterior()} para comparar.`;
    } else if (!execs) {
        contexto = `${textoAnterior().charAt(0).toUpperCase()}${textoAnterior().slice(1)} foram ${plural(execsAnt, 'execução', 'execuções')}.`;
    } else {
        const v = variacao(execs, execsAnt);
        const ritmo = Math.round(v * 100) === 0 ? `o mesmo ritmo de ${textoAnterior()}`
            : `${Math.abs(Math.round(v * 100))}% ${v > 0 ? 'a mais' : 'a menos'} que ${textoAnterior()} (${numero(execsAnt)})`;
        const taxaAnt = taxaDe(totais.anterior);
        let qualidade = '';
        if (taxa !== null && taxaAnt !== null) {
            const pts = Math.round((taxa - taxaAnt) * 100);
            qualidade = pts === 0 ? ', com a mesma taxa de acerto' : `, e a taxa de acerto ${pts > 0 ? 'subiu' : 'caiu'} ${plural(Math.abs(pts), 'ponto', 'pontos')}`;
        }
        contexto = `São ${ritmo}${qualidade}.`;
    }
    $('#manchete-contexto').textContent = contexto;
    const rodando = lista.filter((r) => r.rodando);
    montar('#manchete-rodape', html`
        <span><span class="ponto" data-estado="${rodando.length ? 'rodando' : 'neutro'}"></span> ${rodando.length ? `${plural(rodando.length, 'robô rodando', 'robôs rodando')} agora: ${rodando.map((r) => r.nome).join(', ')}` : 'Nenhum robô rodando neste momento'}</span>`);
}

function desenharNumeros(lista, totais, atencao) {
    const [ok, falhas] = totais.atual;
    const execs = ok + falhas;
    const execsAnt = totais.anterior[0] + totais.anterior[1];
    kpi('kpi-execucoes', html`${numero(execs)}`, tendencia(variacao(execs, execsAnt), { bomQuandoSobe: null }));
    const taxa = taxaDe(totais.atual);
    const taxaAnt = taxaDe(totais.anterior);
    kpi('kpi-taxa', html`${percentual(taxa)}`,
        taxa === null ? 'nenhuma execução no período' : tendencia(taxaAnt === null ? null : taxa - taxaAnt, { pontos: true }),
        taxa === null ? null : (taxa >= 0.9 ? 'ok' : (taxa >= 0.7 ? 'atencao' : 'falha')));
    kpi('kpi-atencao', html`${atencao.length}<small>/${lista.length}</small>`,
        atencao.length ? `${plural(falhas, 'falha', 'falhas')} no período` : 'todos em dia', atencao.length ? 'falha' : 'ok');
    const rodando = lista.filter((r) => r.rodando).length;
    kpi('kpi-rodando', html`${rodando}`, rodando ? 'neste momento' : 'nenhum neste momento');
}

function serieDoRitmo(lista) {
    if (filtros.periodo === 'hoje') {
        const h = new Date().getHours();
        const rotulos = Array.from({ length: h + 1 }, (_, i) => `${String(i).padStart(2, '0')}h`);
        const valores = rotulos.map((_, i) => somar(lista.map((r) => r.horas_hoje[i])));
        return { rotulos, valores, unidade: 'hora' };
    }
    const n = Number(filtros.periodo);
    const inicio = new Date(`${dados.primeiro_dia}T12:00:00`);
    const total = dados.robos[0]?.dias.length || 0;
    const rotulos = [];
    const valores = [];
    for (let i = total - n; i < total; i += 1) {
        const d = new Date(inicio);
        d.setDate(d.getDate() + i);
        rotulos.push(dataCurta(d));
        valores.push(somar(lista.map((r) => r.dias[i])));
    }
    return { rotulos, valores, unidade: 'dia' };
}

function desenharRitmo(lista) {
    const { rotulos, valores, unidade } = serieDoRitmo(lista);
    const totais = valores.map(([s, e]) => s + e);
    const maior = Math.max(0, ...totais);
    const maisFalhas = Math.max(0, ...valores.map(([, e]) => e));
    if (!maior) {
        $('#frase-ritmo').textContent = 'Nenhuma execução neste recorte e período.';
    } else {
        const iPico = totais.indexOf(maior);
        const iFalha = valores.findIndex(([, e]) => e === maisFalhas);
        const porHora = unidade === 'hora';
        const pico = porHora ? html`O horário de pico foi <strong>${rotulos[iPico]}</strong>` : html`O dia mais movimentado foi <strong>${rotulos[iPico]}</strong>`;
        let falhas;
        if (!maisFalhas) falhas = html`<strong class="texto-ok">Nenhuma falha</strong> no período.`;
        else if (iFalha === iPico) falhas = html`Foi também ${porHora ? 'o horário' : 'o dia'} com mais falhas (<strong class="texto-falha">${maisFalhas}</strong>).`;
        else falhas = html`${porHora ? 'O horário' : 'O dia'} com mais falhas foi <strong class="texto-falha">${rotulos[iFalha]}</strong> (${maisFalhas}).`;
        montar('#frase-ritmo', html`${pico}, com ${plural(maior, 'execução', 'execuções')}. ${falhas}`);
    }

    if (!window.Chart) return;
    const css = getComputedStyle(document.documentElement);
    const cor = (v) => css.getPropertyValue(v).trim();
    const dadosGrafico = {
        labels: rotulos,
        datasets: [
            { label: 'Deu certo', data: valores.map(([s]) => s), backgroundColor: cor('--ok'), borderRadius: 4, stack: 's' },
            { label: 'Falhou', data: valores.map(([, e]) => e), backgroundColor: cor('--falha'), borderRadius: 4, stack: 's' },
        ],
    };
    window.Chart.defaults.color = cor('--texto-3');
    window.Chart.defaults.font.family = cor('--fonte-texto');
    if (grafico) { grafico.data = dadosGrafico; grafico.update('none'); return; }
    grafico = new window.Chart($('#grafico-ritmo'), {
        type: 'bar',
        data: dadosGrafico,
        options: {
            maintainAspectRatio: false,
            animation: { duration: 300 },
            plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, boxHeight: 10 } }, tooltip: { mode: 'index', intersect: false } },
            scales: {
                x: { stacked: true, grid: { display: false }, ticks: { maxRotation: 0, autoSkipPadding: 12 } },
                y: { stacked: true, beginAtZero: true, grid: { color: cor('--borda') }, ticks: { precision: 0 } },
            },
        },
    });
}

function desenharAtencao(atencao) {
    if (!atencao.length) {
        $('#frase-atencao').textContent = '';
        montar('#lista-atencao', vazio('emoji-smile', 'Nenhum robô pede atenção neste recorte.', 'Todos acertaram a última execução e ficaram acima de 80% no período.'));
        return;
    }
    const falharam = atencao.filter((a) => a.robo.ultimo_status === 'erro' && !a.robo.travado).length;
    montar('#frase-atencao', html`${plural(atencao.length, 'robô merece', 'robôs merecem')} um olhar${falharam
        ? html`; <strong class="texto-falha">${falharam} ${falharam === 1 ? 'falhou' : 'falharam'} na última tentativa</strong>` : ''}. Quem entrou na Central vê o motivo e o que fazer em Ocorrências.`);
    montar('#lista-atencao', html`<div class="cartao"><div class="lista-itens">${atencao.map(({ robo, motivos, taxa }) => html`
        <div class="item">
            <span class="item-icone" data-estado="${robo.ultimo_status === 'erro' || robo.travado ? 'falha' : 'atencao'}"><i class="bi bi-${robo.travado ? 'hourglass-split' : (robo.ultimo_status === 'erro' ? 'x-octagon' : 'graph-down-arrow')}"></i></span>
            <span style="min-width:0"><span class="item-titulo">${robo.nome}</span><br>
                <span class="item-texto">${motivos.join(' · ')}</span></span>
            <span class="item-meta">${robo.ultima_execucao_em ? `última ${relativo(robo.ultima_execucao_em)}` : ''}${taxa !== null ? html`<br>${percentual(taxa)} no período` : ''}</span>
        </div>`)}</div></div>`);
}

function grupos(lista) {
    const mapa = new Map();
    const internos = [];
    lista.forEach((r) => {
        if (r.sistema_nosso) { internos.push(r); return; }
        (r.seguradoras.length ? r.seguradoras : ['Sem seguradora']).forEach((s) => {
            const chave = chaveSeguradora(s);
            if (filtros.seguradora && filtros.seguradora !== SISTEMAS && chave !== filtros.seguradora) return;
            if (!mapa.has(chave)) mapa.set(chave, { nome: nomeSeguradora(s), robos: [] });
            mapa.get(chave).robos.push(r);
        });
    });
    const saida = [...mapa.values()].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    if (internos.length) saida.push({ nome: 'Sistemas nossos', robos: internos });
    return saida;
}

function desenharRobos(lista) {
    if (!lista.length) {
        montar('#lista-robos', vazio('funnel', 'Nenhum robô neste recorte.', 'Troque os filtros acima.'));
        return;
    }
    const estado = (r) => (r.travado ? 'falha' : r.rodando ? 'rodando' : ({ sucesso: 'ok', erro: 'falha' }[r.ultimo_status] || 'neutro'));
    montar('#lista-robos', grupos(lista).map((g) => {
        const t = somar(g.robos.map((r) => contagens(r).atual));
        const taxa = taxaDe(t);
        return html`<div class="cartao">
            <div class="cartao-cabecalho"><h3>${g.nome}</h3><span class="fraco minimo">${taxa === null ? 'sem execução no período' : `${percentual(taxa)} certo · ${plural(t[0] + t[1], 'execução', 'execuções')}`}</span></div>
            <div class="lista-itens">${g.robos.map((r) => {
                const c = contagens(r).atual;
                const tx = taxaDe(c);
                const est = tx === null ? 'neutro' : (tx >= 0.9 ? 'ok' : (tx >= 0.7 ? 'atencao' : 'falha'));
                const frente = html`<div class="painel-robo-frente">
                    <span class="ponto" data-estado="${estado(r)}" aria-label="${{ ok: 'última deu certo', falha: 'última falhou', rodando: 'rodando agora', neutro: 'sem execução' }[estado(r)]}"></span>
                    <span style="min-width:0">
                        <span class="item-titulo">${r.nome}${r.resumo ? html` <i class="bi bi-info-circle painel-robo-dica" aria-hidden="true"></i>` : ''}</span><br>
                        <span class="item-texto">${r.travado ? `parece travado (desde ${relativo(r.ultima_execucao_em)})` : r.rodando ? 'rodando agora' : (r.ultima_execucao_em ? `rodou ${relativo(r.ultima_execucao_em)}` : 'sem execução registrada')}</span>
                        <span class="progresso" data-estado="${est}" title="${tx === null ? 'Sem execução no período' : `${percentual(tx)} deram certo em ${numero(c[0] + c[1])}`}"><span style="width:${tx === null ? 0 : Math.round(tx * 100)}%"></span></span>
                    </span>
                    <span class="item-meta">${tx === null ? '—' : percentual(tx)}<br><span class="fraco">${plural(c[0] + c[1], 'vez', 'vezes')}</span></span>
                </div>`;
                // Sem resumo público o cartão não vira (e nem parece clicável).
                if (!r.resumo) return html`<div class="item painel-robo"><div class="painel-robo-miolo">${frente}</div></div>`;
                const virado = virados.has(r.id);
                return html`<div class="item painel-robo" data-vira="${r.id}" role="button" tabindex="0" aria-pressed="${String(virado)}"
                        aria-label="${virado ? `${r.nome}: ${r.resumo} Toque para voltar.` : `${r.nome}. Toque para ver o que este robô faz.`}">
                    <div class="painel-robo-miolo">
                        ${frente}
                        <div class="painel-robo-verso" aria-hidden="${String(!virado)}">
                            <span class="item-titulo">${r.nome}</span>
                            <span class="painel-robo-resumo">${r.resumo}</span>
                            <span class="minimo fraco"><i class="bi bi-arrow-counterclockwise" aria-hidden="true"></i> toque para voltar</span>
                        </div>
                    </div>
                </div>`;
            })}</div></div>`;
    }));
}

function desenharFiltros(lista) {
    const sel = $('#filtro-seguradora');
    const opcoes = [['', 'Todas'], ...seguradorasDisponiveis(), [SISTEMAS, 'Sistemas nossos']];
    if (sel.options.length !== opcoes.length) {
        montar(sel, opcoes.map(([v, t]) => html`<option value="${v}">${t}</option>`));
    }
    sel.value = filtros.seguradora;
    const ativos = Object.keys(PADROES).filter((k) => filtros[k] !== PADROES[k]);
    $('#limpar-filtros').hidden = !ativos.length;
    $('#recorte').textContent = lista.length === dados.robos.length
        ? `Mostrando os ${dados.robos.length} robôs ativos`
        : `Mostrando ${lista.length} de ${dados.robos.length} robôs ativos`;
}

function desenhar() {
    if (!dados) return;
    const lista = robosDoRecorte();
    const porRobo = lista.map((r) => ({ robo: r, ...contagens(r) }));
    const totais = { atual: somar(porRobo.map((x) => x.atual)), anterior: somar(porRobo.map((x) => x.anterior)) };
    const atencao = lista
        .map((r) => ({ robo: r, motivos: precisaAtencao(r), taxa: taxaDe(contagens(r).atual) }))
        .filter((a) => a.motivos.length)
        .sort((a, b) => (b.robo.travado || b.robo.ultimo_status === 'erro') - (a.robo.travado || a.robo.ultimo_status === 'erro') || (a.taxa ?? 1) - (b.taxa ?? 1));
    desenharFiltros(lista);
    desenharManchete(lista, totais, atencao);
    desenharNumeros(lista, totais, atencao);
    desenharRitmo(lista);
    desenharAtencao(atencao);
    desenharRobos(lista);
}

function aoMudarFiltro() {
    gravarFiltros(filtros, PADROES);
    desenhar();
}

async function carregar() {
    try {
        dados = await obter(FONTE);
    } catch (erro) {
        if (!dados) montar('#lista-robos', erroEmBloco(erro, carregar));
        return;
    }
    desenhar();
    $('#dados-de').textContent = `dados de ${hora(dados.gerado_em)}`;
}

['periodo', 'tipo', 'situacao'].forEach((chave) => ligarSegmentado(`[data-filtro="${chave}"]`, filtros, chave, aoMudarFiltro));
// Virar o cartão do robô: clique/toque, ou Enter/Espaço no teclado.
function virar(el) {
    const id = Number(el.dataset.vira);
    const virado = !virados.has(id);
    if (virado) virados.add(id); else virados.delete(id);
    const r = dados.robos.find((x) => x.id === id);
    el.setAttribute('aria-pressed', String(virado));
    el.setAttribute('aria-label', virado ? `${r.nome}: ${r.resumo} Toque para voltar.` : `${r.nome}. Toque para ver o que este robô faz.`);
    el.querySelector('.painel-robo-verso').setAttribute('aria-hidden', String(!virado));
}
$('#lista-robos').addEventListener('click', (ev) => {
    const el = ev.target.closest('[data-vira]');
    if (el) virar(el);
});
$('#lista-robos').addEventListener('keydown', (ev) => {
    const el = ev.target.closest('[data-vira]');
    if (el && (ev.key === 'Enter' || ev.key === ' ')) { ev.preventDefault(); virar(el); }
});

$('#filtro-seguradora').addEventListener('change', (ev) => { filtros.seguradora = ev.target.value; aoMudarFiltro(); });
$('#limpar-filtros').addEventListener('click', () => {
    Object.assign(filtros, PADROES);
    document.querySelectorAll('.painel-filtros [data-filtro]').forEach((el) => el.querySelectorAll('[data-valor]').forEach((b) => {
        b.setAttribute('aria-pressed', String(b.dataset.valor === String(filtros[el.dataset.filtro] ?? '')));
    }));
    aoMudarFiltro();
});

aCada(60_000, carregar, { rotulo: '#ultima-atualizacao' });

// Painel ao vivo (sem login; o quadro Em construção fica em quadro_publico.js): a história dos robôs num recorte escolhido
// pelos filtros (período, seguradora, tipo, situação). Os dados chegam uma
// vez por minuto de GET /api/dashboard/painel-publico; filtrar e escrever as
// frases acontece aqui, na hora, sem ir ao servidor. Só APIs públicas.

import { html, montar, $, vazio, erroEmBloco } from '../core/ui.js';
import { relativo, percentual, numero, plural, dataCurta, hora } from '../core/format.js';
import { aCada } from '../core/atualizacao.js';
import { barrasSucessoFalha } from '../core/graficos.js';
import { lerFiltros, gravarFiltros, ligarSegmentado } from '../core/filtros.js';

const SISTEMAS = '__sistemas';
const PADROES = { periodo: 'hoje', seguradora: '', tipo: '', situacao: '' };
const TIPO_TEXTO = { cotacao: 'de cotação', renovacao: 'de renovação', outros: 'de operação' };
const SITUACAO_TEXTO = { problema: 'com problema', rodando: 'rodando agora', ok: 'que deram certo na última vez' };

const filtros = lerFiltros(PADROES);
let dados = null;
let grafico = null;
// Robôs com o "o que faz" aberto na tabela. Fica guardado aqui para a
// atualização de cada minuto não fechar o de ninguém.
const virados = new Set();

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

// --- Dados do recorte -----------------------------------------------------------
const chaveSeguradora = (s) => s.trim().toUpperCase();
// Um nome curto por seguradora, igual nas três telas públicas (09-10-2026:
// o Painel dizia "Porto Seguros" e "Tokio Marine", o Resultado "Porto" e "Tokio").
const NOMES_CURTOS = { 'PORTO SEGUROS': 'Porto', 'PORTO SEGURO': 'Porto', 'TOKIO MARINE': 'Tokio' };
const nomeSeguradora = (s) => NOMES_CURTOS[chaveSeguradora(s)] || s.trim().toLowerCase().replace(/(^|\s)\S/g, (l) => l.toUpperCase());

function seguradorasDisponiveis() {
    const mapa = new Map();
    dados.robos.filter((r) => !r.sistema_nosso).forEach((r) => r.seguradoras.forEach((s) => mapa.set(chaveSeguradora(s), nomeSeguradora(s))));
    return [...mapa.entries()].sort((a, b) => a[1].localeCompare(b[1], 'pt-BR'));
}

function rotuloSeguradora(valor) {
    if (valor === SISTEMAS) return 'Sistemas nossos';
    return seguradorasDisponiveis().find(([k]) => k === valor)?.[1] || valor;
}

// "Pede atenção" vem pronto do servidor, com a mesma regra de "O que precisa
// de você" da tela Hoje (05-10-2026) - antes cada tela tinha a sua.
const motivosAtencao = (r) => r.atencao || [];

function situacao(r) {
    if (r.travado || motivosAtencao(r).length) return 'problema';
    if (r.rodando) return 'rodando';
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
    return motivosAtencao(r);
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

// Manchete (09-10-2026): começa pela RESPOSTA — quantos pedem atenção e
// quantos estão em dia —, só com as cores de estado (vermelho/verde). O
// volume e a taxa de acerto vêm depois, no contexto.
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
    const emDia = lista.length - atencao.length;
    const umSo = lista.length === 1;
    let texto;
    if (umSo) {
        texto = atencao.length
            ? html`${textoPeriodo()}, <span class="destaque-falha">${lista[0].nome} pede atenção</span>.`
            : html`${textoPeriodo()}, <span class="destaque-ok">${lista[0].nome} está em dia</span>.`;
    } else if (!atencao.length) {
        texto = html`${textoPeriodo()}, <span class="destaque-ok">${textoEscopo(lista)} estão em dia</span>. Nenhum pede atenção.`;
    } else {
        texto = html`${textoPeriodo()}, <span class="destaque-falha">${atencao.length} de ${lista.length} robôs ${atencao.length === 1 ? 'pede' : 'pedem'} atenção</span>.${emDia
            ? html` ${emDia === 1 ? 'O outro está' : `Os outros ${emDia} estão`} <span class="destaque-ok">em dia</span>.` : ''}`;
    }
    montar('#manchete-texto', texto);

    // Quem pede atenção, pelo nome (até 2), e o volume do período.
    const nomes = atencao.slice(0, 2).map((a) => a.robo.nome);
    const quem = atencao.length
        ? `${atencao.length === 1 ? 'É' : 'São'} ${nomes.join(' e ')}${atencao.length > 2 ? ` e mais ${atencao.length - 2}` : ''}. `
        : '';
    const volume = execs
        ? `${plural(execs, 'execução', 'execuções')}${taxa === null ? '' : `, ${percentual(taxa)} deram certo`}`
        : 'Nenhuma execução no período';
    const [okAnt, falhasAnt] = totais.anterior;
    const execsAnt = okAnt + falhasAnt;
    let contexto;
    if (!execsAnt) {
        contexto = `${volume}. Não houve execução ${textoAnterior()} para comparar.`;
    } else if (!execs) {
        contexto = `${volume}; ${textoAnterior()} foram ${plural(execsAnt, 'execução', 'execuções')}.`;
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
        contexto = `${volume}: ${ritmo}${qualidade}.`;
    }
    $('#manchete-contexto').textContent = `${quem}${contexto}`;
    const rodando = lista.filter((r) => r.rodando);
    // Pausa dos robôs (notebook fora da empresa): só desde quando, sem nome.
    montar('#manchete-rodape', html`
        ${dados.pausado_desde ? html`<span><i class="bi bi-pause-circle"></i> Robôs pausados desde ${hora(dados.pausado_desde)}</span>` : ''}
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
        datasets: barrasSucessoFalha(valores.map(([s]) => s), valores.map(([, e]) => e)),
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
        montar('#lista-atencao', vazio('check2-circle', 'Nenhum robô pede atenção neste recorte.', 'Nenhum falhou hoje, travou ou deixou de rodar no horário.'));
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

// Robô por robô (09-10-2026, 2ª versão): UMA TABELA, uma linha por robô — os
// cartões por seguradora tinham alturas diferentes e deixavam buracos na tela
// (nem a grade nem as colunas corridas resolveram). Ordem: quem pede atenção,
// depois quem está rodando, depois por seguradora; "Sistemas nossos" no fim.
function seguradorasDoRobo(r) {
    if (r.sistema_nosso) return 'Sistemas nossos';
    const nomes = [...new Set(r.seguradoras.map(nomeSeguradora))];
    return nomes.length ? nomes.join(', ') : '—';
}

function ordemDosRobos(lista) {
    const peso = (r) => (r.travado || motivosAtencao(r).length ? 0 : r.rodando ? 1 : 2);
    return lista.slice().sort((a, b) => peso(a) - peso(b)
        || (a.sistema_nosso - b.sistema_nosso)
        || seguradorasDoRobo(a).localeCompare(seguradorasDoRobo(b), 'pt-BR')
        || a.nome.localeCompare(b.nome, 'pt-BR'));
}

function desenharRobos(lista) {
    if (!lista.length) {
        montar('#lista-robos', vazio('funnel', 'Nenhum robô neste recorte.', 'Troque os filtros acima.'));
        return;
    }
    const estado = (r) => (r.travado ? 'falha' : r.rodando ? 'rodando' : ({ sucesso: 'ok', erro: 'falha' }[r.ultimo_status] || 'neutro'));
    const rotuloEstado = { ok: 'última deu certo', falha: 'última falhou', rodando: 'rodando agora', neutro: 'sem execução' };
    montar('#lista-robos', html`<div class="tabela-envoltorio"><table class="tabela tabela-robos">
        <thead><tr>
            <th scope="col">Robô</th>
            <th scope="col" class="col-seguradora">Seguradora</th>
            <th scope="col">Última execução</th>
            <th scope="col" class="col-acerto">Deu certo no período</th>
            <th scope="col" class="direita col-vezes">Execuções</th>
        </tr></thead>
        <tbody>${ordemDosRobos(lista).map((r) => {
            const c = contagens(r).atual;
            const tx = taxaDe(c);
            const est = tx === null ? 'neutro' : (tx >= 0.9 ? 'ok' : (tx >= 0.7 ? 'atencao' : 'falha'));
            const e = estado(r);
            const aberto = virados.has(r.id);
            const quando = r.travado ? `parece travado (desde ${relativo(r.ultima_execucao_em)})`
                : r.rodando ? 'rodando agora' : (r.ultima_execucao_em ? relativo(r.ultima_execucao_em) : 'sem execução registrada');
            const linha = html`<tr data-estado="${e}">
                <td><span class="robo-nome">
                    <span class="ponto" data-estado="${e}" role="img" aria-label="${rotuloEstado[e]}"></span>
                    ${r.resumo
                        ? html`<button type="button" class="robo-botao" data-vira="${r.id}" aria-expanded="${String(aberto)}" title="O que este robô faz">${r.nome} <i class="bi bi-${aberto ? 'chevron-up' : 'info-circle'}" aria-hidden="true"></i></button>`
                        : html`<span class="robo-botao">${r.nome}</span>`}
                </span></td>
                <td class="col-seguradora fraco">${seguradorasDoRobo(r)}</td>
                <td class="${e === 'falha' ? 'texto-falha' : ''}">${quando}</td>
                <td class="col-acerto"><span class="acerto">
                    <span class="progresso" data-estado="${est}" title="${tx === null ? 'Sem execução no período' : `${percentual(tx)} deram certo em ${numero(c[0] + c[1])}`}"><span style="width:${tx === null ? 0 : Math.round(tx * 100)}%"></span></span>
                    <span class="acerto-valor">${tx === null ? '—' : percentual(tx)}</span>
                </span></td>
                <td class="direita col-vezes">${numero(c[0] + c[1])}</td>
            </tr>`;
            // Tocar no nome abre, logo abaixo, o que o robô faz (resumo público).
            return aberto && r.resumo
                ? html`${linha}<tr class="robo-resumo"><td colspan="5">${r.resumo}</td></tr>`
                : linha;
        })}</tbody>
    </table></div>`);
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
        .sort((a, b) => b.robo.travado - a.robo.travado || (a.taxa ?? 1) - (b.taxa ?? 1));
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
        dados = await obterDados();
    } catch (erro) {
        if (!dados) montar('#lista-robos', erroEmBloco(erro, carregar));
        return;
    }
    desenhar();
    $('#dados-de').textContent = `dados de ${hora(dados.gerado_em)}`;
}

['periodo', 'tipo', 'situacao'].forEach((chave) => ligarSegmentado(`[data-filtro="${chave}"]`, filtros, chave, aoMudarFiltro));
// Abrir/fechar o que o robô faz: o nome é um botão (Enter/Espaço já funcionam).
$('#lista-robos').addEventListener('click', (ev) => {
    const el = ev.target.closest('[data-vira]');
    if (!el) return;
    const id = Number(el.dataset.vira);
    if (virados.has(id)) virados.delete(id); else virados.add(id);
    desenhar();
    document.querySelector(`#lista-robos [data-vira="${id}"]`)?.focus();
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

// Trocou o tema (claro/escuro): o gráfico guarda as cores de quando foi
// criado, então é refeito com as cores do tema novo.
document.addEventListener('central:tema', () => {
    if (!grafico) return;
    grafico.destroy();
    grafico = null;
    desenhar();
});

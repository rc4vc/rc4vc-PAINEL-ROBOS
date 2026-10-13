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
// Robôs com o "o que faz" aberto. Guardado aqui para a atualização de cada
// minuto não fechar o de ninguém.
const abertos = new Set();

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
    if (valor === 0) return html`<span class="tendencia" data-direcao="igual"><i class="bi bi-dash"></i>igual a ${REFERENCIA_CURTA[filtros.periodo]}</span>`;
    const sobe = valor > 0;
    // bomQuandoSobe = null: só informa (mais ou menos execuções não é bom nem ruim).
    const bom = bomQuandoSobe === null ? 'neutro' : String(sobe === bomQuandoSobe);
    // Nota curta (13-10-2026: os números dividem a linha com a manchete); a
    // frase inteira fica no title.
    const quanto = pontos ? plural(Math.abs(valor), 'ponto', 'pontos') : `${Math.abs(valor)}%`;
    return html`<span class="tendencia" data-direcao="${sobe ? 'sobe' : 'desce'}" data-bom="${bom}" title="${quanto} ${sobe ? 'acima' : 'abaixo'} ${textoVs()}"><i class="bi bi-arrow-${sobe ? 'up' : 'down'}-right"></i>${sobe ? '+' : '−'}${quanto} vs ${REFERENCIA_CURTA[filtros.periodo]}</span>`;
}

const REFERENCIA_CURTA = { hoje: 'ontem', 7: '7 dias antes', 30: '30 dias antes' };

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
    // Pausa dos robôs (notebook fora da empresa): só desde quando, sem nome.
    // Quem está rodando fica só no número "Rodando agora" (13-10-2026: aparecia
    // nos dois lugares).
    montar('#manchete-rodape', dados.pausado_desde
        ? html`<span><i class="bi bi-pause-circle"></i> Robôs pausados desde ${hora(dados.pausado_desde)}</span>` : '');
}

/** Próximo horário previsto hoje entre os robôs da lista ("HH:MM"), ou null. */
function proximaDaLista(lista) {
    return lista.map((r) => r.proxima_hoje).filter(Boolean).sort()[0] || null;
}

function desenharNumeros(lista, totais) {
    const [ok, falhas] = totais.atual;
    const execs = ok + falhas;
    const execsAnt = totais.anterior[0] + totais.anterior[1];
    kpi('kpi-execucoes', html`${numero(execs)}`, tendencia(variacao(execs, execsAnt), { bomQuandoSobe: null }));
    const taxa = taxaDe(totais.atual);
    const taxaAnt = taxaDe(totais.anterior);
    kpi('kpi-taxa', html`${percentual(taxa)}`,
        taxa === null ? 'nenhuma execução no período' : tendencia(taxaAnt === null ? null : taxa - taxaAnt, { pontos: true }),
        taxa === null ? null : (taxa >= 0.9 ? 'ok' : (taxa >= 0.7 ? 'atencao' : 'falha')));
    // "Pedem atenção" saiu dos números (13-10-2026): a manchete já responde.
    const rodando = lista.filter((r) => r.rodando);
    const proxima = proximaDaLista(lista);
    let nota = 'nenhum neste momento';
    if (rodando.length) nota = rodando.map((r) => r.nome).join(', ');
    else if (proxima) nota = `próximo às ${proxima}`;
    kpi('kpi-rodando', html`${rodando.length}`, nota, rodando.length ? 'rodando' : null);
    document.getElementById('kpi-rodando').title = rodando.length ? nota : '';
}

function serieDoRitmo(lista) {
    if (filtros.periodo === 'hoje') {
        // O dia inteiro (13-10-2026): as horas que ainda não chegaram ficam
        // vazias, para dar a noção de quanto do dia já passou.
        const rotulos = Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2, '0')}h`);
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

// "Pede atenção agora" só aparece quando alguém pede (13-10-2026): vazio, o
// bloco repetia a manchete e ocupava 265 px.
function desenharAtencao(atencao) {
    $('#atencao').hidden = !atencao.length;
    if (!atencao.length) {
        $('#frase-atencao').textContent = '';
        montar('#lista-atencao', '');
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

// Robô por robô: histórico das versões em docs/HISTORICO.md (blocos iguais,
// colunas, linhas; desde 13-10-2026, um cartão-história por seguradora).
function seguradorasDoRobo(r) {
    if (r.sistema_nosso) return 'Sistemas nossos';
    const nomes = [...new Set(r.seguradoras.map(nomeSeguradora))];
    return nomes.length ? nomes.join(', ') : '—';
}

function ordemDosRobos(lista) {
    // Sob demanda por último no grupo (13-10-2026).
    const peso = (r) => (r.travado || motivosAtencao(r).length ? 0 : r.rodando ? 1 : sobDemanda(r) ? 3 : 2);
    return lista.slice().sort((a, b) => peso(a) - peso(b)
        || (a.sistema_nosso - b.sistema_nosso)
        || seguradorasDoRobo(a).localeCompare(seguradorasDoRobo(b), 'pt-BR')
        || a.nome.localeCompare(b.nome, 'pt-BR'));
}

const sobDemanda = (r) => r.modo === 'sob_demanda';

/** Situação do bloco: [estado, texto da etiqueta]. Robô sob demanda que não
 *  rodou não é "Não rodou hoje" (13-10-2026): é o normal dele. */
function situacaoDoRobo(r, execucoes) {
    if (r.travado) return ['falha', 'Parece travado'];
    if (r.rodando) return ['rodando', 'Rodando agora'];
    if (r.ultimo_status === 'erro') return ['falha', 'Falhou na última'];
    if (motivosAtencao(r).length) return ['atencao', 'Pede atenção'];
    if (!execucoes) {
        if (sobDemanda(r)) return ['neutro', 'Sob demanda'];
        if (filtros.periodo !== 'hoje') return ['neutro', 'Não rodou no período'];
        return ['neutro', r.roda_hoje ? 'Ainda não rodou' : 'Não rodou hoje'];
    }
    return ['ok', 'Deu certo'];
}

/** O que a linha do robô diz à direita: o fato que importa sobre ele agora. */
function metaDoRobo(r, [estado, etiqueta]) {
    const ultima = r.ultima_execucao_em ? relativo(r.ultima_execucao_em) : null;
    if (r.rodando) return 'rodando agora';
    if (estado === 'falha' || estado === 'atencao') return ultima ? `${etiqueta.toLowerCase()} · ${ultima}` : etiqueta.toLowerCase();
    // A última execução de quem roda sob demanda vai no title da linha.
    if (sobDemanda(r) && estado === 'neutro') return 'sob demanda';
    if (estado === 'neutro') {
        if (r.proxima_hoje && filtros.periodo === 'hoje') return `roda às ${r.proxima_hoje}`;
        return ultima ? `não rodou · última ${ultima}` : 'nunca rodou';
    }
    return ultima ? `deu certo ${ultima}` : 'deu certo';
}

/** Nome sem a seguradora que já está no título da coluna
 *  ("Apólices e comissão Akad" -> "Apólices e comissão"). */
const escaparRegex = (texto) => texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function nomeSemSeguradora(r) {
    let nome = r.nome;
    // O cadastro diz "Porto Seguros" e o nome do robô, só "Porto".
    const formas = r.seguradoras.flatMap((s) => [s.trim(), nomeSeguradora(s), s.trim().split(/\s+/)[0]]);
    [...new Set(formas)].forEach((s) => {
        const sem = nome.replace(new RegExp(`\\s*[-–·]?\\s*${escaparRegex(s)}\\s*$`, 'i'), '').trim();
        if (sem) nome = sem;
    });
    return nome;
}

// Anel de 0 a 100%: o quanto deu certo no período.
const CIRCUNFERENCIA = 2 * Math.PI * 20;
function anel(taxa, estado) {
    const cheio = taxa === null ? 0 : taxa * CIRCUNFERENCIA;
    return html`<svg class="anel" viewBox="0 0 48 48" aria-hidden="true">
        <circle cx="24" cy="24" r="20" class="anel-fundo"></circle>
        ${cheio > 0 ? html`<circle cx="24" cy="24" r="20" class="anel-valor" data-estado="${estado}" stroke-dasharray="${cheio.toFixed(1)} ${CIRCUNFERENCIA.toFixed(1)}"></circle>` : ''}
    </svg>`;
}

// Grupos por seguradora (13-10-2026, pedido do responsável); dentro do
// grupo, quem pede atenção primeiro e sob demanda por último (ordemDosRobos).
function desenharRobos(lista) {
    if (!lista.length) {
        montar('#lista-robos', vazio('funnel', 'Nenhum robô neste recorte.', 'Troque os filtros acima.'));
        return;
    }
    const grupos = new Map();
    ordemDosRobos(lista).forEach((r) => {
        const [ok, falhas] = contagens(r).atual;
        const nome = seguradorasDoRobo(r);
        if (!grupos.has(nome)) grupos.set(nome, { nome, sistema: r.sistema_nosso, itens: [] });
        grupos.get(nome).itens.push({ r, ok, falhas, situacao: situacaoDoRobo(r, ok + falhas) });
    });
    // Um cartão por seguradora que conta o dia dela (13-10-2026, pedido do
    // responsável: "refazer pensando na clareza e objetividade, com
    // storytelling"): a situação num selo, UMA frase com a resposta, o anel
    // com quanto deu certo e a lista dos robôs, um por linha, com o fato que
    // importa sobre cada um. Quem pede atenção primeiro; Sistemas nossos no fim.
    const ordem = [...grupos.values()].map(resumoDoGrupo)
        .sort((a, b) => (a.sistema - b.sistema) || (PESO_GRUPO[a.estado] - PESO_GRUPO[b.estado]) || a.nome.localeCompare(b.nome, 'pt-BR'));
    montar('#lista-robos', ordem.map(cartaoDaSeguradora));
}

const PESO_GRUPO = { falha: 0, atencao: 0, rodando: 1, ok: 2, neutro: 3 };
const SELO_GRUPO = { falha: 'Pede atenção', atencao: 'Pede atenção', rodando: 'Rodando agora', ok: 'Em dia', neutro: 'Sem execução' };
const PERIODO_CURTO = { hoje: 'hoje', 7: 'em 7 dias', 30: 'em 30 dias' };

/** A história de uma seguradora: estado, taxa e a frase que responde
 *  "como foi o dia dela?" — o problema primeiro, se houver. */
function resumoDoGrupo(g) {
    const [ok, falhas] = somar(g.itens.map((i) => [i.ok, i.falhas]));
    const execucoes = ok + falhas;
    const taxa = taxaDe([ok, falhas]);
    const problemas = g.itens.filter((i) => ['falha', 'atencao'].includes(i.situacao[0]));
    const rodando = g.itens.filter((i) => i.r.rodando);
    const agendados = g.itens.filter((i) => !sobDemanda(i.r));
    const nome = (i) => nomeNoGrupo(i.r, g);
    let estado;
    let frase;
    if (problemas.length) {
        const [p] = problemas;
        estado = problemas.some((i) => i.situacao[0] === 'falha') ? 'falha' : 'atencao';
        const motivo = motivosAtencao(p.r)[0] || p.situacao[1].toLowerCase();
        frase = `${nome(p)} ${motivo}${problemas.length > 1 ? ` (e mais ${problemas.length - 1})` : ''}.`;
    } else {
        const partes = [];
        if (rodando.length) partes.push(`${rodando.map(nome).join(' e ')} ${rodando.length === 1 ? 'está' : 'estão'} rodando agora`);
        if (execucoes) partes.push(`${plural(execucoes, 'execução', 'execuções')} ${PERIODO_CURTO[filtros.periodo]}, ${taxa === 1 ? 'todas deram certo' : `${percentual(taxa)} deram certo`}`);
        else if (rodando.length) { /* a primeira execução do período é a que está rodando */ }
        else if (agendados.length) {
            const proxima = proximaDaLista(agendados.map((i) => i.r));
            partes.push(proxima && filtros.periodo === 'hoje' ? `ainda não rodou hoje; o próximo é às ${proxima}` : 'não rodou no período');
        } else partes.push('roda só quando alguém pede');
        frase = partes.map((p) => `${p.charAt(0).toUpperCase()}${p.slice(1)}.`).join(' ');
        estado = rodando.length ? 'rodando' : (execucoes ? 'ok' : 'neutro');
    }
    return { ...g, estado, frase, taxa };
}

function cartaoDaSeguradora(g) {
    const est = g.taxa === null ? 'neutro' : (g.taxa >= 0.9 ? 'ok' : (g.taxa >= 0.7 ? 'atencao' : 'falha'));
    return html`<li class="seg-cartao" data-estado="${g.estado}">
        <div class="seg-topo">
            <div class="seg-titulo">
                <h3>${g.nome}</h3>
                <span class="seg-selo" data-estado="${g.estado}"><span class="ponto" data-estado="${g.estado}" aria-hidden="true"></span>${SELO_GRUPO[g.estado]}</span>
            </div>
            ${g.taxa === null ? '' : html`<span class="robo-anel" title="${percentual(g.taxa)} das execuções deram certo">${anel(g.taxa, est)}<span class="robo-anel-valor">${percentual(g.taxa)}</span></span>`}
        </div>
        <p class="seg-frase">${g.frase}</p>
        <ul class="seg-robos">${g.itens.map((i) => linhaDoRobo(i, g))}</ul>
    </li>`;
}

/** Nome dentro do cartão da seguradora: sem ela (já está no título); em
 *  Sistemas nossos, o nome inteiro. */
function nomeNoGrupo(r, grupo) {
    return grupo.sistema ? r.nome : nomeSemSeguradora(r);
}

// Um robô = uma linha: forma/cor da situação, o nome e o fato que importa
// ("deu certo há 5 min", "roda às 10:00", "sob demanda"). Tocando, abre o que
// o robô faz (o `resumo` público); a atualização de cada minuto não fecha.
function linhaDoRobo({ r, situacao }, grupo) {
    const [estado] = situacao;
    const meta = metaDoRobo(r, situacao);
    const ultima = r.ultima_execucao_em ? `última execução ${relativo(r.ultima_execucao_em)}` : 'nunca rodou';
    const dica = `${r.nome}: ${meta}${sobDemanda(r) ? ` (${ultima})` : ''}`;
    const corpo = html`<span class="ponto" data-estado="${estado}" aria-hidden="true"></span>
        <span class="seg-robo-nome">${nomeNoGrupo(r, grupo)}</span>
        <span class="seg-robo-meta" data-estado="${estado}">${meta}</span>`;
    if (!r.resumo) return html`<li class="seg-robo" data-modo="${r.modo}"><div class="seg-robo-linha" title="${dica}">${corpo}</div></li>`;
    return html`<li class="seg-robo" data-modo="${r.modo}"><details data-robo="${r.id}"${abertos.has(r.id) ? ' open' : ''}>
        <summary class="seg-robo-linha" title="${dica}. Toque para ver o que ele faz.">${corpo}</summary>
        <p class="seg-robo-resumo">${r.resumo}</p>
    </details></li>`;
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
        ? `· ${plural(dados.robos.length, 'robô ativo', 'robôs ativos')}`
        : `· ${lista.length} de ${plural(dados.robos.length, 'robô ativo', 'robôs ativos')}`;
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
    desenharNumeros(lista, totais);
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
    // Só a hora dos dados (13-10-2026: o rodapé repetia "dados de 09:06 ·
    // Atualizado às 09:06").
    $('#dados-de').textContent = `Dados de ${hora(dados.gerado_em)}`;
}

['periodo', 'tipo', 'situacao'].forEach((chave) => ligarSegmentado(`[data-filtro="${chave}"]`, filtros, chave, aoMudarFiltro));
// Abrir/fechar o "o que faz" de um robô (<details>): guarda quem está aberto
// para a atualização de cada minuto não fechar. `toggle` não sobe, por isso
// a escuta é na captura.
$('#lista-robos').addEventListener('toggle', (ev) => {
    const id = Number(ev.target.dataset?.robo);
    if (!id) return;
    if (ev.target.open) abertos.add(id); else abertos.delete(id);
}, true);

$('#filtro-seguradora').addEventListener('change', (ev) => { filtros.seguradora = ev.target.value; aoMudarFiltro(); });
$('#limpar-filtros').addEventListener('click', () => {
    Object.assign(filtros, PADROES);
    document.querySelectorAll('.painel-filtros [data-filtro]').forEach((el) => el.querySelectorAll('[data-valor]').forEach((b) => {
        b.setAttribute('aria-pressed', String(b.dataset.valor === String(filtros[el.dataset.filtro] ?? '')));
    }));
    aoMudarFiltro();
});

aCada(60_000, carregar);

// Trocou o tema (claro/escuro): o gráfico guarda as cores de quando foi
// criado, então é refeito com as cores do tema novo.
document.addEventListener('central:tema', () => {
    if (!grafico) return;
    grafico.destroy();
    grafico = null;
    desenhar();
});

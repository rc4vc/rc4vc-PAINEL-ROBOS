// Peças de interface compartilhadas por todas as telas.
//
// - html``          monta HTML com ESCAPE AUTOMÁTICO de tudo que é interpolado
//                   (fim do "esqueci o escapeHtml" = XSS). Para inserir HTML já
//                   montado, use seguro(...) ou outro html``.
// - toast()         aviso rápido, opcionalmente com botão "Desfazer".
// - confirmar()     substitui confirm(); pode exigir digitar um texto.
// - formulario()    substitui prompt() — um diálogo com campos de verdade.
// - selo()          o MESMO selo de estado em todas as telas (ícone + texto).
// - copiar()        área de transferência com fallback (Central roda em HTTP).

const MARCA_SEGURO = Symbol('html-seguro');

export function escapar(valor) {
    if (valor === null || valor === undefined) return '';
    return String(valor)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

export function seguro(texto) {
    return { [MARCA_SEGURO]: true, texto: String(texto ?? '') };
}

function paraHtml(valor) {
    if (valor === null || valor === undefined || valor === false) return '';
    if (Array.isArray(valor)) return valor.map(paraHtml).join('');
    if (typeof valor === 'object' && valor[MARCA_SEGURO]) return valor.texto;
    return escapar(valor);
}

export function html(partes, ...valores) {
    let saida = '';
    partes.forEach((parte, i) => {
        saida += parte;
        if (i < valores.length) saida += paraHtml(valores[i]);
    });
    return seguro(saida);
}

/** Troca o conteúdo de um elemento por um html``. */
export function montar(alvo, conteudo) {
    const el = typeof alvo === 'string' ? document.querySelector(alvo) : alvo;
    if (!el) return null;
    el.innerHTML = paraHtml(conteudo);
    return el;
}

export function $(seletor, raiz = document) { return raiz.querySelector(seletor); }
export function $$(seletor, raiz = document) { return [...raiz.querySelectorAll(seletor)]; }

/** Delegação de eventos: funciona mesmo depois de re-renderizar a lista. */
export function aoClicar(raiz, seletor, fn) {
    const el = typeof raiz === 'string' ? document.querySelector(raiz) : raiz;
    el?.addEventListener('click', (ev) => {
        const alvo = ev.target.closest(seletor);
        if (alvo && el.contains(alvo)) fn(ev, alvo);
    });
}

// ---------------------------------------------------------------------------
// Estados — vocabulário único da Central
// ---------------------------------------------------------------------------
export const ESTADOS = {
    // resultado de disparo manual
    concluido: { estado: 'ok', rotulo: 'Concluído', icone: 'check-circle-fill' },
    parcial: { estado: 'atencao', rotulo: 'Parcial', icone: 'exclamation-triangle-fill' },
    falhou: { estado: 'falha', rotulo: 'Falhou', icone: 'x-circle-fill' },
    parado: { estado: 'neutro', rotulo: 'Parado', icone: 'stop-circle-fill' },
    recusado: { estado: 'neutro', rotulo: 'Recusado', icone: 'slash-circle' },
    em_andamento: { estado: 'rodando', rotulo: 'Rodando', icone: 'arrow-repeat' },
    // status de execução
    sucesso: { estado: 'ok', rotulo: 'Sucesso', icone: 'check-circle-fill' },
    erro: { estado: 'falha', rotulo: 'Erro', icone: 'x-circle-fill' },
    em_execucao: { estado: 'rodando', rotulo: 'Rodando', icone: 'arrow-repeat' },
    // alertas
    travado: { estado: 'falha', rotulo: 'Travado', icone: 'hourglass-split' },
    atraso_agendamento: { estado: 'atencao', rotulo: 'Atrasado', icone: 'clock-history' },
    // cadastro
    ativo: { estado: 'ok', rotulo: 'Ativo', icone: 'toggle-on' },
    inativo: { estado: 'neutro', rotulo: 'Desativado', icone: 'toggle-off' },
    // planejamento de cotações
    pronto: { estado: 'ok', rotulo: 'Robô pronto', icone: 'robot' },
    nao_iniciado: { estado: 'neutro', rotulo: 'Manual', icone: 'hand-index' },
    ausente: { estado: 'neutro', rotulo: 'Não atende', icone: 'dash-circle' },
};

export const TIPOS_ROBO = {
    cotacao: { rotulo: 'Cotação', icone: 'calculator' },
    renovacao: { rotulo: 'Renovação', icone: 'arrow-repeat' },
    outros: { rotulo: 'Operação', icone: 'gear' },
};

export function selo(chave, rotulo) {
    const def = ESTADOS[chave] || { estado: 'neutro', rotulo: chave || '—', icone: 'circle' };
    return html`<span class="selo" data-estado="${def.estado}"><i class="bi bi-${def.icone}" aria-hidden="true"></i>${rotulo || def.rotulo}</span>`;
}

export function seloTipo(tipo) {
    const def = TIPOS_ROBO[tipo] || TIPOS_ROBO.outros;
    return html`<span class="selo" data-estado="info"><i class="bi bi-${def.icone}" aria-hidden="true"></i>${def.rotulo}</span>`;
}

export function vazio(icone, titulo, texto) {
    return html`<div class="vazio"><i class="bi bi-${icone}" aria-hidden="true"></i><strong>${titulo}</strong>${texto ? html`<p>${texto}</p>` : ''}</div>`;
}

export function esqueleto(linhas = 3) {
    return html`<div class="pilha" aria-busy="true" aria-label="Carregando">${Array.from({ length: linhas }, (_, i) => html`<span class="esqueleto" style="height: 18px; width: ${90 - i * 12}%"></span>`)}</div>`;
}

export function erroEmBloco(erro, aoTentarDeNovo) {
    const id = `tentar-${Math.random().toString(36).slice(2)}`;
    setTimeout(() => document.getElementById(id)?.addEventListener('click', aoTentarDeNovo), 0);
    return html`<div class="aviso" data-estado="falha" role="alert"><i class="bi bi-exclamation-octagon" aria-hidden="true"></i>
        <div><p class="forte sem-margem">Não deu para carregar.</p><p class="sem-margem">${erro?.message || 'Erro desconhecido.'}</p>
        ${aoTentarDeNovo ? html`<button type="button" class="btn btn-sm btn-contorno mt-2" id="${id}"><i class="bi bi-arrow-clockwise"></i>Tentar de novo</button>` : ''}</div></div>`;
}

// ---------------------------------------------------------------------------
// Toast
// ---------------------------------------------------------------------------
function areaToasts() {
    let area = document.getElementById('toasts');
    if (!area) {
        area = document.createElement('div');
        area.id = 'toasts';
        area.className = 'toasts';
        area.setAttribute('role', 'status');
        area.setAttribute('aria-live', 'polite');
        document.body.appendChild(area);
    }
    return area;
}

const ICONES_TOAST = { ok: 'check-circle-fill', falha: 'x-octagon-fill', atencao: 'exclamation-triangle-fill', info: 'info-circle-fill' };

export function toast(mensagem, { estado = 'ok', acao = null, duracao = 5000 } = {}) {
    const el = document.createElement('div');
    el.className = 'toast';
    el.dataset.estado = estado;
    montar(el, html`<i class="bi bi-${ICONES_TOAST[estado] || ICONES_TOAST.info}" aria-hidden="true"></i><span>${mensagem}</span>
        ${acao ? html`<button type="button" class="toast-acao">${acao.rotulo}</button>` : ''}`);
    let fechado = false;
    const fechar = () => {
        if (fechado) return;
        fechado = true;
        el.classList.add('saindo');
        setTimeout(() => el.remove(), 220);
    };
    if (acao) {
        el.querySelector('.toast-acao').addEventListener('click', async () => {
            fechar();
            try { await acao.fn(); } catch (erro) { toast(erro.message || 'Não deu certo.', { estado: 'falha' }); }
        });
    }
    areaToasts().appendChild(el);
    setTimeout(fechar, acao ? Math.max(duracao, 7000) : duracao);
    return fechar;
}

// ---------------------------------------------------------------------------
// Diálogos (<dialog> nativo)
// ---------------------------------------------------------------------------
function criarDialogo({ titulo, icone, estado, corpo, rodape, tamanho }) {
    const dialogo = document.createElement('dialog');
    dialogo.className = 'dialogo';
    if (tamanho) dialogo.dataset.tamanho = tamanho;
    const idTitulo = `dlg-${Math.random().toString(36).slice(2)}`;
    dialogo.setAttribute('aria-labelledby', idTitulo);
    montar(dialogo, html`<form method="dialog" class="dialogo-forma" novalidate>
        <div class="dialogo-cabecalho">
            ${icone ? html`<div class="dialogo-icone" data-estado="${estado || ''}"><i class="bi bi-${icone}" aria-hidden="true"></i></div>` : ''}
            <div><h2 id="${idTitulo}">${titulo}</h2></div>
            <button type="button" class="btn btn-fantasma btn-icone btn-sm fechar" data-fechar aria-label="Fechar"><i class="bi bi-x-lg"></i></button>
        </div>
        <div class="dialogo-corpo">${corpo}</div>
        <div class="dialogo-rodape">${rodape}</div>
    </form>`);
    document.body.appendChild(dialogo);

    // Fechamento NÃO depende do evento "close" do <dialog>: com a aba em
    // segundo plano o Chrome pode não entregá-lo, e o botão parecia "não
    // fazer nada" (visto em 29/09/2026). Quem fecha pelo código chama
    // dialogo.fechar(valor), que avisa os interessados na hora; o evento
    // nativo fica só como reserva (Esc, fechamento pelo navegador).
    const ouvintes = [];
    let encerrado = false;
    const finalizar = (valor) => {
        if (encerrado) return;
        encerrado = true;
        if (dialogo.open) { try { dialogo.close(valor); } catch (e) { /* já fechado */ } }
        ouvintes.forEach((fn) => { try { fn(valor); } catch (e) { /* segue */ } });
        setTimeout(() => dialogo.remove(), 50);
    };
    dialogo.fechar = (valor = 'cancelar') => finalizar(valor);
    dialogo.aoFechar = (fn) => ouvintes.push(fn);
    dialogo.addEventListener('close', () => finalizar(dialogo.returnValue || 'cancelar'));
    dialogo.addEventListener('cancel', (ev) => { ev.preventDefault(); finalizar('cancelar'); });
    dialogo.querySelectorAll('[data-fechar]').forEach((b) => b.addEventListener('click', () => finalizar('cancelar')));
    return dialogo;
}

/**
 * confirmar({ titulo, texto, rotuloConfirmar, perigo, digitar })
 * `digitar`: exige que a pessoa digite esse texto (ex.: nome do robô) antes
 * de liberar o botão — para ações irreversíveis.
 */
export function confirmar({ titulo, texto = '', detalhe = null, rotuloConfirmar = 'Confirmar', perigo = false, digitar = null, icone = null } = {}) {
    return new Promise((resolver) => {
        const idEntrada = `conf-${Math.random().toString(36).slice(2)}`;
        const dialogo = criarDialogo({
            titulo,
            icone: icone || (perigo ? 'exclamation-octagon' : 'question-circle'),
            estado: perigo ? 'falha' : '',
            corpo: html`<div class="pilha">
                ${texto ? html`<p class="sem-margem">${texto}</p>` : ''}
                ${detalhe || ''}
                ${digitar ? html`<div class="campo"><label for="${idEntrada}">Para confirmar, digite <strong class="mono">${digitar}</strong></label>
                    <input id="${idEntrada}" class="entrada" autocomplete="off" spellcheck="false"></div>` : ''}
            </div>`,
            rodape: html`<button type="button" class="btn btn-fantasma" data-fechar>Cancelar</button>
                <button type="submit" value="ok" class="btn ${perigo ? 'btn-perigo' : 'btn-primaria'}" data-confirmar ${digitar ? 'disabled' : ''}>${rotuloConfirmar}</button>`,
        });
        const botao = dialogo.querySelector('[data-confirmar]');
        if (digitar) {
            const entrada = dialogo.querySelector(`#${idEntrada}`);
            entrada.addEventListener('input', () => { botao.disabled = entrada.value.trim() !== String(digitar).trim(); });
        }
        dialogo.querySelector('form').addEventListener('submit', (ev) => {
            ev.preventDefault();
            if (!botao.disabled) dialogo.fechar('ok');
        });
        dialogo.aoFechar((valor) => resolver(valor === 'ok'));
        dialogo.showModal();
        (dialogo.querySelector('input') || botao).focus();
    });
}

/** Aviso simples com um botão (substitui alert()). */
export function avisar({ titulo, texto = '', estado = 'info', rotulo = 'Entendi' }) {
    return new Promise((resolver) => {
        const icone = { falha: 'x-octagon', atencao: 'exclamation-triangle', ok: 'check-circle', info: 'info-circle' }[estado] || 'info-circle';
        const dialogo = criarDialogo({
            titulo, icone, estado,
            corpo: html`<p class="sem-margem">${texto}</p>`,
            rodape: html`<button type="submit" value="ok" class="btn btn-primaria">${rotulo}</button>`,
        });
        dialogo.querySelector('form').addEventListener('submit', (ev) => { ev.preventDefault(); dialogo.fechar('ok'); });
        dialogo.aoFechar(() => resolver());
        dialogo.showModal();
    });
}

/**
 * formulario({ titulo, texto, campos, rotuloConfirmar, enviar })
 * campos: [{ nome, rotulo, tipo: 'texto'|'area'|'numero'|'data'|'datahora'|'selecao'|'caixa'|'senha'|'email',
 *            valor, opcoes: [{valor, rotulo}], obrigatorio, ajuda, placeholder }]
 * `enviar(valores)` (opcional): async; se levantar erro, a mensagem aparece
 * no diálogo e ele continua aberto. Resolve com os valores, ou null se cancelado.
 */
export function formulario({ titulo, texto = '', icone = 'pencil-square', campos = [], rotuloConfirmar = 'Salvar', enviar = null, tamanho = null }) {
    return new Promise((resolver) => {
        const prefixo = `f-${Math.random().toString(36).slice(2)}`;
        const campoHtml = (c) => {
            const id = `${prefixo}-${c.nome}`;
            const req = c.obrigatorio ? 'required' : '';
            const ajuda = c.ajuda ? html`<span class="ajuda">${c.ajuda}</span>` : '';
            if (c.tipo === 'caixa') {
                return html`<label class="interruptor" for="${id}"><input type="checkbox" id="${id}" name="${c.nome}" ${c.valor ? 'checked' : ''}><span class="trilho"></span>${c.rotulo}</label>${ajuda}`;
            }
            let controle;
            if (c.tipo === 'area') {
                controle = html`<textarea class="area-texto" id="${id}" name="${c.nome}" rows="${c.linhas || 4}" placeholder="${c.placeholder || ''}" ${req}>${c.valor ?? ''}</textarea>`;
            } else if (c.tipo === 'selecao') {
                controle = html`<select class="selecao" id="${id}" name="${c.nome}" ${req}>${(c.opcoes || []).map((o) => html`<option value="${o.valor}" ${String(o.valor) === String(c.valor ?? '') ? 'selected' : ''}>${o.rotulo}</option>`)}</select>`;
            } else {
                const tipo = { numero: 'number', data: 'date', datahora: 'datetime-local', senha: 'password', email: 'email' }[c.tipo] || 'text';
                controle = html`<input class="entrada" type="${tipo}" id="${id}" name="${c.nome}" value="${c.valor ?? ''}" placeholder="${c.placeholder || ''}" ${c.min !== undefined ? seguro(`min="${Number(c.min)}"`) : ''} ${req} autocomplete="off">`;
            }
            return html`<div class="campo"><label for="${id}">${c.rotulo}${c.obrigatorio ? html` <span class="fraco">*</span>` : ''}</label>${controle}${ajuda}</div>`;
        };
        const dialogo = criarDialogo({
            titulo, icone, tamanho,
            corpo: html`<div class="pilha">${texto ? html`<p class="sem-margem">${texto}</p>` : ''}${campos.map(campoHtml)}
                <div class="aviso oculto" data-estado="falha" role="alert" data-erro><i class="bi bi-exclamation-octagon"></i><div data-erro-texto></div></div></div>`,
            rodape: html`<button type="button" class="btn btn-fantasma" data-fechar>Cancelar</button>
                <button type="submit" class="btn btn-primaria" data-confirmar>${rotuloConfirmar}</button>`,
        });
        const form = dialogo.querySelector('form');
        const lerValores = () => Object.fromEntries(campos.map((c) => {
            const el = form.querySelector(`#${prefixo}-${c.nome}`);
            if (c.tipo === 'caixa') return [c.nome, el.checked];
            if (c.tipo === 'numero') return [c.nome, el.value === '' ? null : Number(el.value)];
            return [c.nome, el.value.trim()];
        }));
        let resultado = null;
        form.addEventListener('submit', async (ev) => {
            ev.preventDefault();
            const faltando = campos.find((c) => c.obrigatorio && c.tipo !== 'caixa' && !form.querySelector(`#${prefixo}-${c.nome}`).value.trim());
            const caixaErro = form.querySelector('[data-erro]');
            if (faltando) {
                caixaErro.classList.remove('oculto');
                caixaErro.querySelector('[data-erro-texto]').textContent = `Preencha "${faltando.rotulo}".`;
                form.querySelector(`#${prefixo}-${faltando.nome}`).focus();
                return;
            }
            const valores = lerValores();
            const botao = form.querySelector('[data-confirmar]');
            if (enviar) {
                botao.disabled = true;
                try {
                    await enviar(valores);
                } catch (erro) {
                    caixaErro.classList.remove('oculto');
                    caixaErro.querySelector('[data-erro-texto]').textContent = erro.message || 'Não deu certo.';
                    botao.disabled = false;
                    return;
                }
            }
            resultado = valores;
            dialogo.fechar('ok');
        });
        dialogo.aoFechar(() => resolver(resultado));
        dialogo.showModal();
        form.querySelector('input:not([type=checkbox]), select, textarea')?.focus();
    });
}

/** Diálogo só de leitura com conteúdo livre (detalhes, logs). */
export function mostrar({ titulo, icone = 'info-circle', corpo, tamanho = 'grande', acoes = null }) {
    const dialogo = criarDialogo({
        titulo, icone, tamanho, corpo,
        rodape: html`${acoes || ''}<button type="button" class="btn btn-primaria" data-fechar>Fechar</button>`,
    });
    dialogo.showModal();
    return dialogo;
}

// ---------------------------------------------------------------------------
// Área de transferência (a Central roda em HTTP: navigator.clipboard pode
// não existir fora do localhost)
// ---------------------------------------------------------------------------
export async function copiar(texto) {
    if (navigator.clipboard && window.isSecureContext) {
        try { await navigator.clipboard.writeText(texto); return true; } catch (e) { /* segue */ }
    }
    const area = document.createElement('textarea');
    area.value = texto;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    area.remove();
    return ok;
}

// Comportamento da casca do app, carregado em todas as páginas:
// menu em gaveta no celular, alternador de tema, botão Sair.
// O tema escolhido fica no navegador (preferência pessoal, não da Central).

const CHAVE_TEMA = 'central.tema';

function lerTema() {
    try { return localStorage.getItem(CHAVE_TEMA) || 'sistema'; } catch (e) { return 'sistema'; }
}

// data-tema no <html> é sempre o tema EFETIVO ("claro" ou "escuro"): no modo
// automático ("sistema") ele vem de prefers-color-scheme. tokens.css só tem o
// bloco [data-tema="escuro"], então quem resolve o automático é o JS (aqui e
// no script do <head> dos layouts, que roda antes de pintar).
export function aplicarTema(tema) {
    const efetivo = tema === 'claro' || tema === 'escuro'
        ? tema
        : (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'escuro' : 'claro');
    document.documentElement.dataset.tema = efetivo;
    try { localStorage.setItem(CHAVE_TEMA, tema); } catch (e) { /* navegador sem armazenamento: vale só nesta página */ }
    document.dispatchEvent(new CustomEvent('central:tema', { detail: { tema, efetivo } }));
    document.querySelectorAll('[data-tema-botao]').forEach((b) => {
        const icone = b.querySelector('i');
        if (icone) icone.className = `bi bi-${efetivo === 'escuro' ? 'moon-stars' : 'sun'}`;
        b.setAttribute('aria-label', `Tema: ${tema === 'sistema' ? 'automático' : tema}. Clique para trocar.`);
        b.title = `Tema ${tema === 'sistema' ? 'automático (do sistema)' : tema}`;
    });
}

function proximoTema(atual) {
    return { sistema: 'claro', claro: 'escuro', escuro: 'sistema' }[atual] || 'sistema';
}

// Menu lateral: "completo" (ícone + nome) ou "compacto" (só ícones, mais
// espaço para a tela). A escolha fica no navegador; sem escolha, segue a
// largura da tela (estreita = compacto). No celular o menu vira gaveta.
const CHAVE_MENU = 'central.menu';
const TELA_ESTREITA = window.matchMedia('(max-width: 1100px)');
const CELULAR = window.matchMedia('(max-width: 640px)');

function preferenciaDoMenu() {
    try { return localStorage.getItem(CHAVE_MENU); } catch (e) { return null; }
}

function estadoDoMenu() {
    const pref = preferenciaDoMenu();
    if (pref === 'compacto' || pref === 'completo') return pref;
    return TELA_ESTREITA.matches ? 'compacto' : 'completo';
}

function iniciarMenu() {
    const app = document.querySelector('.app');
    if (!app) return;
    const botao = document.querySelector('[data-menu-botao]');
    const fundo = document.querySelector('.fundo-menu');
    const icone = botao?.querySelector('i');

    // Rótulo e ícone do botão dizem o que o clique vai fazer.
    const atualizarBotao = () => {
        if (!botao) return;
        let rotulo;
        if (CELULAR.matches) {
            const aberto = app.dataset.menuAberto === 'true';
            rotulo = aberto ? 'Fechar menu' : 'Abrir menu';
            botao.setAttribute('aria-expanded', String(aberto));
            if (icone) icone.className = `bi bi-${aberto ? 'x-lg' : 'list'}`;
        } else {
            const compacto = document.documentElement.dataset.menu === 'compacto';
            rotulo = compacto ? 'Expandir menu' : 'Recolher menu (só ícones)';
            botao.setAttribute('aria-expanded', String(!compacto));
            if (icone) icone.className = `bi bi-${compacto ? 'layout-sidebar' : 'layout-sidebar-inset'}`;
        }
        botao.setAttribute('aria-label', rotulo);
        botao.title = CELULAR.matches ? rotulo : `${rotulo} — atalho: tecla [`;
    };

    const aplicarModo = (modo) => {
        document.documentElement.dataset.menu = modo;
        atualizarBotao();
    };

    const alternarGaveta = (aberto) => {
        app.dataset.menuAberto = String(aberto);
        atualizarBotao();
        if (aberto) document.querySelector('.app-menu a, .app-menu button')?.focus();
    };

    const alternarModo = () => {
        const novo = document.documentElement.dataset.menu === 'compacto' ? 'completo' : 'compacto';
        try { localStorage.setItem(CHAVE_MENU, novo); } catch (e) { /* vale só nesta página */ }
        aplicarModo(novo);
    };

    botao?.addEventListener('click', () => {
        if (CELULAR.matches) alternarGaveta(app.dataset.menuAberto !== 'true');
        else alternarModo();
    });
    fundo?.addEventListener('click', () => alternarGaveta(false));
    document.addEventListener('keydown', (ev) => {
        if (ev.key === 'Escape' && app.dataset.menuAberto === 'true') { alternarGaveta(false); botao?.focus(); return; }
        // Atalho "[": recolhe/expande, fora de campos de texto.
        const alvo = ev.target;
        const digitando = alvo.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(alvo.tagName);
        if (ev.key === '[' && !digitando && !ev.ctrlKey && !ev.metaKey && !ev.altKey && !CELULAR.matches) {
            ev.preventDefault();
            alternarModo();
        }
    });
    // Sem escolha da pessoa, o menu acompanha a largura da tela.
    TELA_ESTREITA.addEventListener?.('change', () => aplicarModo(estadoDoMenu()));
    CELULAR.addEventListener?.('change', () => { app.dataset.menuAberto = 'false'; atualizarBotao(); });

    aplicarModo(estadoDoMenu());
}

function iniciarSair() {
    document.querySelectorAll('[data-sair]').forEach((b) => b.addEventListener('click', async () => {
        try { await fetch('/auth/logout', { method: 'POST' }); } catch (e) { /* segue para o login mesmo assim */ }
        window.location.href = '/login';
    }));
}

aplicarTema(lerTema());
document.querySelectorAll('[data-tema-botao]').forEach((b) => b.addEventListener('click', () => aplicarTema(proximoTema(lerTema()))));
window.matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => aplicarTema(lerTema()));
iniciarMenu();
iniciarSair();

// Ícone de copiar ao lado de "Painel ao vivo" (Hoje) e "Quadro ao vivo" (Em
// construção): copia o endereço da tela sem login.
document.querySelectorAll('[data-copiar-link]').forEach((b) => b.addEventListener('click', async () => {
    const { copiar, toast } = await import('./ui.js');
    const link = b.dataset.copiarLink;
    if (await copiar(link)) toast(`Link copiado: ${link}`);
    else toast(`Não deu para copiar. Copie à mão: ${link}`, { estado: 'atencao', duracao: 12000 });
}));

// Admin: textos da história (data-texto) editáveis ali mesmo.
if (window.CENTRAL?.admin && document.querySelector('[data-texto]')) {
    import('./textos.js').then((m) => m.ativarEdicao());
}

// Som e notificação do Windows quando surge um alerta novo (sininho no topo).
if (document.querySelector('[data-avisos-botao]')) {
    import('./avisos.js').then((m) => m.iniciarAvisos());
}

// Peças comuns dos gráficos (Chart.js) da Central: Jornada e Painel ao vivo.
// As cores vêm dos tokens do tema (tokens.css), lidas na hora de desenhar.
//
// "Deu certo" x "Falhou": o verde e o vermelho têm a mesma luminosidade
// (1,05:1 no tema claro), então quem tem daltonismo não separa as duas
// barras só pela cor. A barra de falha leva HACHURA (listras diagonais) e um
// respiro entre os segmentos — a cor reforça, o desenho informa.

export function corDoTema(variavel) {
    return getComputedStyle(document.documentElement).getPropertyValue(variavel).trim();
}

const hachuras = new Map();

// Listras diagonais claras sobre a cor de falha (padrão do canvas, 8x8 px).
export function hachura(cor) {
    const fundo = corDoTema('--superficie');
    const chave = `${cor}|${fundo}`;
    if (hachuras.has(chave)) return hachuras.get(chave);
    const tela = document.createElement('canvas');
    tela.width = 8;
    tela.height = 8;
    const ctx = tela.getContext('2d');
    ctx.fillStyle = cor;
    ctx.fillRect(0, 0, 8, 8);
    ctx.strokeStyle = fundo;
    ctx.lineWidth = 2;
    ctx.beginPath();
    // Diagonal "/" e os dois cantos, para a listra continuar entre os ladrilhos.
    ctx.moveTo(0, 8); ctx.lineTo(8, 0);
    ctx.moveTo(-2, 2); ctx.lineTo(2, -2);
    ctx.moveTo(6, 10); ctx.lineTo(10, 6);
    ctx.stroke();
    const padrao = ctx.createPattern(tela, 'repeat');
    hachuras.set(chave, padrao);
    return padrao;
}

// Os dois conjuntos de barras empilhadas: sucesso (cheio) e falha (hachurado).
// A borda na cor da superfície abre um respiro de 2 px entre os segmentos.
export function barrasSucessoFalha(sucessos, falhas) {
    const superficie = corDoTema('--superficie');
    const comum = { borderRadius: 4, stack: 's', borderColor: superficie, borderWidth: { top: 2 }, borderSkipped: 'bottom' };
    return [
        { label: 'Deu certo', data: sucessos, backgroundColor: corDoTema('--ok'), ...comum },
        { label: 'Falhou', data: falhas, backgroundColor: hachura(corDoTema('--falha')), ...comum },
    ];
}

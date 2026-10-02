// Formatação para a tela. O banco grava em UTC SEM fuso ("2026-09-29T14:02:11");
// toda data que vem da API passa por `paraData`, que a trata como UTC.

const LOCALE = 'pt-BR';

export function paraData(valor) {
    if (!valor) return null;
    if (valor instanceof Date) return valor;
    const texto = String(valor);
    const temFuso = /[zZ]$|[+-]\d{2}:?\d{2}$/.test(texto);
    const data = new Date(temFuso ? texto : `${texto}Z`);
    return Number.isNaN(data.getTime()) ? null : data;
}

export function dataHora(valor) {
    const d = paraData(valor);
    if (!d) return '—';
    return d.toLocaleString(LOCALE, { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function dataCurta(valor) {
    const d = paraData(valor);
    if (!d) return '—';
    return d.toLocaleDateString(LOCALE, { day: '2-digit', month: '2-digit' });
}

export function hora(valor) {
    const d = paraData(valor);
    if (!d) return '—';
    return d.toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit' });
}

/** "hoje às 09:15", "ontem às 23:45", "28/09 às 10:00". */
export function quando(valor) {
    const d = paraData(valor);
    if (!d) return '—';
    const hoje = new Date();
    const ontem = new Date(hoje);
    ontem.setDate(hoje.getDate() - 1);
    const mesmoDia = (a, b) => a.toDateString() === b.toDateString();
    if (mesmoDia(d, hoje)) return `hoje às ${hora(d)}`;
    if (mesmoDia(d, ontem)) return `ontem às ${hora(d)}`;
    return `${dataCurta(d)} às ${hora(d)}`;
}

/** "há 3 min", "há 2 h", "há 4 dias", "em 20 min". */
export function relativo(valor) {
    const d = paraData(valor);
    if (!d) return '—';
    const segundos = Math.round((d.getTime() - Date.now()) / 1000);
    const abs = Math.abs(segundos);
    const rtf = new Intl.RelativeTimeFormat(LOCALE, { numeric: 'auto', style: 'short' });
    if (abs < 45) return 'agora';
    if (abs < 3600) return rtf.format(Math.round(segundos / 60), 'minute');
    if (abs < 86400) return rtf.format(Math.round(segundos / 3600), 'hour');
    return rtf.format(Math.round(segundos / 86400), 'day');
}

export function duracao(segundos) {
    if (segundos === null || segundos === undefined || Number.isNaN(Number(segundos))) return '—';
    const s = Math.max(0, Math.round(Number(segundos)));
    if (s < 60) return `${s} s`;
    const min = Math.floor(s / 60);
    if (min < 60) return `${min} min${s % 60 ? ` ${s % 60} s` : ''}`;
    const h = Math.floor(min / 60);
    return `${h} h${min % 60 ? ` ${min % 60} min` : ''}`;
}

export function numero(valor) {
    if (valor === null || valor === undefined) return '—';
    return Number(valor).toLocaleString(LOCALE);
}

/** 0.873 → "87%" (aceita fração 0–1). */
export function percentual(fracao, casas = 0) {
    if (fracao === null || fracao === undefined) return '—';
    return `${(Number(fracao) * 100).toLocaleString(LOCALE, { maximumFractionDigits: casas })}%`;
}

export function plural(n, singular, pluralTexto) {
    return `${numero(n)} ${n === 1 ? singular : (pluralTexto || `${singular}s`)}`;
}

/** Saudação pelo horário local. */
export function saudacao(data = new Date()) {
    const h = data.getHours();
    if (h < 5) return 'Boa madrugada';
    if (h < 12) return 'Bom dia';
    if (h < 18) return 'Boa tarde';
    return 'Boa noite';
}

export function hojePorExtenso(data = new Date()) {
    const texto = data.toLocaleDateString(LOCALE, { weekday: 'long', day: 'numeric', month: 'long' });
    return texto.charAt(0).toUpperCase() + texto.slice(1);
}

// =========================================================
//  BETHEL NOTICIAS
// =========================================================

// ===== 1. Fecha de hoy (hora de Chile) =====
const textoHoy = new Intl.DateTimeFormat('es-CL', {
    timeZone: 'America/Santiago', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
}).format(new Date());
document.getElementById('n-hoy').textContent = 'Edición del ' + textoHoy;

// ===== 2. Modo claro / oscuro (el mismo que la página de la iglesia) =====
document.querySelector('.n-tema').addEventListener('click', () => {
    const raiz = document.documentElement;
    const oscuro = raiz.dataset.theme
        ? raiz.dataset.theme === 'dark'
        : matchMedia('(prefers-color-scheme: dark)').matches;
    raiz.dataset.theme = oscuro ? 'light' : 'dark';
    try { localStorage.setItem('tema', raiz.dataset.theme); } catch (e) {}
});

// ===== 3. Botón "volver arriba" =====
const botonArriba = document.querySelector('.n-arriba');
window.addEventListener('scroll', () => {
    botonArriba.classList.toggle('mostrar', window.scrollY > 600);
});
botonArriba.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));

// ===== 4. Noticias =====
const API = document.body.dataset.api;
const COLORES = {
    'Iglesia': '#c9a24d',
    'Profecía': '#c2412d',
    'Israel': '#2f6fd6',
    'Mundo': '#2e8b57',
    'Chile': '#7d4cc9',
};
const POR_PAGINA = 9;
const REVISAR_CADA = 2 * 60 * 1000;      // revisa si hay noticias nuevas cada 2 minutos
const HORAS_NUEVO = 3;                   // la etiqueta "Nuevo" dura 3 horas

const cajaDestacadas = document.getElementById('n-destacadas');
const grilla = document.getElementById('n-grilla');
const botonMas = document.getElementById('n-mas');
const vacio = document.getElementById('n-vacio');
const vacioTexto = document.getElementById('n-vacio-texto');
const tituloLista = document.getElementById('n-titulo-lista');
const buscador = document.getElementById('n-buscar');
const cajaCategorias = document.getElementById('n-categorias');
const avisoNuevas = document.getElementById('n-nuevas');
const textoActualizado = document.getElementById('n-actualizado-texto');

let todas = [];
let pendientes = null;       // noticias nuevas que esperan que la persona las vea
let categoria = '';
let busqueda = '';
let cuantas = POR_PAGINA;
let ultimaRevision = 0;
const yaVistas = new Set();

// --- Pequeñas ayudas ---
function crear(etiqueta, clase, texto) {
    const el = document.createElement(etiqueta);
    if (clase) el.className = clase;
    if (texto) el.textContent = texto;
    return el;
}

function icono(id) {
    return document.getElementById(id).content.firstElementChild.cloneNode(true);
}

// Día de la noticia en Chile: "Hoy", "Ayer" o la fecha
const formatoDia = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' });
const relativo = new Intl.RelativeTimeFormat('es', { numeric: 'auto' });
function haceCuanto(segundos) {
    const minutos = Math.round((segundos * 1000 - Date.now()) / 60000);
    if (minutos > -1) return 'Ahora';
    if (minutos > -60) return relativo.format(minutos, 'minute');
    if (minutos > -1440) return relativo.format(Math.round(minutos / 60), 'hour');
    // Más de un día: se cuenta por días del calendario de Chile (ayer, hace 2 días...)
    const dias = Math.round((Date.parse(formatoDia.format(new Date())) -
                             Date.parse(formatoDia.format(new Date(segundos * 1000)))) / 86400000);
    if (dias <= 1) return 'ayer';
    if (dias < 7) return `hace ${dias} días`;
    return new Intl.DateTimeFormat('es-CL', { day: 'numeric', month: 'short' }).format(new Date(segundos * 1000));
}

function diaDe(segundos) {
    const dia = formatoDia.format(new Date(segundos * 1000));
    const hoy = formatoDia.format(new Date());
    const ayer = formatoDia.format(new Date(Date.now() - 86400000));
    if (dia === hoy) return 'Hoy';
    if (dia === ayer) return 'Ayer';
    const texto = new Intl.DateTimeFormat('es-CL', { timeZone: 'America/Santiago', weekday: 'long', day: 'numeric', month: 'long' })
        .format(new Date(segundos * 1000));
    return texto.charAt(0).toUpperCase() + texto.slice(1);
}

function esNueva(noticia) {
    return Date.now() / 1000 - noticia.fecha < HORAS_NUEVO * 3600;
}

function sinTildes(texto) {
    return texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

// La sección Profecía también muestra las "señales de los tiempos" de las otras secciones
function enSeccion(noticia, cat) {
    return noticia.categoria === cat || (cat === 'Profecía' && noticia.senal);
}

function color(cat) {
    return COLORES[cat] || '#c9a24d';
}

// --- Piezas de cada noticia ---
function chip(noticia) {
    const c = crear('span', 'n-chip', noticia.categoria);
    c.style.setProperty('--cat', color(noticia.categoria));
    return c;
}

function etiquetas(noticia) {
    const fila = crear('div', 'n-etiquetas');
    fila.append(chip(noticia));
    if (categoria === 'Profecía' && noticia.senal) fila.append(crear('span', 'n-senal', 'Señal de los tiempos'));
    if (esNueva(noticia)) fila.append(crear('span', 'n-nuevo', 'Nuevo'));
    return fila;
}

function meta(noticia) {
    const m = crear('p', 'n-meta');
    const tiempo = crear('span', 'n-tiempo', haceCuanto(noticia.fecha));
    tiempo.dataset.fecha = noticia.fecha;
    m.append(crear('strong', '', noticia.fuente), crear('span', '', '·'), icono('ico-reloj'), tiempo);
    return m;
}

function enlace(noticia, clase) {
    const a = crear('a', clase);
    a.href = noticia.enlace;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.style.setProperty('--cat', color(noticia.categoria));
    return a;
}

// Foto real de la noticia (si no carga, la tarjeta queda solo con texto)
function foto(noticia, alFallar) {
    const marco = crear('div', 'n-foto');
    const img = crear('img');
    img.src = noticia.imagen;
    img.alt = noticia.titulo;
    img.loading = 'lazy';
    img.decoding = 'async';
    img.referrerPolicy = 'no-referrer';
    img.addEventListener('load', () => {
        // Imágenes muy chicas (íconos o logos) no sirven como foto de noticia
        if (img.naturalWidth < 200) alFallar();
        else marco.classList.add('cargada');
    }, { once: true });
    img.addEventListener('error', alFallar, { once: true });
    marco.append(img);
    return marco;
}

// --- Tarjeta normal ---
function tarjeta(noticia) {
    const a = enlace(noticia, 'n-tarjeta');
    const texto = crear('div', 'n-tarjeta-texto');
    texto.append(etiquetas(noticia), crear('h3', '', noticia.titulo));
    if (noticia.resumen) texto.append(crear('p', 'n-resumen', noticia.resumen));
    const pie = crear('div', 'n-tarjeta-pie');
    const leer = crear('span', 'n-leer');
    leer.title = 'Leer la nota completa';
    leer.append(icono('ico-abrir'));
    pie.append(meta(noticia), leer);
    texto.append(pie);

    if (noticia.imagen) {
        const f = foto(noticia, () => { f.remove(); a.classList.add('solo-texto'); });
        a.append(f);
    } else {
        a.classList.add('solo-texto');
    }
    a.append(texto);
    return a;
}

// --- Noticia destacada (siempre con foto) ---
function destacada(noticia, grande) {
    const a = enlace(noticia, 'n-dest' + (grande ? ' n-dest-grande' : ''));
    const f = foto(noticia, () => f.remove());
    const texto = crear('div', 'n-dest-texto');
    texto.append(etiquetas(noticia), crear(grande ? 'h2' : 'h3', '', noticia.titulo));
    if (grande && noticia.resumen) texto.append(crear('p', 'n-resumen', noticia.resumen));
    texto.append(meta(noticia));
    a.append(f, texto);
    return a;
}

// --- Dibuja todo según la categoría y la búsqueda ---
function filtradas() {
    const palabras = sinTildes(busqueda.trim());
    return todas.filter(n =>
        (!categoria || enSeccion(n, categoria)) &&
        (!palabras || sinTildes(n.titulo + ' ' + n.resumen + ' ' + n.fuente).includes(palabras)));
}

function dibujar() {
    const lista = filtradas();
    const buscando = busqueda.trim() !== '';

    // Destacadas: las más recientes que tienen foto
    let resto = lista;
    const conFoto = lista.filter(n => n.imagen).slice(0, 4);
    cajaDestacadas.replaceChildren();
    cajaDestacadas.hidden = buscando || conFoto.length < 3;
    cajaDestacadas.dataset.cantidad = conFoto.length;
    if (!cajaDestacadas.hidden) {
        conFoto.forEach((n, i) => cajaDestacadas.append(destacada(n, i === 0)));
        resto = lista.filter(n => !conFoto.includes(n));
    }

    tituloLista.textContent = buscando
        ? `Resultados para “${busqueda.trim()}”`
        : categoria === 'Profecía' ? 'Profecía y señales de los tiempos'
        : categoria || 'Últimas noticias';

    // Lista separada por día: Hoy, Ayer, ...
    const piezas = [];
    let diaAnterior = '';
    resto.slice(0, cuantas).forEach(n => {
        const dia = diaDe(n.fecha);
        if (dia !== diaAnterior && !buscando) {
            const separador = crear('div', 'n-dia');
            separador.append(crear('span', '', dia));
            piezas.push(separador);
            diaAnterior = dia;
        }
        const t = tarjeta(n);
        if (yaVistas.size && !yaVistas.has(n.enlace)) t.classList.add('recien-llegada');
        piezas.push(t);
    });
    grilla.replaceChildren(...piezas);
    lista.forEach(n => yaVistas.add(n.enlace));
    botonMas.hidden = resto.length <= cuantas;

    vacio.hidden = lista.length > 0;
    vacioTexto.textContent = buscando
        ? 'No hay noticias que coincidan con tu búsqueda.'
        : 'Por ahora no hay noticias recientes en esta sección. Vuelve más tarde.';
    document.getElementById('n-reintentar').hidden = true;

    cajaCategorias.querySelectorAll('button').forEach(b =>
        b.classList.toggle('activa', b.dataset.cat === categoria));
}

function elegirCategoria(cat) {
    categoria = cat;
    cuantas = POR_PAGINA;
    dibujar();
    const menu = document.getElementById('n-menu');
    if (window.scrollY > menu.offsetTop) window.scrollTo({ top: menu.offsetTop, behavior: 'smooth' });
}

// --- Partes fijas: cinta, más recientes y secciones ---
function dibujarExtras(categorias) {
    // Botones del menú
    cajaCategorias.replaceChildren();
    ['', ...categorias].forEach(cat => {
        const b = crear('button', cat === categoria ? 'activa' : '', cat || 'Portada');
        b.type = 'button';
        b.dataset.cat = cat;
        if (cat) b.style.setProperty('--cat', color(cat));
        b.addEventListener('click', () => elegirCategoria(cat));
        cajaCategorias.append(b);
    });

    // Cinta de último minuto (se repite para que no se corte)
    const cinta = document.getElementById('n-cinta');
    const titulares = todas.slice(0, 12).map(n => {
        const a = enlace(n, 'n-cinta-item');
        a.append(crear('span', 'n-cinta-cat', n.categoria), document.createTextNode(n.titulo));
        return a;
    });
    cinta.replaceChildren(...titulares, ...titulares.map(a => a.cloneNode(true)));
    cinta.style.animationDuration = Math.max(titulares.length * 7, 30) + 's';

    // Lo más reciente
    document.getElementById('n-recientes').replaceChildren(...todas.slice(0, 6).map(n => {
        const li = crear('li');
        const a = enlace(n, '');
        a.append(crear('span', 'n-reciente-titulo', n.titulo), meta(n));
        li.append(a);
        return li;
    }));

    // Secciones con su cantidad de noticias
    document.getElementById('n-lista-categorias').replaceChildren(...categorias.map(cat => {
        const li = crear('li');
        const b = crear('button');
        b.type = 'button';
        b.style.setProperty('--cat', color(cat));
        b.append(crear('span', 'n-cat-punto'), crear('span', '', cat),
                                  crear('strong', '', String(todas.filter(n => enSeccion(n, cat)).length)));
        b.addEventListener('click', () => elegirCategoria(cat));
        li.append(b);
        return li;
    }));
}

// --- Muestra las noticias recibidas ---
function mostrar(datos) {
    todas = datos.noticias || [];
    pendientes = null;
    avisoNuevas.classList.remove('visible');
    dibujarExtras(datos.categorias || []);
    dibujar();
}

// --- Pide las noticias al servidor ---
async function cargar(primeraVez) {
    try {
        const respuesta = await fetch(API, { cache: 'no-store' });
        const datos = await respuesta.json();
        ultimaRevision = datos.actualizado || Date.now() / 1000;
        actualizarHora();
        const lista = datos.noticias || [];
        if (!lista.length) throw new Error('sin noticias');

        if (primeraVez || !todas.length) {
            mostrar(datos);
            return;
        }
        // ¿Llegaron noticias nuevas?
        const conocidas = new Set(todas.map(n => n.enlace));
        const nuevas = lista.filter(n => !conocidas.has(n.enlace)).length;
        if (!nuevas) return;
        const leyendo = window.scrollY > 400 || busqueda.trim() !== '';
        if (leyendo) {
            pendientes = datos;
            avisoNuevas.querySelector('span').textContent =
                nuevas === 1 ? '1 noticia nueva' : `${nuevas} noticias nuevas`;
            avisoNuevas.classList.add('visible');
        } else {
            mostrar(datos);
        }
    } catch (e) {
        if (todas.length) return;          // si ya había noticias, se quedan
        cajaDestacadas.hidden = true;
        grilla.replaceChildren();
        vacio.hidden = false;
        vacioTexto.textContent = 'No pudimos cargar las noticias en este momento.';
        document.getElementById('n-reintentar').hidden = false;
    }
}

// --- "Actualizado hace X" y los tiempos de cada noticia ---
function actualizarHora() {
    if (ultimaRevision) textoActualizado.textContent = 'Actualizado ' + haceCuanto(ultimaRevision).toLowerCase();
    document.querySelectorAll('.n-tiempo').forEach(t => { t.textContent = haceCuanto(Number(t.dataset.fecha)); });
}

avisoNuevas.addEventListener('click', () => {
    if (pendientes) mostrar(pendientes);
    window.scrollTo({ top: 0, behavior: 'smooth' });
});

botonMas.addEventListener('click', () => {
    cuantas += POR_PAGINA;
    dibujar();
});

let espera;
buscador.addEventListener('input', () => {
    clearTimeout(espera);
    espera = setTimeout(() => {
        busqueda = buscador.value;
        cuantas = POR_PAGINA;
        dibujar();
    }, 200);
});

document.getElementById('n-reintentar').addEventListener('click', () => {
    vacio.hidden = true;
    cargar(true);
});

cargar(true);
setInterval(() => cargar(false), REVISAR_CADA);
setInterval(actualizarHora, 60 * 1000);

// Si la persona vuelve a la pestaña después de un rato, revisa enseguida
document.addEventListener('visibilitychange', () => {
    if (!document.hidden) cargar(false);
});
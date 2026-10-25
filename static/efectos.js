// =========================================================
//  Utilidades
// =========================================================
const limitar = (valor, min = 0, max = 1) => Math.min(Math.max(valor, min), max);
const sinMovimiento = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// ===== 1. Modo claro / oscuro =====
const raiz = document.documentElement;
const botonTema = document.querySelector('.boton-tema');

function temaActual() {
    if (raiz.dataset.theme) return raiz.dataset.theme;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

botonTema.addEventListener('click', () => {
    const nuevo = temaActual() === 'dark' ? 'light' : 'dark';
    raiz.dataset.theme = nuevo;
    try { localStorage.setItem('tema', nuevo); } catch (e) {}
});

// ===== 2. Menú para celular =====
const abrirMenu = () => document.body.classList.add('menu-abierto');
const cerrarMenu = () => document.body.classList.remove('menu-abierto');

document.querySelector('.hamburguesa').addEventListener('click', abrirMenu);
document.querySelector('.cerrar-panel').addEventListener('click', cerrarMenu);
document.querySelector('.fondo-panel').addEventListener('click', cerrarMenu);

// ===== 3. Desplazamiento suave con inercia (rueda del mouse) =====
const ruedaSuave = {
    activo: window.matchMedia('(pointer: fine)').matches && !sinMovimiento,
    destino: window.scrollY,
    actual: window.scrollY,
    animando: false,
};

function maxScroll() {
    return document.documentElement.scrollHeight - window.innerHeight;
}

function pasoRueda() {
    ruedaSuave.actual += (ruedaSuave.destino - ruedaSuave.actual) * 0.1;
    if (Math.abs(ruedaSuave.destino - ruedaSuave.actual) < 0.5) {
        ruedaSuave.actual = ruedaSuave.destino;
        ruedaSuave.animando = false;
    }
    window.scrollTo({ top: ruedaSuave.actual, behavior: 'instant' });
    if (ruedaSuave.animando) requestAnimationFrame(pasoRueda);
}

if (ruedaSuave.activo) {
    window.addEventListener('wheel', e => {
        if (e.ctrlKey || document.body.classList.contains('menu-abierto') ||
            document.querySelector('.visor.abierto')) return;
        e.preventDefault();
        if (!ruedaSuave.animando) ruedaSuave.destino = ruedaSuave.actual = window.scrollY;
        const factor = e.deltaMode === 1 ? 40 : 1;
        ruedaSuave.destino = limitar(ruedaSuave.destino + e.deltaY * factor, 0, maxScroll());
        if (!ruedaSuave.animando) {
            ruedaSuave.animando = true;
            requestAnimationFrame(pasoRueda);
        }
    }, { passive: false });
}

// ===== 4. Ir a una sección al hacer clic en el menú =====
const navbar = document.querySelector('.navbar');

// Cortina para saltar directo a secciones lejanas (sin recorrer toda la página)
const cortinaSalto = document.createElement('div');
cortinaSalto.className = 'cortina-salto';
document.body.appendChild(cortinaSalto);

function animarScroll(destinoY) {
    ruedaSuave.animando = false;
    const inicio = window.scrollY;
    const distancia = destinoY - inicio;

    // Si la sección está lejos: se oscurece, salta directo y vuelve a aparecer
    if (Math.abs(distancia) > window.innerHeight * 1.2) {
        cortinaSalto.classList.add('activa');
        setTimeout(() => {
            window.scrollTo({ top: destinoY, behavior: 'instant' });
            ruedaSuave.destino = ruedaSuave.actual = destinoY;
            requestAnimationFrame(() => cortinaSalto.classList.remove('activa'));
        }, 280);
        return;
    }

    // Si está cerca: desplazamiento suave
    const duracion = 700;
    let tiempoInicio = null;

    function paso(tiempo) {
        if (!tiempoInicio) tiempoInicio = tiempo;
        const p = Math.min((tiempo - tiempoInicio) / duracion, 1);
        const suave = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
        window.scrollTo({ top: inicio + distancia * suave, behavior: 'instant' });
        if (p < 1) requestAnimationFrame(paso);
    }
    requestAnimationFrame(paso);
}

document.querySelectorAll('a[href^="#"]').forEach(enlace => {
    enlace.addEventListener('click', e => {
        const destino = document.querySelector(enlace.getAttribute('href'));
        if (!destino) return;
        e.preventDefault();
        cerrarMenu();
        if (document.activeElement) document.activeElement.blur();
        const y = destino.getBoundingClientRect().top + window.scrollY - navbar.offsetHeight;
        animarScroll(Math.max(y, 0));
    });
});

// ===== 5. Los elementos aparecen suavemente al bajar =====
const elementos = document.querySelectorAll(
    '.seccion .etiqueta, .versiculo-dia blockquote, .tarjeta, ' +
    '.historia-texto, .historia-img, .pastor-tarjeta, .mensaje-pastores, .min-fila, ' +
    '.radio-img, .radio-contenido, .culto, .galeria img, .seccion-intro, .min-cabecera > p'
);

elementos.forEach(el => {
    el.classList.add('revelar');
    if (el.matches('.tarjeta, .pastor-tarjeta, .culto, .galeria img')) {
        const posicion = [...el.parentElement.children].indexOf(el) % 3;
        el.style.transitionDelay = (posicion * 0.15) + 's';
    }
});

const observador = new IntersectionObserver(entradas => {
    entradas.forEach(entrada => {
        if (!entrada.isIntersecting) return;
        const el = entrada.target;
        el.classList.add('visible');
        observador.unobserve(el);
        el.addEventListener('transitionend', () => {
            el.classList.remove('revelar', 'visible');
            el.style.transitionDelay = '';
        }, { once: true });
    });
}, { threshold: 0.12 });

elementos.forEach(el => observador.observe(el));

// ===== 6. Títulos que suben palabra por palabra =====
const titulos = document.querySelectorAll('.seccion h2, .expandir-texto h2');

titulos.forEach(titulo => {
    const palabras = titulo.textContent.trim().split(/\s+/);
    titulo.textContent = '';
    palabras.forEach((texto, i) => {
        const mascara = document.createElement('span');
        mascara.className = 'palabra';
        const interior = document.createElement('span');
        interior.textContent = texto;
        interior.style.transitionDelay = (i * 0.08) + 's';
        mascara.appendChild(interior);
        titulo.appendChild(mascara);
        if (i < palabras.length - 1) titulo.appendChild(document.createTextNode(' '));
    });
});

const observadorTitulos = new IntersectionObserver(entradas => {
    entradas.forEach(entrada => {
        if (!entrada.isIntersecting) return;
        entrada.target.classList.add('titulo-visible');
        observadorTitulos.unobserve(entrada.target);
    });
}, { threshold: 0.3 });

titulos.forEach(t => observadorTitulos.observe(t));

// ===== 7. Movimientos controlados por el scroll =====
const heroScroll = document.querySelector('.hero-scroll');
const expandir = document.querySelector('.expandir');
const filasMinisterio = document.querySelectorAll('.min-fila');
const pieGigante = document.querySelector('.pie-gigante');
const botonArriba = document.querySelector('.arriba');

function progresoDe(seccion) {
    const caja = seccion.getBoundingClientRect();
    const recorrido = seccion.offsetHeight - window.innerHeight;
    return limitar(-caja.top / recorrido);
}

function actualizarPortada() {
    if (!heroScroll) return;
    const p = progresoDe(heroScroll);
    const salida1 = limitar(p / 0.3);                  // la bienvenida se va
    const entrada2 = limitar((p - 0.3) / 0.25);        // aparece BETHEL
    const salida2 = 1 - limitar((p - 0.85) / 0.15);    // BETHEL se despide
    heroScroll.style.setProperty('--zoom', 1 + p * 0.35);
    heroScroll.style.setProperty('--f1', 1 - salida1);
    heroScroll.style.setProperty('--f1y', (-80 * salida1) + 'px');
    heroScroll.style.setProperty('--f2', Math.min(entrada2, salida2));
    heroScroll.style.setProperty('--f2s', 0.85 + 0.15 * entrada2);
    heroScroll.style.setProperty('--bgx', (30 + p * 40) + '%');
}

function actualizarExpandir() {
    if (!expandir) return;
    const p = progresoDe(expandir);
    const abre = limitar(p / 0.6);
    expandir.style.setProperty('--ins', (14 * (1 - abre)) + '%');
    expandir.style.setProperty('--rad', (28 * (1 - abre)) + 'px');
    expandir.style.setProperty('--esc', 1.25 - 0.25 * abre);
    expandir.style.setProperty('--txt', limitar((p - 0.5) / 0.3));
}

function actualizarMinisterios() {
    const centro = window.innerHeight / 2;
    let masCercana = null;
    let distancia = Infinity;
    filasMinisterio.forEach(fila => {
        const caja = fila.getBoundingClientRect();
        const d = Math.abs(caja.top + caja.height / 2 - centro);
        if (d < distancia) { distancia = d; masCercana = fila; }
    });
    filasMinisterio.forEach(fila => {
        fila.classList.toggle('activa', fila === masCercana && distancia < window.innerHeight * 0.35);
    });
}

function actualizarPie() {
    if (!pieGigante) return;
    const caja = pieGigante.getBoundingClientRect();
    const visible = limitar((window.innerHeight - caja.top) / caja.height);
    pieGigante.style.setProperty('--pie', (30 * (1 - visible)) + '%');
}

let pendiente = false;
function alHacerScroll() {
    if (pendiente) return;
    pendiente = true;
    requestAnimationFrame(() => {
        pendiente = false;
        navbar.classList.toggle('scrolled', window.scrollY > 50);
        botonArriba.classList.toggle('mostrar', window.scrollY > 500);
        actualizarPortada();
        actualizarExpandir();
        actualizarMinisterios();
        actualizarPie();
    });
}

window.addEventListener('scroll', alHacerScroll, { passive: true });
window.addEventListener('resize', alHacerScroll);
alHacerScroll();

botonArriba.addEventListener('click', () => animarScroll(0));

// Al pasar el mouse por un ministerio, también se ilumina
filasMinisterio.forEach(fila => {
    fila.addEventListener('mouseenter', () => {
        filasMinisterio.forEach(f => f.classList.toggle('activa', f === fila));
    });
});

// ===== 8. Marca en el menú la sección donde estás =====
const enlacesMenu = document.querySelectorAll('.menu a');

const espia = new IntersectionObserver(entradas => {
    entradas.forEach(entrada => {
        if (!entrada.isIntersecting) return;
        enlacesMenu.forEach(a => {
            a.classList.toggle('activo', a.getAttribute('href') === '#' + entrada.target.id);
        });
    });
}, { rootMargin: '-45% 0px -50% 0px' });

document.querySelectorAll('section[id]').forEach(s => espia.observe(s));

// ===== 9. Ver fotos de la galería en grande =====
const visor = document.querySelector('.visor');
const visorImg = visor.querySelector('img');

document.querySelectorAll('.galeria img').forEach(img => {
    img.addEventListener('click', () => {
        visorImg.src = img.src;
        visor.classList.add('abierto');
    });
});

visor.addEventListener('click', () => visor.classList.remove('abierto'));
document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
        visor.classList.remove('abierto');
        cerrarMenu();
    }
});

// ===== 10. Radio en vivo =====
const botonVivo = document.querySelector('.boton-vivo');

if (botonVivo) {
    const base = botonVivo.dataset.stream.replace(/\/$/, '');
    const fuentes = [base + '/stream', base + '/;', base];
    const audio = new Audio();
    const textoVivo = botonVivo.querySelector('.texto-vivo');
    let sonando = false;

    async function probarFuentes() {
        for (const fuente of fuentes) {
            try {
                audio.src = fuente;
                await audio.play();
                return true;
            } catch (e) {
                // si esta dirección no funciona, prueba la siguiente
            }
        }
        return false;
    }

    botonVivo.addEventListener('click', async () => {
        if (sonando) {
            audio.pause();
            audio.removeAttribute('src');
            audio.load();
            sonando = false;
            botonVivo.classList.remove('sonando');
            textoVivo.textContent = 'Escúchanos en vivo';
            return;
        }

        textoVivo.textContent = 'Conectando...';
        const funciono = await probarFuentes();

        if (funciono) {
            sonando = true;
            botonVivo.classList.add('sonando');
            textoVivo.textContent = 'Sonando en vivo';
        } else {
            textoVivo.textContent = 'Escúchanos en vivo';
            window.open(botonVivo.dataset.stream, '_blank');
        }
    });
}

// ===== 11. Formulario "Escríbenos" =====
const formulario = document.querySelector('#formulario');

if (formulario) {
    const avisoEnviado = formulario.querySelector('.form-ok');

    function armarMensaje() {
        const datos = new FormData(formulario);
        let texto = 'Hola, soy ' + datos.get('nombre').trim() + '.\n';
        texto += 'Motivo: ' + datos.get('motivo') + '\n\n';
        texto += datos.get('mensaje').trim();
        const correo = datos.get('correo').trim();
        if (correo) texto += '\n\nMi correo: ' + correo;
        return texto;
    }

    // Botón "Enviar por WhatsApp"
    formulario.addEventListener('submit', e => {
        e.preventDefault();
        const url = 'https://wa.me/' + formulario.dataset.whatsapp +
                    '?text=' + encodeURIComponent(armarMensaje());
        window.open(url, '_blank');
        avisoEnviado.classList.add('mostrar');
    });

    // Botón "Enviar por correo"
    document.querySelector('#enviar-correo').addEventListener('click', () => {
        if (!formulario.reportValidity()) return;
        const asunto = formulario.motivo.value + ' - Página web';
        window.location.href = 'mailto:' + formulario.dataset.correo +
                               '?subject=' + encodeURIComponent(asunto) +
                               '&body=' + encodeURIComponent(armarMensaje());
        avisoEnviado.classList.add('mostrar');
    });

    // Aparece suavemente al bajar
    const bloqueEscribenos = document.querySelector('.escribenos');
    bloqueEscribenos.classList.add('revelar');
    observador.observe(bloqueEscribenos);
}

// ===== 12. Subtítulo del mismo ancho que la palabra BETHEL =====
const palabraGigante = document.querySelector('.palabra-gigante');
const subtituloGigante = document.querySelector('.hero-fase2-sub');

function ajustarSubtitulo() {
    if (!palabraGigante || !subtituloGigante) return;
    subtituloGigante.style.fontSize = '';
    const anchoPalabra = palabraGigante.offsetWidth;
    const tamano = parseFloat(getComputedStyle(subtituloGigante).fontSize);
    const espacio = tamano * 0.35;
    const anchoSub = subtituloGigante.offsetWidth - espacio;
    const nuevo = tamano * anchoPalabra / anchoSub;
    subtituloGigante.style.fontSize = Math.max(9, Math.min(nuevo, 44)) + 'px';
}

ajustarSubtitulo();
window.addEventListener('resize', ajustarSubtitulo);
if (document.fonts) document.fonts.ready.then(ajustarSubtitulo);

// ===== 13. Transmisiones en vivo: Facebook + YouTube =====
const tarjetaVivo = document.querySelector('#envivo');

if (tarjetaVivo) {
    const insigniaTexto = tarjetaVivo.querySelector('.envivo-insignia-texto');
    const estadoTexto = document.querySelector('#envivo-estado-texto');
    const avisoMenu = document.querySelector('.pill-vivo');
    const plantillaPlay = document.querySelector('#icono-play');
    const plantillaFacebook = document.querySelector('#icono-facebook');
    const pestanas = tarjetaVivo.querySelectorAll('.vivo-pestana');

    // Lo que sabemos de cada plataforma
    const estado = {
        facebook: { marco: document.querySelector('#marco-facebook'), mostrando: null, enVivo: false, datos: null },
        youtube:  { marco: document.querySelector('#marco-youtube'),  mostrando: null, enVivo: false, datos: null },
    };
    let elegida = 'facebook';      // la que se está mostrando
    let elegidaPorPersona = false; // true si la persona tocó una pestaña

    // --- Piezas que se muestran dentro de la pantalla ---
    function ponerEspera(plataforma, mensaje) {
        const p = estado[plataforma];
        if (p.mostrando === 'espera') return;
        p.mostrando = 'espera';
        const espera = document.createElement('div');
        espera.className = 'envivo-espera';
        const logo = document.createElement('img');
        logo.src = '/static/img/logo.png';
        logo.alt = '';
        const texto = document.createElement('p');
        texto.textContent = mensaje;
        espera.append(logo, texto);
        p.marco.replaceChildren(espera);
    }

    function iframe(src, titulo) {
        const marco = document.createElement('iframe');
        marco.src = src;
        marco.title = titulo;
        marco.allow = 'autoplay; clipboard-write; encrypted-media; picture-in-picture; web-share; fullscreen';
        marco.allowFullscreen = true;
        return marco;
    }

    function ponerFacebook(enlace, autoplay) {
        const p = estado.facebook;
        if (p.mostrando === 'video-' + enlace) return;
        p.mostrando = 'video-' + enlace;
        const src = 'https://www.facebook.com/plugins/video.php?href=' + encodeURIComponent(enlace) +
                    '&show_text=false&autoplay=' + (autoplay ? 'true' : 'false') + '&mute=' + (autoplay ? 'true' : 'false');
        p.marco.replaceChildren(iframe(src, 'Transmisión en Facebook'));
    }

    function ponerYoutube(id, autoplay) {
        const p = estado.youtube;
        if (p.mostrando === 'video-' + id) return;
        p.mostrando = 'video-' + id;
        const src = 'https://www.youtube.com/embed/' + id + '?autoplay=' + (autoplay ? 1 : 0) + '&mute=1&rel=0&playsinline=1';
        p.marco.replaceChildren(iframe(src, 'Transmisión en YouTube'));
    }

    // Portada de la última transmisión (se reproduce al tocarla)
    function ponerPortada(plataforma, clave, titulo, imagenUrl, alTocar) {
        const p = estado[plataforma];
        if (p.mostrando === 'portada-' + clave) return;
        p.mostrando = 'portada-' + clave;

        const boton = document.createElement('button');
        boton.type = 'button';
        boton.className = 'envivo-portada' + (plataforma === 'facebook' ? ' portada-facebook' : '');

        if (imagenUrl) {
            const imagen = document.createElement('img');
            imagen.src = imagenUrl;
            imagen.alt = '';
            boton.append(imagen);
        } else {
            const fondo = document.createElement('span');
            fondo.className = 'portada-facebook-logo';
            fondo.append(plantillaFacebook.content.cloneNode(true));
            boton.append(fondo);
        }

        const play = document.createElement('span');
        play.className = 'envivo-play';
        play.append(plantillaPlay.content.cloneNode(true));

        const texto = document.createElement('span');
        texto.className = 'envivo-portada-texto';
        const pequeno = document.createElement('small');
        pequeno.textContent = 'Última transmisión';
        const fuerte = document.createElement('strong');
        fuerte.textContent = titulo || (plataforma === 'facebook' ? 'Ver en Facebook' : 'Ver en YouTube');
        texto.append(pequeno, fuerte);

        boton.append(play, texto);
        boton.addEventListener('click', alTocar);
        p.marco.replaceChildren(boton);
    }

    // --- Dibuja cada plataforma según sus datos ---
    function dibujarFacebook() {
        const d = estado.facebook.datos;
        if (!d) return ponerEspera('facebook', 'Conectando...');
        if (d.en_vivo && d.video) ponerFacebook(d.video, true);
        else if (d.ultimo) ponerPortada('facebook', d.ultimo, d.ultimo_titulo, '', () => ponerFacebook(d.ultimo, true));
        else ponerEspera('facebook', 'Volvemos pronto. Revisa nuestros horarios de culto.');
    }

    function dibujarYoutube() {
        const d = estado.youtube.datos;
        if (!d) return ponerEspera('youtube', 'Conectando con YouTube...');
        if (d.en_vivo && d.video) ponerYoutube(d.video, true);
        else if (d.ultimo) ponerPortada('youtube', d.ultimo, d.ultimo_titulo,
                                        'https://i.ytimg.com/vi/' + d.ultimo + '/hqdefault.jpg',
                                        () => ponerYoutube(d.ultimo, true));
        else ponerEspera('youtube', 'Volvemos pronto. Revisa nuestros horarios de culto.');
    }

    // Quita el video de la plataforma que no se ve (así no sigue sonando)
    function vaciar(plataforma) {
        estado[plataforma].mostrando = null;
        estado[plataforma].marco.replaceChildren();
    }

    // --- Muestra la plataforma elegida y actualiza los textos ---
    function mostrar() {
        tarjetaVivo.dataset.plataforma = elegida;
        const otra = elegida === 'facebook' ? 'youtube' : 'facebook';
        vaciar(otra);
        if (elegida === 'facebook') dibujarFacebook(); else dibujarYoutube();

        pestanas.forEach(b => {
            const p = b.dataset.plataforma;
            b.classList.toggle('activa', p === elegida);
            b.setAttribute('aria-selected', p === elegida);
            b.classList.toggle('en-vivo', estado[p].enVivo);
            b.querySelector('.vivo-marca').textContent = estado[p].enVivo ? 'En vivo' : '';
        });

        const algunoEnVivo = estado.facebook.enVivo || estado.youtube.enVivo;
        const actual = estado[elegida];
        tarjetaVivo.classList.toggle('en-directo', actual.enVivo);
        avisoMenu.hidden = !algunoEnVivo;
        insigniaTexto.textContent = actual.enVivo ? 'En vivo' : 'Fuera del aire';

        const nombre = elegida === 'facebook' ? 'Facebook' : 'YouTube';
        const titulo = actual.datos && actual.datos.titulo;
        if (actual.enVivo) {
            estadoTexto.textContent = 'Transmitiendo ahora por ' + nombre + (titulo ? ': ' + titulo : '');
        } else if (estado[otra].enVivo) {
            estadoTexto.textContent = 'Estamos en vivo por ' + (otra === 'facebook' ? 'Facebook' : 'YouTube') + ' — toca su pestaña';
        } else {
            estadoTexto.textContent = 'No estamos en vivo en este momento';
        }
    }

    // Elige sola la plataforma: primero Facebook si está en vivo, después YouTube
    function elegirSola(antes) {
        const fb = estado.facebook.enVivo, yt = estado.youtube.enVivo;
        const recienEmpezo = (fb && !antes.facebook) || (yt && !antes.youtube);
        if (elegidaPorPersona && !recienEmpezo) return;
        elegidaPorPersona = false;
        elegida = fb ? 'facebook' : yt ? 'youtube' : 'facebook';
    }

    pestanas.forEach(b => b.addEventListener('click', () => {
        elegida = b.dataset.plataforma;
        elegidaPorPersona = true;
        mostrar();
    }));

    async function pedir(url) {
        try {
            const respuesta = await fetch(url, { cache: 'no-store' });
            return await respuesta.json();
        } catch (e) {
            return null;
        }
    }

    async function revisar() {
        const [fb, yt] = await Promise.all([
            pedir(tarjetaVivo.dataset.apiFacebook),
            pedir(tarjetaVivo.dataset.apiYoutube),
        ]);
        const antes = { facebook: estado.facebook.enVivo, youtube: estado.youtube.enVivo };
        const firma = d => d ? [d.en_vivo, d.video, d.ultimo].join('|') : '';
        [['facebook', fb], ['youtube', yt]].forEach(([nombre, datos]) => {
            if (!datos) return;
            const p = estado[nombre];
            if (firma(datos) !== firma(p.datos)) p.mostrando = null;   // algo cambió: se vuelve a dibujar
            p.datos = datos;
            p.enVivo = Boolean(datos.en_vivo && datos.video);
        });
        elegirSola(antes);
        mostrar();
    }

    revisar();
    setInterval(revisar, 45000);   // revisa cada 45 segundos
}


// ===== 14. Estado de la radio: al aire / próxima transmisión =====
const cajaRadio = document.querySelector('#radio-estado');

if (cajaRadio) {
    const programacion = JSON.parse(cajaRadio.dataset.programacion || '[]');
    const etiquetaRadio = cajaRadio.querySelector('.radio-estado-etiqueta');
    const tituloRadio = cajaRadio.querySelector('.radio-estado-titulo');
    const detalleRadio = cajaRadio.querySelector('.radio-estado-detalle');
    const DIAS = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
    const NOMBRES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    let senal = { al_aire: null, programa: '', oyentes: null };

    const sinTildes = texto => texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

    // Hora actual de Chile, sin importar dónde esté la persona
    function ahoraEnChile() {
        const partes = new Intl.DateTimeFormat('en-US', {
            timeZone: 'America/Santiago', weekday: 'short',
            hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
        }).formatToParts(new Date());
        const valor = tipo => partes.find(p => p.type === tipo).value;
        return {
            dia: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(valor('weekday')),
            minutos: parseInt(valor('hour'), 10) * 60 + parseInt(valor('minute'), 10),
        };
    }

    // Busca la transmisión en curso o la próxima según la programación
    function proximaTransmision() {
        const ahora = ahoraEnChile();
        let mejor = null;
        programacion.forEach(item => {
            const dias = (item.dias || ['todos']).map(sinTildes);
            const [h, m] = String(item.hora).split(':').map(Number);
            for (let suma = 0; suma <= 7; suma++) {
                const dia = (ahora.dia + suma) % 7;
                if (!dias.includes('todos') && !dias.includes(DIAS[dia])) continue;
                const inicio = suma * 1440 + h * 60 + m - ahora.minutos;
                const fin = inicio + (item.duracion || 60);
                if (fin <= 0) continue;
                if (!mejor || inicio < mejor.inicio) mejor = { inicio, fin, dia, suma, item };
                break;
            }
        });
        return mejor;
    }

    function cuando(t) {
        const dia = t.suma === 0 ? 'Hoy' : t.suma === 1 ? 'Mañana' : NOMBRES[t.dia];
        return dia + ' · ' + t.item.hora + ' hrs';
    }

    function falta(minutos) {
        if (minutos < 60) return minutos + ' min';
        const h = Math.floor(minutos / 60), m = minutos % 60;
        return h + ' h' + (m ? ' ' + m + ' min' : '');
    }

    function mostrar(estado, etiqueta, titulo, detalle) {
        cajaRadio.classList.remove('al-aire', 'pronto');
        if (estado) cajaRadio.classList.add(estado);
        etiquetaRadio.textContent = etiqueta;
        tituloRadio.textContent = titulo;
        detalleRadio.textContent = detalle || '';
    }

    function actualizarRadio() {
        const t = proximaTransmision();
        const enHorario = t && t.inicio <= 0;
        const oyentes = senal.oyentes ? senal.oyentes + ' oyentes conectados' : '';

        if (senal.al_aire === true) {
            const programa = senal.programa || (enHorario ? t.item.programa : 'Radio en vivo');
            const proximo = !enHorario && t ? 'Próximo programa: ' + cuando(t) : '';
            const extra = [oyentes, proximo].filter(Boolean).join(' · ');
            mostrar('al-aire', 'Al aire ahora', programa, extra);
        } else if (enHorario && senal.al_aire === null) {
            mostrar('al-aire', 'En vivo ahora', t.item.programa, 'Presiona "Escúchanos en vivo"');
        } else if (enHorario) {
            mostrar('pronto', 'Comienza en breve', t.item.programa, 'La transmisión está por iniciar');
        } else if (t && t.inicio <= 30) {
            mostrar('pronto', 'Comienza pronto', cuando(t), t.item.programa + ' · faltan ' + falta(t.inicio));
        } else if (t) {
            mostrar(null, 'Próxima transmisión', cuando(t), t.item.programa + ' · faltan ' + falta(t.inicio));
        } else {
            mostrar(null, 'Radio', 'Escúchanos en vivo', '');
        }
    }

    async function revisarRadio() {
        try {
            const respuesta = await fetch(cajaRadio.dataset.api, { cache: 'no-store' });
            senal = await respuesta.json();
        } catch (e) {
            senal = { al_aire: null, programa: '', oyentes: null };
        }
        actualizarRadio();
    }

    actualizarRadio();
    revisarRadio();
    setInterval(revisarRadio, 60000);     // consulta la señal cada minuto
    setInterval(actualizarRadio, 20000);  // actualiza la cuenta regresiva
}

// ===== 16. Días de culto: próximo culto y cuenta regresiva =====
const panelCultos = document.querySelector('.cultos-panel');

if (panelCultos) {
    const listaCultos = JSON.parse(panelCultos.dataset.cultos || '[]');
    const destacado = panelCultos.querySelector('.culto-destacado');
    const filas = panelCultos.querySelectorAll('.culto-fila');
    const DIAS_SEMANA = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
    const DURACION_CULTO = 120;  // minutos que dura un culto (para mostrar "en curso")
    const quitarTildes = t => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

    // Hora actual en Chile
    function horaChile() {
        const partes = new Intl.DateTimeFormat('en-US', {
            timeZone: 'America/Santiago', weekday: 'short',
            hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
        }).formatToParts(new Date());
        const v = tipo => partes.find(p => p.type === tipo).value;
        return {
            dia: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(v('weekday')),
            minutos: parseInt(v('hour'), 10) * 60 + parseInt(v('minute'), 10),
        };
    }

    // Busca el próximo culto (o el que está ocurriendo ahora)
    function buscarProximo() {
        const ahora = horaChile();
        let mejor = null;
        listaCultos.forEach((culto, i) => {
            const diaCulto = DIAS_SEMANA.indexOf(quitarTildes(culto.dia));
            const [h, m] = (String(culto.hora).match(/\d+/g) || ['20', '0']).map(Number);
            if (diaCulto < 0) return;
            let suma = (diaCulto - ahora.dia + 7) % 7;
            let faltan = suma * 1440 + h * 60 + (m || 0) - ahora.minutos;
            if (faltan + DURACION_CULTO <= 0) faltan += 7 * 1440;
            if (!mejor || faltan < mejor.faltan) mejor = { faltan, i, culto };
        });
        return mejor;
    }

    function actualizarCultos() {
        const p = buscarProximo();
        if (!p) return;
        const enCurso = p.faltan <= 0;
        const resto = Math.max(p.faltan, 0);
        const fecha = new Date(Date.now() + resto * 60000);
        const textoFecha = new Intl.DateTimeFormat('es-CL', {
            timeZone: 'America/Santiago', day: 'numeric', month: 'long',
        }).format(fecha);

        destacado.classList.toggle('en-curso', enCurso);
        destacado.querySelector('.cd-estado').textContent = enCurso ? 'Culto en curso · ¡Ven ahora!' : 'Próximo culto';
        const enDias = Math.floor((horaChile().minutos + resto) / 1440);
        destacado.querySelector('.cd-dia').textContent =
            enCurso ? 'Ahora' : enDias === 0 ? 'Hoy' : enDias === 1 ? 'Mañana' : p.culto.dia;
        destacado.querySelector('.cd-fecha').textContent = p.culto.dia + ' ' + textoFecha + ' · ' + p.culto.hora;

        destacado.querySelector('[data-u="d"]').textContent = Math.floor(resto / 1440);
        destacado.querySelector('[data-u="h"]').textContent = Math.floor((resto % 1440) / 60);
        destacado.querySelector('[data-u="m"]').textContent = resto % 60;

        filas.forEach((fila, i) => fila.classList.toggle('es-proximo', i === p.i));
    }

    actualizarCultos();
    setInterval(actualizarCultos, 30000);

    // Que aparezcan suavemente al bajar
    [destacado, ...filas].forEach((el, i) => {
        el.classList.add('revelar');
        el.style.transitionDelay = (i * 0.12) + 's';
        observador.observe(el);
    });
}
/* =========================================================
   TRANSICIÓN "BETHEL" AL CAMBIAR DE PÁGINA O SECCIÓN
   ========================================================= */
(function () {
    const CLAVE = 'bethel-transicion';
    const html = document.documentElement;
    const sinMovimiento = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const T_CUBRIR = 600;   // lo que tarda en tapar la pantalla
    const T_MOSTRAR = 400;  // tiempo que se ve la palabra BETHEL
    const T_SALIR = 650;    // lo que tarda en destapar

    // ¿Venimos de otra página con la animación?
    let entrando = false;
    try {
        entrando = sessionStorage.getItem(CLAVE) === '1';
        sessionStorage.removeItem(CLAVE);
    } catch (e) {}
    if (entrando && !sinMovimiento) html.classList.add('bethel-entra');

    let capa = null;
    let ocupado = false;
    const esperar = ms => new Promise(listo => setTimeout(listo, ms));

    function crearCapa() {
        capa = document.createElement('div');
        capa.className = 'bethel-transicion';
        capa.setAttribute('aria-hidden', 'true');

        const letras = 'BETHEL'.split('')
            .map((letra, i) => `<span style="--i:${i}">${letra}</span>`)
            .join('');

        capa.innerHTML = `
            <div class="bt-oro"></div>
            <div class="bt-capa">
                <div class="bt-contenido">
                    <img class="bt-logo" src="/static/img/logo.png" alt="">
                    <div class="bt-palabra">${letras}</div>
                    <span class="bt-linea"></span>
                    <span class="bt-texto">Templo · Curicó</span>
                </div>
            </div>`;
        document.body.appendChild(capa);
    }

    async function cubrir() {
        capa.classList.remove('saliendo', 'lista');
        void capa.offsetWidth;                 // reinicia la animación
        capa.classList.add('activa', 'cubriendo');
        await esperar(T_CUBRIR);
    }

    async function descubrir() {
        capa.classList.remove('cubriendo');
        capa.classList.add('activa', 'saliendo');
        await esperar(T_SALIR);
        capa.classList.remove('activa', 'saliendo', 'lista');
    }

    function irASeccion(destino) {
        document.body.classList.remove('menu-abierto');
        const barra = document.querySelector('.navbar');
        const alto = barra ? barra.offsetHeight : 0;
        const y = destino.getBoundingClientRect().top + window.scrollY - alto;
        window.scrollTo({ top: Math.max(y, 0), behavior: 'instant' });
    }

    document.addEventListener('click', async e => {
        if (sinMovimiento || !capa) return;
        if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;

        const enlace = e.target.closest('a[href]');
        if (!enlace || enlace.target === '_blank' || enlace.hasAttribute('download')) return;

        const url = new URL(enlace.href, location.href);
        if (url.origin !== location.origin) return;   // enlaces externos, WhatsApp, correo...

        const mismaPagina = url.pathname === location.pathname && url.search === location.search;

        if (mismaPagina) {
            // Dentro de la misma página: solo los enlaces del menú
            if (!enlace.closest('.navbar, .panel-movil')) return;
            const destino = url.hash ? document.querySelector(url.hash) : null;
            if (!destino) return;

            e.preventDefault();
            e.stopPropagation();
            if (ocupado) return;
            ocupado = true;
            if (document.activeElement) document.activeElement.blur();

            await cubrir();
            irASeccion(destino);
            await esperar(T_MOSTRAR);
            await descubrir();
            ocupado = false;
        } else {
            // Ir a otra página (por ejemplo, Noticias)
            e.preventDefault();
            e.stopPropagation();
            if (ocupado) return;
            ocupado = true;

            await cubrir();
            await esperar(T_MOSTRAR - 150);
            try { sessionStorage.setItem(CLAVE, '1'); } catch (err) {}
            location.href = url.href;
        }
    }, true);

    // Crea la capa apenas exista el <body>, antes de que se vea la página
    function cuandoHayaBody(hacer) {
        if (document.body) return hacer();
        const vigilante = new MutationObserver(() => {
            if (document.body) {
                vigilante.disconnect();
                hacer();
            }
        });
        vigilante.observe(html, { childList: true });
    }

    cuandoHayaBody(() => {
        crearCapa();
        if (!html.classList.contains('bethel-entra')) return;

        // Llegamos tapados: mostramos BETHEL y destapamos cuando cargue
        capa.classList.add('activa', 'lista');
        html.classList.remove('bethel-entra');

        const cargada = new Promise(listo => {
            if (document.readyState === 'complete') listo();
            else window.addEventListener('load', listo, { once: true });
        });
        Promise.race([cargada, esperar(1200)])
            .then(() => esperar(250))
            .then(descubrir);
    });

    // Si vuelven con el botón "atrás", la pantalla no queda tapada
    window.addEventListener('pageshow', e => {
        if (e.persisted && capa) {
            capa.className = 'bethel-transicion';
            ocupado = false;
        }
    });
})();
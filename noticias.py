# =========================================================
#  NOTICIAS: junta noticias actuales de varias páginas (RSS)
#  y se actualiza sola cada pocos minutos.
# =========================================================
import json
import os
import re
import threading
import time
import unicodedata
import urllib.request
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from html import unescape

# ===== FUENTES (✏️ puedes agregar o quitar páginas aquí) =====
#   nombre    → cómo aparece el medio en la página
#   categoria → sección donde se muestra
#   url       → enlace RSS del medio
#   dias      → (opcional) cuántos días de antigüedad se aceptan (si no se pone: DIAS_RECIENTES)
#   excluir   → (opcional) palabras en el enlace que NO queremos (ej. deportes)
FUENTES_NOTICIAS = [
    {"nombre": "Protestante Digital", "categoria": "Iglesia",
     "url": "https://protestantedigital.com/rss/internacional"},
    {"nombre": "Protestante Digital", "categoria": "Iglesia",
     "url": "https://protestantedigital.com/rss/portada"},
    {"nombre": "Noticias Proféticas", "categoria": "Profecía", "dias": 45,
     "url": "https://www.noticiasprofeticas.com/feed/"},
    {"nombre": "Enlace Judío", "categoria": "Israel",
     "url": "https://www.enlacejudio.com/feed/"},
    {"nombre": "Euronews", "categoria": "Mundo",
     "url": "https://es.euronews.com/rss?format=mrss&level=theme&name=news"},
    {"nombre": "Cooperativa", "categoria": "Chile",
     "url": "https://www.cooperativa.cl/noticias/site/tax/port/all/rss_3___1.xml",
     "excluir": ["/deportes/", "/entretencion/", "/espectaculos/"]},
]

DIAS_RECIENTES = 4          # solo noticias de los últimos días (noticias actuales)
MINUTOS_ACTUALIZAR = 10     # cada cuántos minutos se buscan noticias nuevas
MAXIMO_POR_FUENTE = 20      # noticias que se revisan de cada fuente
TITULOS_EXCLUIDOS = ["Últimas noticias |", "Horóscopo", "En directo |"]

# ===== SEÑALES DE LOS TIEMPOS (✏️ puedes agregar o quitar palabras) =====
# Las noticias de cualquier sección que tengan estas palabras en el título
# también aparecen en la sección "Profecía".
PALABRAS_SENALES = [
    "israel", "jerusalen", "gaza", "iran", "medio oriente", "templo", "hamas", "hezbola",
    "terremoto", "sismo", "tsunami", "volcan", "huracan", "inundacion", "sequia",
    "guerra", "misil", "nuclear", "hambruna", "pandemia", "epidemia", "plaga",
    "persecucion", "perseguid", "martir", "apostasia", "profecia", "profetic",
    "apocalipsis", "fin de los tiempos", "ultimos tiempos", "anticristo",
    "nuevo orden", "gobierno mundial", "moneda digital", "dinero digital",
    "inteligencia artificial", "eclipse", "fin del mundo",
]

# Secciones que siempre cuentan como "señales de los tiempos"
SECCIONES_SENALES = ["Israel"]


def _sin_tildes(texto):
    texto = unicodedata.normalize("NFD", texto.lower())
    return "".join(c for c in texto if unicodedata.category(c) != "Mn")


def _es_senal(noticia):
    titulo = " " + _sin_tildes(noticia["titulo"]) + " "
    return any(re.search(r"\b" + re.escape(p), titulo) for p in PALABRAS_SENALES)

ARCHIVO_GUARDADO = os.path.join(os.path.dirname(os.path.abspath(__file__)), "noticias_guardadas.json")

_CABECERAS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/124.0 Safari/537.36",
    "Accept-Language": "es-CL,es;q=0.9",
    "Accept": "application/rss+xml, application/xml, text/xml, text/html, */*",
}
_actualizando = threading.Lock()
_estado = {"datos": None, "hora": 0, "intento": 0, "articulos": {}, "hilo": False}


# ---------------------------------------------------------
#  Ayudas
# ---------------------------------------------------------
def _descargar(url, limite=1_500_000):
    peticion = urllib.request.Request(url, headers=_CABECERAS)
    with urllib.request.urlopen(peticion, timeout=8) as respuesta:
        return respuesta.read(limite).decode("utf-8", "ignore")


def _etiqueta(bloque, nombre):
    """Saca el contenido de una etiqueta, por ejemplo <title>...</title>."""
    encontrado = re.search(rf"<{nombre}\b[^>]*>(.*?)</{nombre}>", bloque, re.S | re.I)
    if not encontrado:
        return ""
    texto = encontrado.group(1).strip()
    cdata = re.fullmatch(r"<!\[CDATA\[(.*)\]\]>", texto, re.S)
    return cdata.group(1) if cdata else unescape(texto)


def _texto_limpio(html):
    texto = re.sub(r"<(script|style|iframe|figcaption)\b.*?</\1>", " ", html, flags=re.S | re.I)
    texto = re.sub(r"<div class=\"piefoto\".*?</div>", " ", texto, flags=re.S | re.I)
    texto = unescape(re.sub(r"<[^>]+>", " ", texto))
    texto = re.sub(r"\[[^\]]{1,40}\]|#\w{1,6}#", " ", texto)          # restos de publicidad
    texto = re.sub(r"(La entrada|The post) .{0,200}$", "", texto.strip(), flags=re.S)
    return re.sub(r"\s+", " ", texto).strip()


def _recortar(texto, largo=240):
    if len(texto) <= largo:
        return texto
    return texto[:largo].rsplit(" ", 1)[0].rstrip(",;:.") + "…"


def _es_enlace(url):
    return bool(url) and url.startswith(("http://", "https://"))


def _fecha(texto):
    if not texto:
        return None
    texto = texto.strip()
    try:
        fecha = parsedate_to_datetime(texto)
    except Exception:
        try:
            fecha = datetime.fromisoformat(texto.replace("Z", "+00:00"))
        except Exception:
            return None
    if fecha.tzinfo is None:
        fecha = fecha.replace(tzinfo=timezone.utc)
    return fecha.timestamp()


def _meta(html, *nombres):
    """Busca <meta property="..." content="..."> en cualquier orden."""
    for nombre in nombres:
        for patron in (rf'<meta[^>]+(?:property|name|itemprop)=["\']{nombre}["\'][^>]*content=["\']([^"\']+)',
                       rf'<meta[^>]+content=["\']([^"\']+)["\'][^>]*(?:property|name|itemprop)=["\']{nombre}["\']'):
            encontrado = re.search(patron, html, re.I)
            if encontrado:
                return unescape(encontrado.group(1)).strip()
    return ""


def _datos_del_articulo(url):
    """Abre la nota original y saca su foto principal y su fecha real."""
    guardado = _estado["articulos"].get(url)
    if guardado and guardado.get("revisado"):
        return guardado
    datos = {"imagen": "", "fecha": None, "revisado": True, "visto": time.time()}
    try:
        html = _descargar(url, limite=600_000)
        imagen = _meta(html, "og:image", "og:image:url", "twitter:image", "twitter:image:src")
        if _es_enlace(imagen):
            datos["imagen"] = imagen
        fecha = _meta(html, "article:published_time", "datePublished", "date", "pubdate",
                      "og:updated_time", "article:modified_time")
        if not fecha:
            json_ld = re.search(r'"datePublished"\s*:\s*"([^"]+)"', html)
            fecha = json_ld.group(1) if json_ld else ""
        datos["fecha"] = _fecha(fecha)
    except Exception:
        datos["revisado"] = False      # se vuelve a intentar en la próxima actualización
    if guardado:
        datos["visto"] = guardado.get("visto", datos["visto"])
    _estado["articulos"][url] = datos
    return datos


# ---------------------------------------------------------
#  Leer una fuente RSS
# ---------------------------------------------------------
def _leer_fuente(fuente):
    try:
        xml = _descargar(fuente["url"])
    except Exception:
        return []

    bloques = re.findall(r"<item\b.*?</item>", xml, re.S | re.I) or \
              re.findall(r"<entry\b.*?</entry>", xml, re.S | re.I)

    noticias = []
    for bloque in bloques[:MAXIMO_POR_FUENTE]:
        titulo = _texto_limpio(_etiqueta(bloque, "title"))
        enlace = _etiqueta(bloque, "link").strip()
        if not enlace:
            atom = re.search(r"<link\b[^>]*href=[\"']([^\"']+)", bloque)
            enlace = unescape(atom.group(1)) if atom else ""
        if not titulo or not _es_enlace(enlace):
            continue
        if any(t.lower() in titulo.lower() for t in TITULOS_EXCLUIDOS):
            continue
        if any(palabra in enlace for palabra in fuente.get("excluir", [])):
            continue

        contenido = _etiqueta(bloque, "content:encoded") or _etiqueta(bloque, "content")
        descripcion = _etiqueta(bloque, "description") or _etiqueta(bloque, "summary")
        resumen = _texto_limpio(descripcion) or _texto_limpio(contenido)
        if resumen.lower().startswith(titulo.lower()[:40]):
            resumen = resumen[len(titulo):].strip(" -–:")

        # Foto que trae el mismo RSS (la más confiable)
        imagen = ""
        for patron in (r"<media:content\b[^>]*url=[\"']([^\"']+\.(?:jpe?g|png|webp)[^\"']*)",
                       r"<media:content\b[^>]*medium=[\"']image[^>]*url=[\"']([^\"']+)",
                       r"<media:content\b[^>]*url=[\"']([^\"']+)[^>]*medium=[\"']image",
                       r"<media:thumbnail\b[^>]*url=[\"']([^\"']+)",
                       r"<enclosure\b[^>]*type=[\"']image[^>]*url=[\"']([^\"']+)",
                       r"<enclosure\b[^>]*url=[\"']([^\"']+\.(?:jpe?g|png|webp))"):
            encontrado = re.search(patron, bloque, re.I)
            if encontrado:
                imagen = unescape(encontrado.group(1))
                break

        fecha = _fecha(_etiqueta(bloque, "pubDate") or _etiqueta(bloque, "published")
                       or _etiqueta(bloque, "updated") or _etiqueta(bloque, "dc:date"))

        noticias.append({
            "titulo": titulo,
            "enlace": enlace,
            "resumen": _recortar(resumen),
            "imagen": imagen if _es_enlace(imagen) else "",
            "fuente": fuente["nombre"],
            "categoria": fuente["categoria"],
            "fecha": fecha,
            "_dias": fuente.get("dias", DIAS_RECIENTES),
        })
    return noticias


# ---------------------------------------------------------
#  Juntar todo
# ---------------------------------------------------------
def _actualizar():
    with ThreadPoolExecutor(max_workers=8) as grupo:
        resultados = list(grupo.map(_leer_fuente, FUENTES_NOTICIAS))

    # Sin noticias repetidas
    vistas, noticias = set(), []
    for lista in resultados:
        for n in lista:
            clave = re.sub(r"\W+", "", n["titulo"].lower())[:70]
            if clave not in vistas:
                vistas.add(clave)
                noticias.append(n)
    if not noticias:
        return False

    # Abre las notas que no traen foto o fecha, para sacar la foto real de la noticia
    faltan = [n for n in noticias if not n["imagen"] or not n["fecha"]]
    with ThreadPoolExecutor(max_workers=12) as grupo:
        for n, extra in zip(faltan, grupo.map(lambda n: _datos_del_articulo(n["enlace"]), faltan)):
            n["imagen"] = n["imagen"] or extra["imagen"]
            n["fecha"] = n["fecha"] or extra["fecha"]

    # Si un medio usa la MISMA foto en muchas notas (o es un logo), no es la foto de la noticia
    repetidas = Counter((n["fuente"], n["imagen"]) for n in noticias if n["imagen"])
    for n in noticias:
        if n["imagen"] and (repetidas[(n["fuente"], n["imagen"])] >= 3
                            or re.search(r"logo|favicon|placeholder|default", n["imagen"], re.I)):
            n["imagen"] = ""

    # Solo noticias actuales (si no se sabe la fecha, se usa cuándo la vimos por primera vez)
    ahora = time.time()
    actuales = []
    for n in noticias:
        if not n["fecha"]:
            articulo = _estado["articulos"].setdefault(n["enlace"], {"visto": ahora})
            n["fecha"] = articulo.get("visto", ahora)
        n["fecha"] = min(n["fecha"], ahora)
        if ahora - n["fecha"] <= n.pop("_dias") * 86400:
            actuales.append(n)
    actuales.sort(key=lambda n: n["fecha"], reverse=True)
    for n in actuales:
        n["senal"] = n["categoria"] != "Profecía" and (n["categoria"] in SECCIONES_SENALES or _es_senal(n))

    datos = {
        "noticias": actuales[:120],
        "categorias": list(dict.fromkeys(f["categoria"] for f in FUENTES_NOTICIAS)),
        "actualizado": ahora,
    }
    _estado.update(datos=datos, hora=ahora)
    _guardar()
    return True


def _guardar():
    """Guarda las noticias en un archivo para que la página cargue rápido al reiniciar."""
    limite = time.time() - 30 * 86400
    _estado["articulos"] = {u: a for u, a in _estado["articulos"].items() if a.get("visto", 0) > limite}
    try:
        with open(ARCHIVO_GUARDADO, "w", encoding="utf-8") as archivo:
            json.dump({"datos": _estado["datos"], "hora": _estado["hora"],
                       "articulos": _estado["articulos"]}, archivo, ensure_ascii=False)
    except Exception:
        pass


def _cargar_guardado():
    try:
        with open(ARCHIVO_GUARDADO, encoding="utf-8") as archivo:
            guardado = json.load(archivo)
        _estado.update(datos=guardado.get("datos"), hora=guardado.get("hora", 0),
                       articulos=guardado.get("articulos", {}))
    except Exception:
        pass


def _actualizar_seguro():
    """Evita que dos actualizaciones corran al mismo tiempo."""
    if not _actualizando.acquire(blocking=False):
        return
    try:
        _estado["intento"] = time.time()
        _actualizar()
    except Exception:
        pass
    finally:
        _actualizando.release()


def _actualizar_siempre():
    """Trabaja en segundo plano: busca noticias nuevas cada X minutos."""
    while True:
        time.sleep(MINUTOS_ACTUALIZAR * 60)
        _actualizar_seguro()


def obtener_noticias():
    """Entrega las noticias más recientes (la primera vez arranca la actualización automática)."""
    if not _estado["hilo"]:
        _estado["hilo"] = True
        _cargar_guardado()
        threading.Thread(target=_actualizar_siempre, daemon=True).start()
        if _estado["datos"]:
            threading.Thread(target=_actualizar_seguro, daemon=True).start()

    # Sin noticias guardadas, o si llevan mucho rato sin actualizarse: buscar ahora
    atrasado = time.time() - _estado["hora"] > MINUTOS_ACTUALIZAR * 60 * 2
    if (not _estado["datos"] or atrasado) and time.time() - _estado["intento"] > 90:
        if _estado["datos"]:
            threading.Thread(target=_actualizar_seguro, daemon=True).start()
        else:
            _actualizar_seguro()

    datos = _estado["datos"] or {"noticias": [], "actualizado": time.time()}
    return {**datos, "categorias": list(dict.fromkeys(f["categoria"] for f in FUENTES_NOTICIAS))}
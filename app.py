import hmac
import json
import os
import re
import time
import urllib.request
import xml.etree.ElementTree as ET
from datetime import date
from html import unescape

from flask import Flask, jsonify, render_template, request
from markupsafe import Markup

from iconos import ICONOS
from noticias import obtener_noticias
app = Flask(__name__)


# Permite escribir {{ icono("nombre") }} en index.html
@app.context_processor
def agregar_iconos():
    def icono(nombre):
        return Markup(
            '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true">'
            f'<path d="{ICONOS[nombre]}"/></svg>'
        )
    return {"icono": icono}

# =========================================================
#  DATOS DE LA IGLESIA  (todo lo que se ve en la página)
# =========================================================
IGLESIA = {
    "nombre": "Templo Bethel",
    "sigla": "EECH · Curicó",
    "lema": "Ejército Evangélico de Chile · Curicó",
    "invitacion": "Te esperamos cada martes, jueves y sábado a las 20:00 hrs.",
    "pastor": "Roberto Sergio Orellana Orellana",
    "pastora": "Carolina Noemí Alcaíno Núñez",
    "mensaje_pastores": "Te damos la bienvenida a nuestra iglesia. "
                        "Aquí encontrarás una familia que te recibe con amor "
                        "y la Palabra de Dios para tu vida.",
    "direccion": "Paradero 8, Río Loa 275, Pob. Sol de Septiembre, Curicó",
    "mapa": "Río Loa 275, Curicó, Chile",
    "correo": "templobethel.eechcurico@gmail.com",
    "facebook": "https://www.facebook.com/templo.bethel.7509",
    "whatsapp": "56927895995",            # sin + ni espacios
    "whatsapp_texto": "+56 9 2789 5995",
}

# ===== NUESTRA HISTORIA (✏️ cambia estos párrafos por la historia real) =====
HISTORIA = [
    "Aquí va la historia de Templo Bethel: en qué año se fundó, "
    "quiénes la iniciaron y cómo comenzó la obra en Curicó.",
    "En este segundo párrafo puedes contar cómo ha crecido la iglesia, "
    "momentos importantes y lo que Dios ha hecho en la congregación.",
]

# ===== DÍAS DE CULTO =====
CULTOS = [
    {"dia": "Martes", "hora": "20:00 hrs", "nombre": "Culto"},
    {"dia": "Jueves", "hora": "20:00 hrs", "nombre": "Culto"},
    {"dia": "Sábado", "hora": "20:00 hrs", "nombre": "Culto"},
]

# ===== MINISTERIOS (✏️ cambia, quita o agrega los que tenga la iglesia) =====
# Íconos disponibles: fuego, flor, escudo, nino, musica, oracion
MINISTERIOS = [
    {"icono": "fuego", "nombre": "Jóvenes",
     "descripcion": "Un espacio para que los jóvenes crezcan en la fe y sirvan a Dios."},
    {"icono": "flor", "nombre": "Damas",
     "descripcion": "Mujeres unidas en oración, servicio y apoyo mutuo."},
    {"icono": "escudo", "nombre": "Varones",
     "descripcion": "Hombres comprometidos con Dios, su familia y la iglesia."},
    {"icono": "nino", "nombre": "Niños",
     "descripcion": "Enseñamos a los más pequeños el amor de Jesús."},
    {"icono": "musica", "nombre": "Alabanza",
     "descripcion": "Adoramos a Dios con música y cánticos en cada culto."},
]

# ===== RADIO =====
RADIO = {
    "nombre": "Radio El Tiempo es Cumplido",
    "lema": "Anunciando el retorno inminente de Cristo",
    "locutor": "Pastor Roberto Orellana Orellana",
    "app": "https://play.google.com/store/apps/details?id=com.comunikados.radieltiempescumplidis",
    "envivo": "https://sonicpremium.us:8024",
}

# ===== PROGRAMACIÓN DE LA RADIO (✏️ edítala cuando cambien los horarios) =====
# dias: lunes, martes, miercoles, jueves, viernes, sabado, domingo (o "todos")
# hora: formato 24 horas "HH:MM"   ·   duracion: en minutos
PROGRAMACION_RADIO = [
    {"programa": "El Tiempo es Cumplido", "dias": ["todos"], "hora": "21:30", "duracion": 60},
]

# ===== CANAL DE YOUTUBE (transmisiones en vivo) =====
YOUTUBE = {
    "nombre": "El Tiempo es Cumplido TV",
    "canal_id": "UCUEoKqnhAkgFhSfm2VbXZXQ",
    "enlace": "https://www.youtube.com/@eltiempoescumplido",
}
# ===== FACEBOOK (transmisiones en vivo) =====
FACEBOOK = {
    "nombre": "Templo Bethel",
    "enlace": IGLESIA["facebook"],
}

# ✏️ Clave del panel de transmisión (cámbiala por una que solo sepan ustedes)
CLAVE_TRANSMISION = os.environ.get("CLAVE_TRANSMISION", "bethel2026")
HORAS_MAXIMAS_EN_VIVO = 4      # si se olvidan de terminar, se apaga sola después de 4 horas

# ===== TARJETAS "CONOCE MÁS" =====
TARJETAS = [
    {"imagen": "foto1.jpg", "categoria": "Nosotros", "titulo": "Nuestra historia",
     "texto": "Conoce cómo nació nuestra iglesia", "enlace": "#historia"},
    {"imagen": "pastor.png", "categoria": "Liderazgo", "titulo": "Nuestros pastores",
     "texto": "Quienes guían nuestra congregación", "enlace": "#pastores"},
    {"imagen": "radio.jpg", "categoria": "Radio", "titulo": "El Tiempo es Cumplido",
     "texto": "Escucha la Palabra cada noche", "enlace": "#radio"},
    {"imagen": "foto3.jpg", "categoria": "Comunidad", "titulo": "Ministerios",
     "texto": "Hay un lugar para ti", "enlace": "#ministerios"},
    {"imagen": "portada.jpg", "categoria": "Cultos", "titulo": "Días de culto",
     "texto": "Martes, jueves y sábado · 20:00 hrs", "enlace": "#cultos"},
    {"imagen": "foto2.jpg", "categoria": "Galería", "titulo": "Nuestra iglesia",
     "texto": "Momentos de nuestra congregación", "enlace": "#galeria"},
]

# ===== FOTOS DE LA GALERÍA (deben estar en static/img) =====
FOTOS = ["foto1.jpg", "foto3.jpg", "foto2.jpg"]
# ===== VERSÍCULOS (cambia uno distinto cada día) =====
VERSICULOS = [
    {"texto": "Jehová es mi pastor; nada me faltará.", "cita": "Salmo 23:1"},
    {"texto": "Todo lo puedo en Cristo que me fortalece.", "cita": "Filipenses 4:13"},
    {"texto": "Porque de tal manera amó Dios al mundo, que ha dado a su Hijo unigénito, "
              "para que todo aquel que en él cree, no se pierda, mas tenga vida eterna.",
     "cita": "Juan 3:16"},
    {"texto": "Fíate de Jehová de todo tu corazón, y no estribes en tu prudencia.",
     "cita": "Proverbios 3:5"},
    {"texto": "Venid a mí todos los que estáis trabajados y cargados, que yo os haré descansar.",
     "cita": "Mateo 11:28"},
    {"texto": "Dios es nuestro amparo y fortaleza, nuestro pronto auxilio en las tribulaciones.",
     "cita": "Salmo 46:1"},
    {"texto": "Lámpara es a mis pies tu palabra, y lumbre a mi camino.", "cita": "Salmo 119:105"},
    {"texto": "Jesucristo es el mismo ayer, y hoy, y por los siglos.", "cita": "Hebreos 13:8"},
    {"texto": "Encomienda a Jehová tu camino, y espera en él; y él hará.", "cita": "Salmo 37:5"},
    {"texto": "Mas buscad primeramente el reino de Dios y su justicia, "
              "y todas estas cosas os serán añadidas.", "cita": "Mateo 6:33"},
    {"texto": "Cree en el Señor Jesucristo, y serás salvo tú, y tu casa.", "cita": "Hechos 16:31"},
    {"texto": "Mi socorro viene de Jehová, que hizo los cielos y la tierra.", "cita": "Salmo 121:2"},
    {"texto": "Yo soy el camino, y la verdad, y la vida: nadie viene al Padre, sino por mí.",
     "cita": "Juan 14:6"},
    {"texto": "Yo me alegré con los que me decían: A la casa de Jehová iremos.",
     "cita": "Salmo 122:1"},
]


# =========================================================
#  REVISAR SI EL CANAL ESTÁ EN VIVO
#  (se guarda el resultado 60 segundos para no consultar a cada rato)
# =========================================================
_memoria = {"hora": 0, "datos": None}
_CABECERAS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/124.0 Safari/537.36",
    "Accept-Language": "es-CL,es;q=0.9",
    "Cookie": "CONSENT=YES+1",
}


def _descargar(url):
    peticion = urllib.request.Request(url, headers=_CABECERAS)
    with urllib.request.urlopen(peticion, timeout=6) as respuesta:
        return respuesta.read().decode("utf-8", "ignore")


def estado_youtube():
    if _memoria["datos"] and time.time() - _memoria["hora"] < 60:
        return _memoria["datos"]

    datos = {"en_vivo": False, "video": None, "titulo": "",
             "ultimo": None, "ultimo_titulo": "", "error": False}

    # 1) ¿Está transmitiendo en vivo ahora?
    try:
        html = _descargar(f"https://www.youtube.com/channel/{YOUTUBE['canal_id']}/live")
        video = re.search(r'<link rel="canonical" href="https://www\.youtube\.com/watch\?v=([\w-]{11})"', html)
        if video and '"isLiveNow":true' in html:
            datos["en_vivo"] = True
            datos["video"] = video.group(1)
            titulo = re.search(r'<meta name="title" content="([^"]*)"', html)
            datos["titulo"] = unescape(titulo.group(1)) if titulo else ""
    except Exception:
        datos["error"] = True

    # 2) Último video subido (para mostrarlo cuando no hay transmisión)
    try:
        xml = _descargar(f"https://www.youtube.com/feeds/videos.xml?channel_id={YOUTUBE['canal_id']}")
        ns = {"a": "http://www.w3.org/2005/Atom", "yt": "http://www.youtube.com/xml/schemas/2015"}
        entrada = ET.fromstring(xml).find("a:entry", ns)
        if entrada is not None:
            datos["ultimo"] = entrada.find("yt:videoId", ns).text
            datos["ultimo_titulo"] = entrada.find("a:title", ns).text or ""
    except Exception:
        datos["error"] = True

    _memoria.update(hora=time.time(), datos=datos)
    return datos


# =========================================================
#  REVISAR SI LA RADIO ESTÁ AL AIRE (servidor Shoutcast / Icecast)
# =========================================================
_memoria_radio = {"hora": 0, "datos": None}


def estado_radio():
    if _memoria_radio["datos"] and time.time() - _memoria_radio["hora"] < 30:
        return _memoria_radio["datos"]

    datos = {"al_aire": None, "programa": "", "oyentes": None}
    base = RADIO["envivo"].rstrip("/")
    bases = [base] + ([base.replace("https://", "http://")] if base.startswith("https://") else [])

    for servidor in bases:
        # Shoutcast 2
        try:
            info = json.loads(_descargar(f"{servidor}/stats?sid=1&json=1"))
            datos["al_aire"] = str(info.get("streamstatus")) == "1"
            datos["programa"] = info.get("songtitle") or info.get("servertitle") or ""
            datos["oyentes"] = info.get("currentlisteners")
            break
        except Exception:
            pass
        # Icecast
        try:
            info = json.loads(_descargar(f"{servidor}/status-json.xsl")).get("icestats", {})
            fuente = info.get("source")
            if isinstance(fuente, list):
                fuente = fuente[0] if fuente else None
            datos["al_aire"] = bool(fuente)
            if fuente:
                datos["programa"] = fuente.get("title") or fuente.get("server_name") or ""
                datos["oyentes"] = fuente.get("listeners")
            break
        except Exception:
            pass
        # Shoutcast 1
        try:
            texto = re.sub(r"<[^>]+>", "", _descargar(f"{servidor}/7.html")).strip()
            partes = texto.split(",", 6)
            datos["al_aire"] = partes[1] == "1"
            datos["oyentes"] = int(partes[0])
            datos["programa"] = partes[6] if len(partes) > 6 else ""
            break
        except Exception:
            pass

    datos["programa"] = unescape(str(datos["programa"]))[:120]
    _memoria_radio.update(hora=time.time(), datos=datos)
    return datos

# =========================================================
#  TRANSMISIÓN DE FACEBOOK (se activa desde /transmision)
# =========================================================
ARCHIVO_TRANSMISION = os.path.join(os.path.dirname(os.path.abspath(__file__)), "transmision.json")


def guardar_transmision(datos):
    with open(ARCHIVO_TRANSMISION, "w", encoding="utf-8") as archivo:
        json.dump(datos, archivo, ensure_ascii=False)


def leer_transmision():
    datos = {"en_vivo": False, "video": "", "titulo": "", "inicio": 0, "ultimo": "", "ultimo_titulo": ""}
    try:
        with open(ARCHIVO_TRANSMISION, encoding="utf-8") as archivo:
            datos.update(json.load(archivo))
    except Exception:
        pass
    # Si se olvidaron de terminarla, se apaga sola
    if datos["en_vivo"] and time.time() - datos["inicio"] > HORAS_MAXIMAS_EN_VIVO * 3600:
        datos.update(en_vivo=False, ultimo=datos["video"], ultimo_titulo=datos["titulo"], video="", titulo="")
        guardar_transmision(datos)
    return datos


def limpiar_enlace_facebook(enlace):
    enlace = re.sub(r"^(https?://)?(www\.|m\.|web\.|mbasic\.)?facebook\.com", "https://www.facebook.com", enlace.strip())
    enlace = re.sub(r"^(https?://)?fb\.watch", "https://fb.watch", enlace)
    if re.match(r"^https://(www\.facebook\.com|fb\.watch)/\S+$", enlace):
        return enlace
    return ""


@app.route("/api/facebook")
def api_facebook():
    return jsonify(leer_transmision())


@app.route("/transmision", methods=["GET", "POST"])
def panel_transmision():
    datos = leer_transmision()
    mensaje, error = "", ""
    if request.method == "POST":
        accion = request.form.get("accion")
        if not hmac.compare_digest(request.form.get("clave", ""), CLAVE_TRANSMISION):
            error = "La clave no es correcta."
        elif accion == "comenzar":
            enlace = limpiar_enlace_facebook(request.form.get("enlace", ""))
            if not enlace:
                error = "Pega el enlace de la transmisión de Facebook (empieza con https://www.facebook.com/ o https://fb.watch/)."
            else:
                datos.update(en_vivo=True, video=enlace, inicio=time.time(),
                             titulo=request.form.get("titulo", "").strip()[:120])
                guardar_transmision(datos)
                mensaje = "¡Listo! La transmisión ya aparece en la página de la iglesia."
        elif accion == "terminar":
            if datos["en_vivo"]:
                datos.update(en_vivo=False, ultimo=datos["video"], ultimo_titulo=datos["titulo"], video="", titulo="")
                guardar_transmision(datos)
            mensaje = "Transmisión terminada. Quedó guardada como «Última transmisión»."
    return render_template("transmision.html", iglesia=IGLESIA, datos=datos, mensaje=mensaje, error=error,
                           horas=HORAS_MAXIMAS_EN_VIVO)

@app.route("/api/radio")
def api_radio():
    return jsonify(estado_radio())


@app.route("/api/youtube")
def api_youtube():
    return jsonify(estado_youtube())


@app.route("/")
def inicio():
    versiculo = VERSICULOS[date.today().toordinal() % len(VERSICULOS)]
    return render_template(
        "index.html",
        iglesia=IGLESIA, historia=HISTORIA, cultos=CULTOS, ministerios=MINISTERIOS,
        radio=RADIO, tarjetas=TARJETAS, fotos=FOTOS, versiculo=versiculo,
        youtube=YOUTUBE, programacion_radio=PROGRAMACION_RADIO, facebook=FACEBOOK,
    )

# ===== PÁGINA DE NOTICIAS =====
@app.route("/noticias")
def noticias():
    versiculo = VERSICULOS[date.today().toordinal() % len(VERSICULOS)]
    return render_template("noticias.html", iglesia=IGLESIA, radio=RADIO,
                           youtube=YOUTUBE, versiculo=versiculo)


@app.route("/api/noticias")
def api_noticias():
    return jsonify(obtener_noticias())

if __name__ == "__main__":
    app.run(debug=True)
# Atlas
 
Aplicación web para organizar viajes de Erasmus y de frecuentación: cuenta atrás, itinerario hora por hora, presupuesto, mapa de países visitados, recomendaciones de la comunidad, asistente de maleta y vuelos, y gastos compartidos.
 
Funciona sin servidor: todo el código se ejecuta en el navegador y se publica con GitHub Pages.
 
## Módulos
 
| Pestaña | Qué hace |
| --- | --- |
| Inicio | Cuenta atrás al próximo viaje, indicador de "Viajando ahora", transporte y tiempo restante de trayecto. |
| Itinerario | Plan por días y horas (ver, comer, transporte, recordatorios) y presupuesto por categoría. |
| Mapa | Mapa mundial con lugares visitados y de deseos, y porcentaje de países y continentes. |
| Comunidad | Recomendaciones de lugares por destino. Local por defecto; preparado para Supabase o Firebase. |
| Asistente | Clima del destino, sugerencias de ropa y enlaces a Skyscanner y Google Flights. |
| Gastos | Reparto de gastos entre compañeros y cálculo de quién paga a quién. |
 
## Estructura del proyecto
 
```
erasmus-travel/
├── index.html          Estructura de la aplicación y pestañas
├── styles.css          Estilos (burdeos, beige, blanco y gris oscuro)
├── app.js              Lógica principal y estado
├── manifest.json       Configuración PWA (instalable en el móvil)
├── sw.js               Service worker para uso sin conexión
├── README.md           Este archivo
├── .nojekyll           Evita el procesado de Jekyll en GitHub Pages
├── js/
│   ├── storage.js      Guardado local y exportación/importación
│   ├── dashboard.js    Cuenta atrás y viaje activo
│   ├── planner.js      Itinerario y presupuesto
│   ├── map.js          Mapa y estadísticas
│   ├── community.js    Recomendaciones y conexión a base de datos
│   ├── assistant.js    Clima, ropa y enlaces de vuelos
│   └── expenses.js     Gastos compartidos
├── data/
│   └── countries.json  Países, continentes y coordenadas
└── assets/
    └── icons/          Iconos de la PWA (192 px y 512 px)
```
 
## Puesta en marcha
 
1. Clona el repositorio o descarga los archivos.
2. Abre `index.html` en el navegador, o sirve la carpeta con un servidor local:
```
   python3 -m http.server 8000
```
   y visita `http://localhost:8000`.
 
## Publicar en GitHub Pages
 
1. Sube los archivos a la rama `main` de tu repositorio.
2. Ve a **Settings → Pages**.
3. En **Build and deployment**, elige **Deploy from a branch**.
4. Selecciona la rama `main` y la carpeta `/ (root)`, y pulsa **Save**.
5. Espera uno o dos minutos. La web quedará en `https://nuriaguerra.github.io/Atlas/`.

## Datos y privacidad
 
- Los viajes, itinerarios, lugares y gastos se guardan en `localStorage`, solo en tu navegador.
- Desde el pie de página puedes exportar una copia en JSON e importarla en otro dispositivo.
- Si activas Supabase o Firebase, solo las recomendaciones de la comunidad se envían a la base de datos.

## Base de datos de la comunidad (opcional)
 
Por defecto las recomendaciones se guardan en local. Para compartirlas entre usuarios:
 
1. Crea un proyecto en [Supabase](https://supabase.com) o [Firebase](https://firebase.google.com).
2. Crea la tabla o colección `recommendations` con los campos `place`, `city`, `country`, `category`, `rating`, `author`, `comment` y `created_at`.
3. Copia la URL del proyecto y la clave pública (anon key) en la sección de configuración de `js/community.js`.
4. Activa las reglas de seguridad (Row Level Security en Supabase) para permitir lectura pública y escritura controlada.
Nunca publiques claves secretas o de servicio en un repositorio público. La clave pública (anon) está pensada para el navegador, pero depende de que las reglas de seguridad estén bien configuradas.
 
## Servicios externos
 
- [Leaflet](https://leafletjs.com) y OpenStreetMap para el mapa.
- [Open-Meteo](https://open-meteo.com) para el clima, sin clave de API.
- Skyscanner y Google Flights: la aplicación solo genera enlaces de búsqueda.
## Diseño
 
Paleta monocromática: burdeos `#800020` y `#600018`, beige `#F5F0EB`, blanco y gris oscuro `#2B2526`. Tipografías: Newsreader para títulos y DM Sans para el texto.
 
## Hoja de ruta
 
- [x] Fase 1: estructura, pestañas y diseño base
- [ ] Fase 2: almacenamiento local y panel de inicio
- [ ] Fase 3: itinerario y presupuesto
- [ ] Fase 4: mapa y estadísticas
- [ ] Fase 5: comunidad y base de datos
- [ ] Fase 6: asistente de clima, ropa y vuelos
- [ ] Fase 7: gastos compartidos
- [ ] Fase 8: PWA y uso sin conexión

## Licencia y Derechos de Autor

© 2026 Atlas. Todos los derechos reservados.

Queda prohibida la reproducción, distribución, modificación o uso comercial no autorizado de este código fuente sin el consentimiento previo por escrito del autor.

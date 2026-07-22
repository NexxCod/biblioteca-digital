# Plan de mejoras de experiencia y adopción — Biblioteca Digital

**Objetivo:** que acceder cueste segundos, que compartir un archivo sea tan fácil como reenviarlo por WhatsApp, y que subir contenido dé visibilidad y reconocimiento a quien lo hace.

**Contexto del problema (hoy):**

- Los usuarios casi no entran a la plataforma; el contenido circula por WhatsApp (PDFs, clases, papers reenviados en grupos).
- El login con contraseña es fricción real para usuarios ocasionales: la olvidan y abandonan.
- Quien se registra queda con rol `usuario`, que **no ve ninguna carpeta ni archivo** hasta que un administrador lo activa a mano. Muchos probablemente entraron una vez, vieron la biblioteca "vacía" y no volvieron.
- Compartir un archivo específico dentro de la plataforma no genera un enlace directo que se pueda pegar en WhatsApp: la persona que recibe tiene que entrar, navegar carpetas y buscarlo.

La estrategia no es competir con WhatsApp sino **usarlo como canal de distribución**: los enlaces viajan por WhatsApp, pero el contenido vive (y se encuentra, se versiona y se mide) en la biblioteca.

---

## Fase 0 — Entregado en esta iteración

| Mejora | Detalle |
|---|---|
| Acceso con enlace por correo (magic link) | En la pantalla de login se puede pedir un enlace de un solo uso (válido 15 min) que inicia sesión sin contraseña. Además marca el correo como verificado, eliminando un paso del onboarding. |
| Panel "Novedades en la biblioteca" | En la página de inicio, los últimos archivos subidos (30 días) visibles según rol y grupos del usuario, con vista previa a un clic. Quien entra ve inmediatamente qué hay de nuevo. |

---

## Fase 1 — Quitar la fricción de entrada y de compartir (impacto alto, esfuerzo bajo/medio)

1. **Enlace directo a cada archivo + botón "Compartir"**
   - Ruta `/file/:id` que abre la vista previa del archivo (previo login, con redirect que ya existe vía `?redirect=`).
   - Botón "Copiar enlace" y botón "Compartir por WhatsApp" (`https://wa.me/?text=...`) en tarjetas y vista previa.
   - Es la mejora que más conecta con el hábito actual: lo que se reenvía por WhatsApp pasa a ser un enlace a la biblioteca.

2. **Invitaciones con grupo y rol precargados** (ataca el cuello de botella del rol `usuario`)
   - El admin o docente genera un enlace de invitación asociado a un grupo/rol (ej. "Residentes 2026").
   - Quien se registra con ese enlace queda activo de inmediato, sin espera ni gestión manual.
   - El enlace de invitación se comparte… por WhatsApp, naturalmente.

3. **Acceso con Google (un toque)**
   - Ya existe integración con `googleapis` para Drive; agregar Google Sign-In elimina contraseñas para cuentas Gmail/institucionales.
   - Combinado con el magic link, nadie necesita recordar una contraseña.

4. **Sesiones más amigables en móvil**
   - Revisar expiración/renovación del JWT (hoy 30 días fijos): renovar en uso activo para que el usuario habitual no vuelva a loguearse.
   - Promover la instalación de la PWA (ya está `vite-plugin-pwa`): banner "Añadir a pantalla de inicio" tras el segundo ingreso.

**KPI de la fase:** % de logins vía magic link/Google, tiempo entre registro y primer archivo visto, nº de aperturas provenientes de enlaces compartidos.

## Fase 2 — Que subir contenido sea trivial y visible (impacto alto, esfuerzo medio)

1. **Subida sin fricción**
   - Arrastrar y soltar en cualquier parte de la carpeta; selección múltiple con metadatos mínimos (los tags pueden llegar después).
   - En móvil (PWA): botón "Subir" que abre cámara/galería/documentos — clave para apuntes y fotos de presentaciones.

2. **Reconocimiento a quien aporta**
   - En "Novedades" ya aparece quién subió cada archivo; sumar un resumen mensual tipo "Top aportes" en el dashboard y en el digest semanal.
   - Contador visible de vistas/descargas para el autor (la data ya existe: `viewCount`, `downloadCount`).

3. **Notificaciones que traen de vuelta**
   - Aprovechar suscripciones a carpetas ya existentes: correo breve "3 archivos nuevos en Neurorradiología" con enlaces directos (que abren con magic link).
   - Digest semanal ya existe: enriquecerlo con las novedades + top de la semana.

4. **Búsqueda como puerta de entrada**
   - El buscador global (⌘K) ya existe; exponerlo más en móvil (barra fija "Buscar en la biblioteca").

**KPI de la fase:** archivos subidos por semana, nº de usuarios distintos que suben, % de archivos con al menos 1 vista en 7 días.

## Fase 3 — Distribución y medición (impacto medio/alto, esfuerzo medio/alto)

1. **Enlaces para invitados con expiración (evaluar con cuidado)**
   - Enlace de solo lectura a un archivo puntual, con vencimiento (p. ej. 7 días), para compartir con externos sin cuenta.
   - Requiere decisión explícita de política: si hay material clínico o con derechos, mantener siempre tras login.

2. **Canal institucional de WhatsApp automatizado**
   - Al aprobar/subir contenido destacado, generar mensaje listo para pegar (título + descripción + enlace) o publicar vía WhatsApp Business API en el canal del servicio.
   - Invierte el flujo actual: WhatsApp anuncia, la biblioteca aloja.

3. **Panel de adopción para administración**
   - Con `FileAccessLog` + `AuditLog` ya se puede medir: usuarios activos semanales, archivos más vistos, % de accesos desde enlaces compartidos, embudos de registro→activación→primer archivo.
   - Definir metas trimestrales (p. ej. 60% de residentes activos/semana).

4. **Colecciones/playlists** (ej. "Curso TC de urgencia"): agrupar archivos de distintas carpetas en una vista compartible con un solo enlace.

---

## Riesgos y cuidados

- **Correo que llega a spam:** el magic link depende del deliverability de Resend; configurar SPF/DKIM del dominio y monitorear rebotes.
- **Escáneres de correo corporativo:** pueden "visitar" enlaces. El canje del magic link se hace vía POST desde la página (no basta cargar la URL), lo que mitiga el consumo accidental del token de un solo uso.
- **Enlaces públicos:** en contexto médico-docente, todo lo identificable debe permanecer tras autenticación; los enlaces de invitado (Fase 3) deben ser opt-in por archivo y auditados.
- **Rate limiting compartido en redes institucionales:** los límites por IP pura castigan a hospitales con NAT; el limiter del magic link ya usa IP+email por esta razón. Revisar el resto con el mismo criterio.

## Orden sugerido de implementación

1. Enlace directo a archivo + compartir por WhatsApp (Fase 1.1) — es el multiplicador de todo lo demás.
2. Invitaciones con grupo precargado (Fase 1.2) — destraba la activación de cuentas.
3. Google Sign-In (Fase 1.3).
4. Subida móvil/drag&drop (Fase 2.1) y reconocimiento (Fase 2.2).
5. Notificaciones y digest enriquecido (Fase 2.3).
6. Fase 3 según resultados medidos.

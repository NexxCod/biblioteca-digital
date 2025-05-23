# Documentación API Backend - Imagenología App

**URL Base:** `http://localhost:5000` (o el puerto configurado)

**Autenticación:** La mayoría de los endpoints requieren un Token JWT válido enviado en la cabecera `Authorization` como `Bearer <TU_TOKEN_JWT>`. Los endpoints que no requieren autenticación se indicarán explícitamente.

---

## Autenticación (`/api/users`)

### 1. Registrar un Nuevo Usuario

* **Endpoint:** `/api/users/register`
* **Método:** `POST`
* **Descripción:** Crea una nueva cuenta de usuario en el sistema. Por defecto, se asigna el rol 'residente/alumno', ignorando cualquier campo `role` enviado en la petición por seguridad.
* **Autenticación:** No requerida.
* **Cuerpo de la Solicitud (Request Body - JSON):**
    ```json
    {
      "username": "nombre_usuario_unico",
      "email": "correo_unico@ejemplo.com",
      "password": "contraseña_segura"
    }
    ```
    * `username` (String, Requerido, Único)
    * `email` (String, Requerido, Único, Formato de email válido)
    * `password` (String, Requerido, Mínimo 6 caracteres)
* **Respuesta Exitosa (Código `201 Created`):**
    ```json
    {
      "_id": "ID_DEL_NUEVO_USUARIO",
      "username": "nombre_usuario_unico",
      "email": "correo_unico@ejemplo.com",
      "role": "residente/alumno",
      "token": "TU_NUEVO_TOKEN_JWT"
    }
    ```
* **Respuestas de Error:**
    * `400 Bad Request`: Datos faltantes, email o username ya existen, contraseña corta.
    * `500 Internal Server Error`: Error general del servidor.

### 2. Iniciar Sesión (Login)

* **Endpoint:** `/api/users/login`
* **Método:** `POST`
* **Descripción:** Autentica a un usuario existente y devuelve sus datos junto con un token JWT para usar en peticiones futuras.
* **Autenticación:** No requerida.
* **Cuerpo de la Solicitud (Request Body - JSON):**
    ```json
    {
      "email": "correo_registrado@ejemplo.com",
      "password": "contraseña_del_usuario"
    }
    ```
    * `email` (String, Requerido)
    * `password` (String, Requerido)
* **Respuesta Exitosa (Código `200 OK`):**
    ```json
    {
      "_id": "ID_DEL_USUARIO",
      "username": "nombre_del_usuario",
      "email": "correo_registrado@ejemplo.com",
      "role": "rol_del_usuario", // 'admin', 'docente', o 'residente/alumno'
      "token": "TU_NUEVO_TOKEN_JWT"
    }
    ```
* **Respuestas de Error:**
    * `400 Bad Request`: Datos faltantes.
    * `401 Unauthorized`: Email no encontrado o contraseña incorrecta.
    * `500 Internal Server Error`: Error general del servidor.

---

## Carpetas (`/api/folders`)

Endpoints para gestionar las carpetas donde se organizan los archivos y enlaces.

### 1. Listar Carpetas

* **Endpoint:** `/api/folders`
* **Método:** `GET`
* **Descripción:** Obtiene una lista de carpetas según los permisos del usuario y el nivel solicitado.
    * Si **no** se proporciona el query param `parentFolder`, lista las carpetas raíz (`parentFolder: null`).
    * Si se proporciona `parentFolder=ID_CARPETA_PADRE`, lista las subcarpetas directas de la carpeta padre especificada.
* **Autenticación:** Requerida (Bearer Token).
* **Query Parameters:**
    * `parentFolder` (String, Opcional): El `_id` de la carpeta padre cuyas subcarpetas se desean listar. Si se omite, lista las carpetas raíz.
* **Lógica de Permisos:**
    * **Admin:** Ve todas las carpetas del nivel solicitado.
    * **Residente/Alumno ('becado'):** Ve las carpetas del nivel solicitado que sean públicas (`assignedGroup: null`) O que estén asignadas a un grupo al que pertenece.
    * **Docente:** Ve las carpetas del nivel solicitado que hayan sido creadas por él (`createdBy`) O que estén asignadas a un grupo al que pertenece. (No ve carpetas públicas creadas por otros).
* **Respuesta Exitosa (Código `200 OK`):**
    Un array de objetos Carpeta que cumplen los criterios de filtro y permisos. Cada objeto incluye campos como:
    ```json
    [
      {
        "_id": "ID_DE_LA_CARPETA",
        "name": "Nombre de la Carpeta",
        "parentFolder": "ID_CARPETA_PADRE_O_NULL",
        "createdBy": { // Populado
          "_id": "ID_DEL_CREADOR",
          "username": "nombre_creador"
        },
        "assignedGroup": { // Populado si no es null
          "_id": "ID_DEL_GRUPO",
          "name": "Nombre del Grupo Asignado"
        }, // o null si es pública
        "createdAt": "TIMESTAMP",
        "updatedAt": "TIMESTAMP"
      },
      // ... más carpetas
    ]
    ```
* **Respuestas de Error:**
    * `401 Unauthorized`: Token inválido o no proporcionado.
    * `403 Forbidden`: Rol sin permisos definidos (no debería ocurrir con los roles estándar).
    * `500 Internal Server Error`: Error general del servidor.

### 2. Crear una Nueva Carpeta

* **Endpoint:** `/api/folders`
* **Método:** `POST`
* **Descripción:** Crea una nueva carpeta raíz o una subcarpeta.
* **Autenticación:** Requerida (Bearer Token). (Cualquier rol autenticado puede crear).
* **Cuerpo de la Solicitud (Request Body - JSON):**
    ```json
    {
      "name": "Nombre Nueva Carpeta",
      "parentFolder": "ID_CARPETA_PADRE_O_omitir_para_raiz", // Opcional
      "assignedGroupId": "ID_GRUPO_ASIGNADO_O_omitir_para_publica" // Opcional
    }
    ```
    * `name` (String, Requerido): Nombre de la nueva carpeta.
    * `parentFolder` (String ObjectId, Opcional): ID de la carpeta padre. Si se omite, se crea como carpeta raíz.
    * `assignedGroupId` (String ObjectId, Opcional): ID del grupo al que se asignará. Si se omite o es `null`, la carpeta será pública (visible según reglas de rol).
* **Respuesta Exitosa (Código `201 Created`):**
    El objeto JSON de la carpeta recién creada (similar al formato de la respuesta de listar).
* **Respuestas de Error:**
    * `400 Bad Request`: Falta el nombre, `assignedGroupId` inválido, nombre duplicado en el mismo nivel.
    * `401 Unauthorized`: Token inválido o no proporcionado.
    * `404 Not Found`: El `assignedGroupId` (si se proporcionó) no corresponde a un grupo existente.
    * `500 Internal Server Error`: Error general del servidor.

### 3. Actualizar una Carpeta

* **Endpoint:** `/api/folders/:id`
* **Método:** `PUT`
* **Descripción:** Modifica el nombre y/o el grupo asignado de una carpeta existente.
* **Autenticación:** Requerida (Bearer Token).
* **Path Parameters:**
    * `id` (String ObjectId, Requerido): El `_id` de la carpeta a actualizar.
* **Cuerpo de la Solicitud (Request Body - JSON):**
    ```json
    {
      "name": "Nuevo Nombre Carpeta", // Opcional
      "assignedGroupId": "NUEVO_ID_GRUPO_O_null_para_publica" // Opcional
    }
    ```
    * `name` (String, Opcional): El nuevo nombre para la carpeta.
    * `assignedGroupId` (String ObjectId o `null`, Opcional): El nuevo grupo asignado, o `null` para hacerla pública.
* **Lógica de Permisos:**
    * **Admin:** Puede actualizar cualquier carpeta.
    * **Residente/Alumno, Docente:** Solo pueden actualizar las carpetas que ellos crearon (`createdBy`).
* **Respuesta Exitosa (Código `200 OK`):**
    El objeto JSON de la carpeta actualizada (similar al formato de la respuesta de listar).
* **Respuestas de Error:**
    * `400 Bad Request`: ID de carpeta inválido, `assignedGroupId` inválido, nombre vacío, nombre duplicado en el mismo nivel.
    * `401 Unauthorized`: Token inválido o no proporcionado.
    * `403 Forbidden`: Usuario no es admin ni propietario.
    * `404 Not Found`: Carpeta no encontrada, o `assignedGroupId` (si se proporcionó) no corresponde a un grupo existente.
    * `500 Internal Server Error`: Error general del servidor.

### 4. Eliminar una Carpeta

* **Endpoint:** `/api/folders/:id`
* **Método:** `DELETE`
* **Descripción:** Elimina una carpeta existente **solo si está vacía** (no contiene archivos ni subcarpetas).
* **Autenticación:** Requerida (Bearer Token).
* **Path Parameters:**
    * `id` (String ObjectId, Requerido): El `_id` de la carpeta a eliminar.
* **Lógica de Permisos:**
    * **Admin:** Puede eliminar cualquier carpeta (si está vacía).
    * **Residente/Alumno, Docente:** Solo pueden eliminar las carpetas que ellos crearon (si están vacías).
* **Condición:** La carpeta **debe estar vacía** (no contener archivos ni subcarpetas). Esta regla aplica a **todos** los roles, incluyendo Admin.
* **Respuesta Exitosa (Código `204 No Content`):**
    Indica que la carpeta fue eliminada con éxito (o que no existía). No hay cuerpo en la respuesta.
* **Respuestas de Error:**
    * `400 Bad Request`: ID de carpeta inválido, o la carpeta no está vacía.
    * `401 Unauthorized`: Token inválido o no proporcionado.
    * `403 Forbidden`: Usuario no es admin ni propietario.
    * `500 Internal Server Error`: Error general del servidor.

---

## Archivos y Enlaces (`/api/files`)

Endpoints para gestionar los recursos individuales (archivos subidos y enlaces de video).

### 1. Listar Archivos y Enlaces por Carpeta (con Filtros y Búsqueda)

* **Endpoint:** `/api/files`
* **Método:** `GET`
* **Descripción:** Obtiene una lista de archivos y enlaces dentro de una carpeta específica, aplicando filtros opcionales y respetando los permisos de visibilidad del usuario.
* **Autenticación:** Requerida (Bearer Token).
* **Query Parameters:**
    * `folderId` (String ObjectId, **Requerido**): El `_id` de la carpeta cuyo contenido se desea listar.
    * `fileType` (String, Opcional): Filtra por tipo de archivo. Valores posibles: `pdf`, `image`, `word`, `video_link`, `other`.
    * `tags` (String, Opcional): Filtra por archivos que contengan **TODAS** las etiquetas especificadas. Se deben pasar los `_id` de las etiquetas separados por coma (ej: `?tags=ID_TAG_1,ID_TAG_2`).
    * `startDate` (String, Opcional): Filtra archivos creados desde esta fecha (inclusive). Formato: `YYYY-MM-DD`.
    * `endDate` (String, Opcional): Filtra archivos creados hasta esta fecha (inclusive). Formato: `YYYY-MM-DD`.
    * `search` (String, Opcional): Realiza una búsqueda de texto (insensible a mayúsculas/minúsculas) en los campos `filename` y `description`.
* **Lógica de Permisos:** (Aplicada sobre los resultados que coinciden con los filtros)
    * **Admin:** Ve todos los archivos/enlaces que coinciden con los filtros dentro de la carpeta especificada.
    * **Residente/Alumno ('becado'):** Ve los archivos/enlaces que coinciden con los filtros y que sean públicos (`assignedGroup: null`) O que estén asignados a un grupo al que pertenece.
    * **Docente:** Ve los archivos/enlaces que coinciden con los filtros y que hayan sido creados por él (`uploadedBy`) O que estén asignados a un grupo al que pertenece. (No ve archivos públicos creados por otros).
* **Respuesta Exitosa (Código `200 OK`):**
    Un array de objetos Archivo/Enlace que cumplen los criterios. Cada objeto incluye:
    ```json
    [
      {
        "_id": "ID_DEL_ARCHIVO_ENLACE",
        "filename": "Nombre archivo o Título enlace",
        "description": "Descripción opcional",
        "fileType": "pdf | image | word | video_link | other",
        "cloudinaryId": "ID_CLOUDINARY_O_NULL",
        "secureUrl": "URL_CLOUDINARY_O_URL_YOUTUBE",
        "size": N_BYTES_O_0,
        "folder": "ID_CARPETA_CONTENEDORA",
        "tags": [ // Populado (si tiene)
          { "_id": "ID_TAG", "name": "nombre_tag" }
        ],
        "uploadedBy": { // Populado
           "_id": "ID_USUARIO", "username": "nombre_usuario", "email": "email_usuario"
        },
        "assignedGroup": { // Populado si no es null
           "_id": "ID_GRUPO", "name": "nombre_grupo"
        }, // o null si es público
        "createdAt": "TIMESTAMP",
        "updatedAt": "TIMESTAMP"
      },
      // ... más archivos/enlaces
    ]
    ```
* **Respuestas de Error:**
    * `400 Bad Request`: Falta `folderId` o es inválido, `tags` no son ObjectIds válidos, fechas inválidas.
    * `401 Unauthorized`: Token inválido o no proporcionado.
    * `403 Forbidden`: Rol sin permisos definidos.
    * `500 Internal Server Error`: Error general del servidor.

### 2. Subir un Archivo Físico

* **Endpoint:** `/api/files/upload`
* **Método:** `POST`
* **Descripción:** Sube un archivo físico (PDF, DOCX, JPG, PNG, etc.) a Cloudinary y guarda su metadata en la base de datos.
* **Autenticación:** Requerida (Bearer Token). (Cualquier rol autenticado puede subir).
* **Cuerpo de la Solicitud (Request Body - `multipart/form-data`):**
    * `file` (**File**, Requerido): El archivo a subir.
    * `folderId` (Text - ObjectId String, Requerido): El `_id` de la carpeta destino.
    * `description` (Text, Opcional): Descripción para el archivo.
    * `tags` (Text, Opcional): Nombres de etiquetas separados por coma (ej: `"tag1, tag2"`). El backend buscará/creará estas tags y asociará sus IDs.
    * `assignedGroupId` (Text - ObjectId String, Opcional): ID del grupo al que se asignará. Si se omite, será público (visible según reglas de rol).
* **Respuesta Exitosa (Código `201 Created`):**
    El objeto JSON del nuevo registro de archivo creado en la base de datos (formato similar a la respuesta de listar, con campos populados).
* **Respuestas de Error:**
    * `400 Bad Request`: Falta archivo, falta `folderId`, `folderId` inválido, `assignedGroupId` inválido, tipo de archivo no soportado por el filtro de Multer.
    * `401 Unauthorized`: Token inválido o no proporcionado.
    * `404 Not Found`: El `folderId` o `assignedGroupId` (si se proporcionó) no existen.
    * `500 Internal Server Error`: Error durante la subida a Cloudinary o al guardar en DB.

### 3. Añadir un Enlace de Video (YouTube)

* **Endpoint:** `/api/files/add-link`
* **Método:** `POST`
* **Descripción:** Registra un enlace de video de YouTube como un recurso en la base de datos. No sube archivos a Cloudinary.
* **Autenticación:** Requerida (Bearer Token). (Cualquier rol autenticado puede añadir).
* **Cuerpo de la Solicitud (Request Body - JSON):**
    ```json
    {
      "youtubeUrl": "URL_VALIDA_DE_YOUTUBE",
      "title": "Título para el Video",
      "folderId": "ID_CARPETA_DESTINO",
      "description": "Descripción opcional", // Opcional
      "tags": "tag1, tag2, tag3", // Opcional
      "assignedGroupId": "ID_GRUPO_ASIGNADO_O_omitir" // Opcional
    }
    ```
    * `youtubeUrl` (String, Requerido): URL del video.
    * `title` (String, Requerido): Título a mostrar para este enlace.
    * `folderId` (String ObjectId, Requerido): Carpeta destino.
    * `description` (String, Opcional)
    * `tags` (String, Opcional): Nombres de etiquetas separados por coma.
    * `assignedGroupId` (String ObjectId, Opcional)
* **Respuesta Exitosa (Código `201 Created`):**
    El objeto JSON del nuevo registro de tipo `video_link` creado (formato similar a la respuesta de listar, con `cloudinaryId: null`, `size: 0`, y `secureUrl` siendo la `youtubeUrl`).
* **Respuestas de Error:**
    * `400 Bad Request`: Faltan campos requeridos, `folderId` inválido, `assignedGroupId` inválido, URL de YouTube no parece válida.
    * `401 Unauthorized`: Token inválido o no proporcionado.
    * `404 Not Found`: El `folderId` o `assignedGroupId` (si se proporcionó) no existen.
    * `500 Internal Server Error`: Error al guardar en DB.

### 4. Actualizar un Archivo/Enlace

* **Endpoint:** `/api/files/:id`
* **Método:** `PUT`
* **Descripción:** Modifica campos seleccionados de un archivo o enlace existente. No permite cambiar el archivo físico subido.
* **Autenticación:** Requerida (Bearer Token).
* **Path Parameters:**
    * `id` (String ObjectId, Requerido): El `_id` del archivo/enlace a actualizar.
* **Cuerpo de la Solicitud (Request Body - JSON):** (Incluir solo los campos a modificar)
    ```json
    {
      "filename": "Nuevo nombre/título", // Opcional
      "description": "Nueva descripción", // Opcional
      "tags": "tag1, tag_nueva", // Opcional - Reemplaza las tags existentes
      "folderId": "NUEVO_ID_CARPETA", // Opcional - Mueve a otra carpeta
      "assignedGroupId": "NUEVO_ID_GRUPO_O_null" // Opcional - Cambia asignación de grupo
    }
    ```
* **Lógica de Permisos:**
    * **Admin:** Puede actualizar cualquier archivo/enlace.
    * **Residente/Alumno, Docente:** Solo pueden actualizar los que ellos crearon/subieron (`uploadedBy`).
* **Respuesta Exitosa (Código `200 OK`):**
    El objeto JSON del archivo/enlace actualizado (formato similar a la respuesta de listar).
* **Respuestas de Error:**
    * `400 Bad Request`: ID inválido, `folderId` inválido, `assignedGroupId` inválido.
    * `401 Unauthorized`: Token inválido o no proporcionado.
    * `403 Forbidden`: Usuario no es admin ni propietario.
    * `404 Not Found`: Archivo/Enlace no encontrado, o `folderId`/`assignedGroupId` especificados no existen.
    * `500 Internal Server Error`: Error general del servidor.

### 5. Eliminar un Archivo/Enlace

* **Endpoint:** `/api/files/:id`
* **Método:** `DELETE`
* **Descripción:** Elimina un registro de archivo/enlace de la base de datos. Si es un archivo físico subido a Cloudinary, también intenta eliminarlo de Cloudinary.
* **Autenticación:** Requerida (Bearer Token).
* **Path Parameters:**
    * `id` (String ObjectId, Requerido): El `_id` del archivo/enlace a eliminar.
* **Lógica de Permisos:**
    * **Admin:** Puede eliminar cualquier archivo/enlace.
    * **Residente/Alumno, Docente:** Solo pueden eliminar los que ellos crearon/subieron.
* **Comportamiento:**
    * Busca el registro en la BD.
    * Verifica permisos.
    * Si **no** es `video_link` y tiene `cloudinaryId`, intenta llamar a `cloudinary.uploader.destroy()`.
    * Elimina el registro de la BD.
* **Respuesta Exitosa (Código `204 No Content`):**
    Indica que la eliminación fue exitosa (o que el recurso ya no existía). No hay cuerpo en la respuesta.
* **Respuestas de Error:**
    * `400 Bad Request`: ID inválido.
    * `401 Unauthorized`: Token inválido o no proporcionado.
    * `403 Forbidden`: Usuario no es admin ni propietario.
    * `500 Internal Server Error`: Error al eliminar de Cloudinary o de la BD.

---

## Etiquetas (Tags) (`/api/tags`)

Endpoints para gestionar las etiquetas (tags) que se pueden asociar a los archivos y enlaces.

### 1. Listar Todas las Etiquetas

* **Endpoint:** `/api/tags`
* **Método:** `GET`
* **Descripción:** Obtiene una lista de todas las etiquetas existentes en el sistema, ordenadas alfabéticamente.
* **Autenticación:** Requerida (Bearer Token). (Cualquier rol autenticado puede listar).
* **Query Parameters:** Ninguno.
* **Respuesta Exitosa (Código `200 OK`):**
    Un array de objetos Etiqueta. Cada objeto incluye:
    ```json
    [
      {
        "_id": "ID_DE_LA_ETIQUETA",
        "name": "nombre_etiqueta (en minúsculas)",
        "createdBy": { // Populado
          "_id": "ID_DEL_CREADOR",
          "username": "nombre_creador"
        },
        "createdAt": "TIMESTAMP",
        "updatedAt": "TIMESTAMP"
      },
      // ... más etiquetas
    ]
    ```
* **Respuestas de Error:**
    * `401 Unauthorized`: Token inválido o no proporcionado.
    * `500 Internal Server Error`: Error general del servidor.

### 2. Crear una Nueva Etiqueta

* **Endpoint:** `/api/tags`
* **Método:** `POST`
* **Descripción:** Crea una nueva etiqueta. El nombre se guarda en minúsculas y debe ser único.
* **Autenticación:** Requerida (Bearer Token). (Cualquier rol autenticado puede crear).
* **Cuerpo de la Solicitud (Request Body - JSON):**
    ```json
    {
      "name": "Nombre Nueva Etiqueta"
    }
    ```
    * `name` (String, Requerido): Nombre de la nueva etiqueta.
* **Respuesta Exitosa (Código `201 Created`):**
    El objeto JSON de la etiqueta recién creada (similar al formato de la respuesta de listar).
* **Respuestas de Error:**
    * `400 Bad Request`: Falta el nombre o la etiqueta ya existe (insensible a mayúsculas/minúsculas).
    * `401 Unauthorized`: Token inválido o no proporcionado.
    * `500 Internal Server Error`: Error general del servidor.

### 3. Actualizar una Etiqueta

* **Endpoint:** `/api/tags/:id`
* **Método:** `PUT`
* **Descripción:** Modifica el nombre de una etiqueta existente. El nuevo nombre también debe ser único y se guarda en minúsculas.
* **Autenticación:** Requerida (Bearer Token).
* **Path Parameters:**
    * `id` (String ObjectId, Requerido): El `_id` de la etiqueta a actualizar.
* **Cuerpo de la Solicitud (Request Body - JSON):**
    ```json
    {
      "name": "Nuevo Nombre Etiqueta" // Requerido
    }
    ```
* **Lógica de Permisos:**
    * **Admin:** Puede actualizar cualquier etiqueta.
    * **Residente/Alumno, Docente:** Solo pueden actualizar las etiquetas que ellos crearon (`createdBy`).
* **Respuesta Exitosa (Código `200 OK`):**
    El objeto JSON de la etiqueta actualizada (similar al formato de la respuesta de listar).
* **Respuestas de Error:**
    * `400 Bad Request`: ID de etiqueta inválido, falta el nuevo nombre, el nuevo nombre ya está en uso por otra etiqueta.
    * `401 Unauthorized`: Token inválido o no proporcionado.
    * `403 Forbidden`: Usuario no es admin ni propietario.
    * `404 Not Found`: Etiqueta no encontrada.
    * `500 Internal Server Error`: Error general del servidor.

### 4. Eliminar una Etiqueta

* **Endpoint:** `/api/tags/:id`
* **Método:** `DELETE`
* **Descripción:** Elimina una etiqueta existente. **Importante:** Al eliminar una etiqueta, también se quitará la referencia a esta etiqueta de todos los archivos/enlaces que la tuvieran asociada en su array `tags`.
* **Autenticación:** Requerida (Bearer Token).
* **Path Parameters:**
    * `id` (String ObjectId, Requerido): El `_id` de la etiqueta a eliminar.
* **Lógica de Permisos:**
    * **Admin:** Puede eliminar cualquier etiqueta.
    * **Residente/Alumno, Docente:** Solo pueden eliminar las etiquetas que ellos crearon (`createdBy`).
* **Comportamiento:**
    * Busca la etiqueta.
    * Verifica permisos.
    * Ejecuta `File.updateMany({ tags: tagId }, { $pull: { tags: tagId } })` para quitar la referencia de los archivos.
    * Elimina la etiqueta de la colección `tags`.
* **Respuesta Exitosa (Código `204 No Content`):**
    Indica que la etiqueta fue eliminada con éxito (o que no existía). No hay cuerpo en la respuesta.
* **Respuestas de Error:**
    * `400 Bad Request`: ID de etiqueta inválido.
    * `401 Unauthorized`: Token inválido o no proporcionado.
    * `403 Forbidden`: Usuario no es admin ni propietario.
    * `500 Internal Server Error`: Error al actualizar archivos o eliminar la etiqueta.

---

## Grupos (`/api/groups`)

Endpoints para la gestión de grupos de usuarios. **Nota:** Todas las operaciones de grupos implementadas actualmente requieren permisos de Administrador.

### 1. Listar Todos los Grupos

* **Endpoint:** `/api/groups`
* **Método:** `GET`
* **Descripción:** Obtiene una lista de todos los grupos existentes en el sistema, ordenados alfabéticamente. Devuelve un conteo de miembros en lugar de la lista completa de miembros para mantener la respuesta ligera.
* **Autenticación:** Requerida (Bearer Token - **Solo Administradores**).
* **Query Parameters:** Ninguno.
* **Respuesta Exitosa (Código `200 OK`):**
    Un array de objetos Grupo. Cada objeto incluye:
    ```json
    [
      {
        "_id": "ID_DEL_GRUPO",
        "name": "Nombre del Grupo",
        "description": "Descripción opcional del grupo",
        "memberCount": N_MIEMBROS, // Número de miembros en el grupo
        "createdBy": { // Populado
          "_id": "ID_DEL_ADMIN_CREADOR",
          "username": "nombre_admin_creador",
          "email": "email_admin_creador"
        },
        "createdAt": "TIMESTAMP",
        "updatedAt": "TIMESTAMP"
      },
      // ... más grupos
    ]
    ```
* **Respuestas de Error:**
    * `401 Unauthorized`: Token inválido o no proporcionado.
    * `403 Forbidden`: El usuario no es Administrador.
    * `500 Internal Server Error`: Error general del servidor.

### 2. Crear un Nuevo Grupo

* **Endpoint:** `/api/groups`
* **Método:** `POST`
* **Descripción:** Crea un nuevo grupo. El nombre debe ser único.
* **Autenticación:** Requerida (Bearer Token - **Solo Administradores**).
* **Cuerpo de la Solicitud (Request Body - JSON):**
    ```json
    {
      "name": "Nombre Nuevo Grupo",
      "description": "Descripción opcional para el grupo" // Opcional
    }
    ```
    * `name` (String, Requerido, Único): Nombre del nuevo grupo.
    * `description` (String, Opcional): Descripción del grupo.
* **Respuesta Exitosa (Código `201 Created`):**
    El objeto JSON del grupo recién creado (incluye `members: []` inicialmente).
    ```json
    {
        "_id": "ID_NUEVO_GRUPO",
        "name": "Nombre Nuevo Grupo",
        "description": "Descripción opcional para el grupo",
        "members": [],
        "createdBy": "ID_ADMIN_QUE_LO_CREO",
        "createdAt": "TIMESTAMP",
        "updatedAt": "TIMESTAMP"
    }
    ```
* **Respuestas de Error:**
    * `400 Bad Request`: Falta el nombre, o el nombre del grupo ya existe.
    * `401 Unauthorized`: Token inválido o no proporcionado.
    * `403 Forbidden`: El usuario no es Administrador.
    * `500 Internal Server Error`: Error general del servidor.

### 3. Añadir Miembro a un Grupo

* **Endpoint:** `/api/groups/:groupId/members`
* **Método:** `POST`
* **Descripción:** Añade un usuario existente como miembro a un grupo existente. Agrega el ID del usuario al array `members` del grupo y el ID del grupo al array `groups` del usuario. Utiliza `$addToSet` para evitar duplicados.
* **Autenticación:** Requerida (Bearer Token - **Solo Administradores**).
* **Path Parameters:**
    * `groupId` (String ObjectId, Requerido): El `_id` del grupo al que se añadirá el miembro.
* **Cuerpo de la Solicitud (Request Body - JSON):**
    ```json
    {
      "userId": "ID_DEL_USUARIO_A_AÑADIR"
    }
    ```
    * `userId` (String ObjectId, Requerido): El `_id` del usuario a añadir al grupo.
* **Respuesta Exitosa (Código `200 OK`):**
    Un objeto JSON con un mensaje de éxito y los datos del grupo actualizado (incluyendo `memberCount` recalculado y `createdBy` populado).
    ```json
    {
        "message": "Miembro añadido correctamente.",
        "group": {
            "_id": "ID_DEL_GRUPO",
            "name": "Nombre del Grupo",
            "description": "...",
            "memberCount": N_NUEVO_MIEMBROS,
            // members array NO se devuelve aquí por defecto
            "createdBy": { "_id": "...", "username": "..." },
            "createdAt": "...",
            "updatedAt": "..."
        }
    }
    ```
* **Respuestas de Error:**
    * `400 Bad Request`: Falta `userId` o los IDs (`groupId`, `userId`) son inválidos.
    * `401 Unauthorized`: Token inválido o no proporcionado.
    * `403 Forbidden`: El usuario no es Administrador.
    * `404 Not Found`: Grupo o Usuario no encontrado.
    * `500 Internal Server Error`: Error general del servidor.

### 4. Quitar Miembro de un Grupo

* **Endpoint:** `/api/groups/:groupId/members/:userId`
* **Método:** `DELETE`
* **Descripción:** Quita a un usuario de un grupo. Elimina el ID del usuario del array `members` del grupo y el ID del grupo del array `groups` del usuario. Utiliza `$pull`.
* **Autenticación:** Requerida (Bearer Token - **Solo Administradores**).
* **Path Parameters:**
    * `groupId` (String ObjectId, Requerido): El `_id` del grupo.
    * `userId` (String ObjectId, Requerido): El `_id` del usuario a quitar.
* **Cuerpo de la Solicitud:** Ninguno.
* **Respuesta Exitosa (Código `200 OK`):**
    Un objeto JSON con un mensaje de éxito y los datos del grupo actualizado (incluyendo `memberCount` recalculado y `createdBy` populado). (Formato similar a la respuesta de añadir miembro).
* **Respuestas de Error:**
    * `400 Bad Request`: IDs (`groupId`, `userId`) inválidos.
    * `401 Unauthorized`: Token inválido o no proporcionado.
    * `403 Forbidden`: El usuario no es Administrador.
    * `404 Not Found`: Grupo no encontrado (no necesita verificar si el usuario existe o si era miembro).
    * `500 Internal Server Error`: Error general del servidor.

---
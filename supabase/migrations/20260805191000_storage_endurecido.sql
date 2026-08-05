-- =============================================================
-- Buckets: qué se puede subir y cuánto puede pesar
--
-- `org-assets` es público a propósito: el logo aparece en la cotización
-- que abre el cliente del cliente, que no tiene sesión. Lo que no puede
-- ser es que acepte cualquier formato. Un .html ahí queda servido desde
-- el dominio de storage y se ejecuta al abrirlo — un XSS almacenado con
-- nuestra marca encima. El SVG queda fuera por lo mismo: es XML y admite
-- <script> adentro. Un logo en PNG o WebP se ve igual y no ejecuta nada.
--
-- Hasta ahora el único camino de subida era el logo desde Configuración,
-- así que el riesgo dependía de que nadie agregara otro. Esto lo cierra
-- en la base y deja de depender de eso.
--
-- `work-order-files` es privado y de una imprenta: pueden ser .ai, .psd,
-- .cdr o PDF de cientos de megas. Restringir el tipo ahí rompería el
-- trabajo real, así que solo lleva un techo de tamaño generoso para que
-- una subida no se lleve el disco por delante.
-- =============================================================

update storage.buckets
set allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp'],
    file_size_limit = 5242880          -- 5 MB
where id = 'org-assets';

update storage.buckets
set file_size_limit = 209715200        -- 200 MB
where id = 'work-order-files';

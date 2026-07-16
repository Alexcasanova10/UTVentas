

const express = require("express");
const vendedorRoute = express.Router();
const AsyncHandler = require("express-async-handler");
const { Producto, Categoria, ProductoImagen, sequelize } = require("../../models");
const { proteger, verificarRol } = require("../../middlewares/authMiddleware");

// ==========================================
// API CREAR PRODUCTO (POST /productos)
// ==========================================
vendedorRoute.post(
  "/crear",
  proteger,
  verificarRol(["Vendedor"]),
  AsyncHandler(async (req, res) => {
    const transaction = await sequelize.transaction();

    try {
      const {
        titulo,
        descripcion,
        precio,
        categoria_nombre, // <-- Ahora recibimos el nombre de la categoría en lugar del ID
        contacto_telefono,
        contacto_metodo,
        imagenes 
      } = req.body;

      // 1. Validaciones de campos obligatorios
      if (!titulo || !descripcion || precio === undefined || !categoria_nombre) {
        await transaction.rollback();
        return res.status(400).json({
          success: false,
          message: "Los campos título, descripción, precio y categoría_nombre son obligatorios"
        });
      }

      // 2. Buscar la categoría por su nombre (insensible a mayúsculas/minúsculas)
      const categoriaEncontrada = await Categoria.findOne({
        where: sequelize.where(
          sequelize.fn('lower', sequelize.col('nombre')),
          categoria_nombre.toLowerCase()
        ),
        transaction
      });

      if (!categoriaEncontrada) {
        await transaction.rollback();
        return res.status(400).json({
          success: false,
          message: `La categoría '${categoria_nombre}' no existe. Asegúrate de escribirla correctamente.`
        });
      }

      // 3. Determinar el teléfono de contacto
      const telefonoFinal = contacto_telefono || req.usuario.telefono_defecto;
      if (!telefonoFinal) {
        await transaction.rollback();
        return res.status(400).json({
          success: false,
          message: "Se requiere un teléfono de contacto. Define uno en la petición o actualiza tu perfil"
        });
      }

      // 4. Crear el Producto usando el id de la categoría que encontramos
      const nuevoProducto = await Producto.create({
        usuario_id: req.usuario.id, 
        categoria_id: categoriaEncontrada.categoria_id, // <-- ID obtenido dinámicamente
        titulo: titulo,
        descripcion: descripcion,
        precio: precio,
        contacto_telefono: telefonoFinal,
        contacto_metodo: contacto_metodo || 'whatsapp',
        es_activo: true,
        es_premium: false 
      }, { transaction });

      // 5. Registrar las imágenes si fueron enviadas
      let imagenesRegistradas = [];
      if (imagenes && Array.isArray(imagenes) && imagenes.length > 0) {
        
        const datosImagenes = imagenes.map((img, index) => {
          return {
            producto_id: nuevoProducto.producto_id,
            url_imagen: img.url,
            es_principal: img.es_principal !== undefined ? img.es_principal : (index === 0)
          };
        });

        // Asegurarnos de que al menos una sea principal
        const tienePrincipal = datosImagenes.some(img => img.es_principal === true);
        if (!tienePrincipal && datosImagenes.length > 0) {
          datosImagenes[0].es_principal = true;
        }

        imagenesRegistradas = await ProductoImagen.bulkCreate(datosImagenes, { transaction });
      }

      await transaction.commit();

      return res.status(201).json({
        success: true,
        message: "¡Producto publicado exitosamente en el marketplace de la UTJ!",
        data: {
          producto: {
            producto_id: nuevoProducto.producto_id,
            titulo: nuevoProducto.titulo,
            descripcion: nuevoProducto.descripcion,
            precio: nuevoProducto.precio,
            contacto_telefono: nuevoProducto.contacto_telefono,
            contacto_metodo: nuevoProducto.contacto_metodo,
            categoria_nombre: categoriaEncontrada.nombre, // Devolvemos el nombre formateado
            es_activo: nuevoProducto.es_activo,
            fecha_publicacion: nuevoProducto.fecha_publicacion
          },
          imagenes: imagenesRegistradas
        }
      });

    } catch (error) {
      if (transaction && !transaction.finished) {
        await transaction.rollback();
      }
      console.error("Error al crear producto con categoría por nombre:", error);
      return res.status(500).json({
        success: false,
        message: "Error interno del servidor al publicar el producto"
      });
    }
  })
);


// ==========================================
// API EDITAR PRODUCTO (PUT /productos/editar/:id)
// ==========================================
vendedorRoute.put(
  "/editar/:id",
  proteger,
  verificarRol(["Vendedor"]),
  AsyncHandler(async (req, res) => {
    const transaction = await sequelize.transaction();

    try {
      const productoId = req.params.id;
      const {
        titulo,
        descripcion,
        precio,
        es_activo,
        categoria_nombre,
        contacto_telefono,
        contacto_metodo,
        imagenes // Array de URLs: [{ url: "...", es_principal: true/false }]
      } = req.body;

      // 1. Buscar el producto existente
      const producto = await Producto.findByPk(productoId, { transaction });

      if (!producto) {
        await transaction.rollback();
        return res.status(404).json({
          success: false,
          message: "El producto que intentas editar no existe"
        });
      }

      // 2. Control de Acceso: Verificar que el producto le pertenezca al vendedor que hace la petición
      if (producto.usuario_id !== req.usuario.id) {
        await transaction.rollback();
        return res.status(403).json({
          success: false,
          message: "No tienes permisos para editar este producto porque no eres el propietario"
        });
      }

      // 3. Objeto con campos a actualizar
      const camposActualizar = {};

      if (titulo !== undefined) camposActualizar.titulo = titulo;
      if (descripcion !== undefined) camposActualizar.descripcion = descripcion;
      if (precio !== undefined) camposActualizar.precio = precio;
      if (es_activo !== undefined) camposActualizar.es_activo = es_activo;
      if (contacto_telefono !== undefined) camposActualizar.contacto_telefono = contacto_telefono;
      if (contacto_metodo !== undefined) camposActualizar.contacto_metodo = contacto_metodo;

      // 4. Si actualizan la categoría por nombre
      if (categoria_nombre) {
        const categoriaEncontrada = await Categoria.findOne({
          where: sequelize.where(
            sequelize.fn('lower', sequelize.col('nombre')),
            categoria_nombre.toLowerCase()
          ),
          transaction
        });

        if (!categoriaEncontrada) {
          await transaction.rollback();
          return res.status(400).json({
            success: false,
            message: `La categoría '${categoria_nombre}' no existe`
          });
        }
        camposActualizar.categoria_id = categoriaEncontrada.categoria_id;
      }

      // Actualizar los datos del producto
      await producto.update(camposActualizar, { transaction });

      // 5. Manejo y actualización de imágenes (si se envían en la petición)
      let nuevasImagenes = [];
      if (imagenes && Array.isArray(imagenes)) {
        // Eliminamos las imágenes anteriores asociadas a este producto
        await ProductoImagen.destroy({
          where: { producto_id: producto.producto_id },
          transaction
        });

        if (imagenes.length > 0) {
          const datosImagenes = imagenes.map((img, index) => {
            return {
              producto_id: producto.producto_id,
              url_imagen: img.url,
              es_principal: img.es_principal !== undefined ? img.es_principal : (index === 0)
            };
          });

          // Asegurar que al menos una imagen sea la principal
          const tienePrincipal = datosImagenes.some(img => img.es_principal === true);
          if (!tienePrincipal) {
            datosImagenes[0].es_principal = true;
          }

          nuevasImagenes = await ProductoImagen.bulkCreate(datosImagenes, { transaction });
        }
      } else {
        // Si no se enviaron imágenes nuevas, recuperamos las existentes para retornarlas en la respuesta
        nuevasImagenes = await ProductoImagen.findAll({
          where: { producto_id: producto.producto_id },
          transaction
        });
      }

      await transaction.commit();

      // Consultar el nombre final de la categoría para la respuesta de cara al frontend
      const categoriaFinal = await Categoria.findByPk(producto.categoria_id);

      return res.status(200).json({
        success: true,
        message: "¡Producto actualizado exitosamente!",
        data: {
          producto: {
            producto_id: producto.producto_id,
            titulo: producto.titulo,
            descripcion: producto.descripcion,
            precio: producto.precio,
            es_activo: producto.es_activo,
            contacto_telefono: producto.contacto_telefono,
            contacto_metodo: producto.contacto_metodo,
            categoria_nombre: categoriaFinal ? categoriaFinal.nombre : null,
            fecha_publicacion: producto.fecha_publicacion
          },
          imagenes: nuevasImagenes
        }
      });

    } catch (error) {
      if (transaction && !transaction.finished) {
        await transaction.rollback();
      }
      console.error("Error al editar el producto:", error);
      return res.status(500).json({
        success: false,
        message: "Error interno del servidor al editar el producto"
      });
    }
  })
);

// ==========================================
// API ELIMINAR PRODUCTO (DELETE /productos/eliminar/:id)
// ==========================================
vendedorRoute.delete(
  "/eliminar/:id",
  proteger,
  verificarRol(["Vendedor"]),
  AsyncHandler(async (req, res) => {
    const transaction = await sequelize.transaction();

    try {
      const productoId = req.params.id;

      // 1. Buscar el producto existente
      const producto = await Producto.findByPk(productoId, { transaction });

      if (!producto) {
        await transaction.rollback();
        return res.status(404).json({
          success: false,
          message: "El producto que intentas eliminar no existe"
        });
      }

      // 2. Control de Acceso: Verificar que el producto pertenezca al vendedor logueado
      if (producto.usuario_id !== req.usuario.id) {
        await transaction.rollback();
        return res.status(403).json({
          success: false,
          message: "No tienes permisos para eliminar este producto porque no eres el propietario"
        });
      }

      // 3. Eliminar el producto
      // Gracias al onDelete: 'CASCADE', esto borrará en automático las fotos en producto_imagenes
      await producto.destroy({ transaction });

      await transaction.commit();

      return res.status(200).json({
        success: true,
        message: "¡Producto y sus imágenes asociadas eliminados correctamente del marketplace!"
      });

    } catch (error) {
      if (transaction && !transaction.finished) {
        await transaction.rollback();
      }
      console.error("Error al eliminar el producto:", error);
      return res.status(500).json({
        success: false,
        message: "Error interno del servidor al eliminar el producto"
      });
    }
  })
);


module.exports = vendedorRoute;


 
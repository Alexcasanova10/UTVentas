const express = require("express");
const adminRoute = express.Router();
const AsyncHandler = require("express-async-handler");
const { sequelize, Usuario, Rol, Categoria, Pedido, Disputa, HistoricoPedido } = require('../../models');
const { Op } = require('sequelize');
const bcrypt = require('bcrypt'); // 🔑 Asegúrate de tener instalado bcrypt
const { proteger, verificarRol } = require("../../middlewares/authMiddleware");
require('dotenv').config();


// Helper para autenticarse con la API de PayPal Sandbox
const obtenerPaypalAccessToken = async () => {
  const auth = Buffer.from(`${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_SECRET}`).toString("base64");
  const response = await fetch(`${process.env.PAYPAL_API_URL}/v1/oauth2/token`, {
    method: "POST",
    body: "grant_type=client_credentials",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded"
    }
  });
  const data = await response.json();
  return data.access_token;
};



// =========================================================================
// REGISTRAR NUEVO USUARIO ADMINISTRADOR (POST /api/admins/crear-admin)
// =========================================================================
adminRoute.post(
  "/crear-admin",
  proteger,
  verificarRol(["Administrador"]), // Solo un admin existente puede crear a otro admin
  AsyncHandler(async (req, res) => {
    const { nombre, correo, contrasena, telefono_defecto } = req.body;

    // 1. Validaciones básicas de campos obligatorios
    if (!nombre || !correo || !contrasena) {
      return res.status(400).json({ 
        success: false, 
        message: "Nombre, correo y contraseña son obligatorios." 
      });
    }

    // 2. Verificar si el correo ya está registrado en la base de datos
    const usuarioExistente = await Usuario.findOne({ where: { correo } });
    if (usuarioExistente) {
      return res.status(400).json({ 
        success: false, 
        message: "El correo ya se encuentra registrado." 
      });
    }

    // 3. Buscar dinámicamente el ID del rol "Administrador"
    const rolAdmin = await Rol.findOne({ where: { nombre: "Administrador" } });
    if (!rolAdmin) {
      return res.status(500).json({ 
        success: false, 
        message: "Error de configuración: El rol 'Administrador' no existe en la base de datos." 
      });
    }

    // 4. Encriptar la contraseña (Salting & Hashing)
    const saltRounds = 10;
    const contrasena_hash = await bcrypt.hash(contrasena, saltRounds);

    // 5. Crear el usuario Administrador directamente verificado
    const nuevoAdmin = await Usuario.create({
      nombre,
      correo,
      contrasena_hash,
      telefono_defecto: telefono_defecto || null,
      rol_id: rolAdmin.rol_id, // Asignamos el ID del rol encontrado
      es_verificado: true      // Se marca como true directo por ser cuenta interna de staff
    });

    // 6. Respuesta limpia (ocultamos el hash por seguridad)
    return res.status(201).json({
      success: true,
      message: "Usuario administrador creado exitosamente.",
      usuario: {
        usuario_id: nuevoAdmin.usuario_id,
        nombre: nuevoAdmin.nombre,
        correo: nuevoAdmin.correo,
        rol: "Administrador",
        es_verificado: nuevoAdmin.es_verificado,
        fecha_registro: nuevoAdmin.fecha_registro
      }
    });
  })
);

// =========================================================================
// 1. CREAR CATEGORÍA (POST /api/admins/categorias)
// =========================================================================
adminRoute.post(
  "/categorias",
  proteger,
  verificarRol(["Administrador"]),
  AsyncHandler(async (req, res) => {
    const { nombre } = req.body;

    if (!nombre || nombre.trim() === "") {
      return res.status(400).json({
        success: false,
        message: "El nombre de la categoría es obligatorio."
      });
    }

    // Validar si ya existe una categoría con ese nombre (evitar conflicto por el 'unique')
    const categoriaExistente = await Categoria.findOne({ 
      where: { nombre: nombre.trim() } 
    });

    if (categoriaExistente) {
      return res.status(400).json({
        success: false,
        message: "Ya existe una categoría con ese nombre."
      });
    }

    const nuevaCategoria = await Categoria.create({
      nombre: nombre.trim()
    });

    return res.status(201).json({
      success: true,
      message: "Categoría creada exitosamente.",
      data: nuevaCategoria
    });
  })
);

// =========================================================================
// 2. LEER/OBTENER TODAS LAS CATEGORÍAS (GET /api/admins/categorias)
// =========================================================================
adminRoute.get(
  "/categorias",
  proteger,
  verificarRol(["Administrador"]),
  AsyncHandler(async (req, res) => {
    const categorias = await Categoria.findAll({
      order: [["nombre", "ASC"]] // Ordenadas alfabéticamente
    });

    return res.status(200).json({
      success: true,
      data: categorias
    });
  })
);

// =========================================================================
// 3. ACTUALIZAR CATEGORÍA (PUT /api/admins/categorias/:categoria_id)
// =========================================================================
adminRoute.put(
  "/categorias/:categoria_id",
  proteger,
  verificarRol(["Administrador"]),
  AsyncHandler(async (req, res) => {
    const { categoria_id } = req.params;
    const { nombre } = req.body;

    if (!nombre || nombre.trim() === "") {
      return res.status(400).json({
        success: false,
        message: "El nuevo nombre de la categoría no puede estar vacío."
      });
    }

    const categoria = await Categoria.findByPk(categoria_id);
    if (!categoria) {
      return res.status(404).json({
        success: false,
        message: "La categoría que deseas actualizar no existe."
      });
    }

    // Verificar si el nuevo nombre ya lo tiene otra categoría distinta
    const duplicado = await Categoria.findOne({
      where: {
        nombre: nombre.trim(),
        categoria_id: { [Op.ne]: categoria_id } // Excluir la categoría actual
      }
    });

    if (duplicado) {
      return res.status(400).json({
        success: false,
        message: "Ya existe otra categoría registrada con ese nombre."
      });
    }

    categoria.nombre = nombre.trim();
    await categoria.save();

    return res.status(200).json({
      success: true,
      message: "Categoría actualizada correctamente.",
      data: categoria
    });
  })
);

// =========================================================================
// 4. ELIMINAR CATEGORÍA (DELETE /api/admins/categorias/:categoria_id)
// =========================================================================
adminRoute.delete(
  "/categorias/:categoria_id",
  proteger,
  verificarRol(["Administrador"]),
  AsyncHandler(async (req, res) => {
    const { categoria_id } = req.params;

    const categoria = await Categoria.findByPk(categoria_id);
    if (!categoria) {
      return res.status(404).json({
        success: false,
        message: "La categoría que deseas eliminar no existe."
      });
    }

    // Nota: Por tus relaciones (onDelete: 'SET NULL'), los productos que 
    // pertenecían a esta categoría pasarán automáticamente a tener 'categoria_id: null'.
    await categoria.destroy();

    return res.status(200).json({
      success: true,
      message: "Categoría eliminada del sistema correctamente."
    });
  })
);

// =========================================================================
// 5. LISTAR TODAS LAS DISPUTAS (GET /api/admins/disputas)
// =========================================================================
// Permite al administrador ver todos los casos abiertos o cerrados en la app.
// =========================================================================
adminRoute.get("/disputas",
    proteger,
    verificarRol(["Administrador"]),
    AsyncHandler(async(req,res)=>{

        try{

            const disputas = await Disputa.findAll();

            // const disputas = await Disputa.findAll({
            //     include:[
            //         {
            //             model:Pedido
            //         },
            //           {
            //             model:Usuario,
            //             as:"Comprador"
            //           },
            //           {
            //             model:Usuario,
            //             as:"Vendedor"
            //           }
            //     ]
            // });

            return res.status(200).json({
                success:true,
                data:disputas
            });

        }catch(error){

            console.log(error);
            return res.status(500).json({
                success:false,
                error:error.message,
                stack:error.stack
            });

        }

    })
);

// =========================================================================
// 6. RESOLVER DISPUTA (PUT /api/admins/disputas/:disputa_id/resolver)
// =========================================================================
// Dictamina el caso, ejecuta la acción física en PayPal y actualiza los estados.
// =========================================================================
adminRoute.put("/disputas/:disputa_id/resolver",
  proteger,
  verificarRol(["Administrador"]),
  AsyncHandler(async (req, res) => {
    const adminId = req.usuario.id;
    const { disputa_id } = req.params;
    const { veredicto, resolucion_texto } = req.body; // veredicto: 'REEMBOLSO' o 'PAGO_VENDEDOR'

    if (!veredicto || !["REEMBOLSO", "PAGO_VENDEDOR"].includes(veredicto)) {
      return res.status(400).json({ 
        success: false, 
        message: "El veredicto es obligatorio y debe ser 'REEMBOLSO' o 'PAGO_VENDEDOR'." 
      });
    }

    if (!resolucion_texto || resolucion_texto.trim() === "") {
      return res.status(400).json({ 
        success: false, 
        message: "Debes redactar una justificación/resolución de texto para cerrar el caso." 
      });
    }

    const disputa = await Disputa.findByPk(disputa_id, { include: [Pedido] });
    if (!disputa) {
      return res.status(404).json({ success: false, message: "La disputa solicitada no existe." });
    }

    if (disputa.estado !== "abierta" && disputa.estado !== "en_investigacion") {
      return res.status(400).json({ success: false, message: "Esta disputa ya fue resuelta o cerrada previamente." });
    }

    const pedido = disputa.Pedido;
    if (!pedido) {
      return res.status(404).json({ success: false, message: "El pedido asociado a esta disputa no fue localizado." });
    }

    const transaction = await sequelize.transaction();
    try {
      const accessToken = await obtenerPaypalAccessToken();

      if (veredicto === "REEMBOLSO") {
        // 🛍️ CASO A: REEMBOLSO (Liberar los fondos retenidos en PayPal)
        // Hacemos un VOID de la autorización para que PayPal regrese el saldo al comprador
        const urlVoid = `${process.env.PAYPAL_API_URL}/v2/payments/authorizations/${pedido.paypal_capture_id}/void`;
        const responsePaypal = await fetch(urlVoid, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json"
          }
        });

        if (responsePaypal.status !== 204 && responsePaypal.status !== 200) {
          const errorJson = await responsePaypal.json();
          await transaction.rollback();
          return res.status(400).json({ success: false, message: "PayPal rechazó la cancelación de fondos", detalles: errorJson });
        }

        // Actualizar estados locales
        await disputa.update({
          estado: "resuelta_reembolso",
          resolucion_texto: resolucion_texto.trim(),
          admin_id: adminId,
          fecha_resolucion: new Date()
        }, { transaction });

        await pedido.update({ estado: "cancelado_reembolsado" }, { transaction });

      } else {
        // 💰 CASO B: PAGO AL VENDEDOR (Forzar la captura de los fondos en PayPal)
        const urlCapture = `${process.env.PAYPAL_API_URL}/v2/payments/authorizations/${pedido.paypal_capture_id}/capture`;
        const responsePaypal = await fetch(urlCapture, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({})
        });

        const datosCaptura = await responsePaypal.json();

        if (datosCaptura.status !== "COMPLETED") {
          await transaction.rollback();
          return res.status(400).json({ success: false, message: "PayPal no pudo liquidar los fondos al vendedor", detalles: datosCaptura });
        }

        // Actualizar estados locales
        await disputa.update({
          estado: "resuelta_pago_vendedor",
          resolucion_texto: resolucion_texto.trim(),
          admin_id: adminId,
          fecha_resolucion: new Date()
        }, { transaction });

        await pedido.update({ estado: "entregado_completado" }, { transaction });
      }

      await transaction.commit();
      return res.status(200).json({
        success: true,
        message: `Disputa resuelta exitosamente con veredicto: ${veredicto}. Sincronizado con PayPal.`
      });

    } catch (error) {
      if (transaction && !transaction.finished) await transaction.rollback();
      console.error("Error al resolver disputa:", error);
      return res.status(500).json({ success: false, message: "Error interno al procesar la resolución." });
    }
  })
);

// =========================================================================
// 7. VER LOGS DE AUDITORÍA (GET /api/admins/auditoria-pedidos)
// =========================================================================
// Permite consultar la bitácora de cambios de estados en los pedidos.
// Soporta filtrado opcional por pedido: GET /api/admins/auditoria-pedidos?pedido_id=12
// =========================================================================
adminRoute.get("/auditoria-pedidos",
  proteger,
  verificarRol(["Administrador"]),
  AsyncHandler(async (req, res) => {
    const { pedido_id } = req.query;

    // Construimos la condición WHERE dinámicamente si envían un pedido_id
    const donde = {};
    if (pedido_id) {
      donde.pedido_id = pedido_id;
    }

    const logsAuditoria = await HistoricoPedido.findAll({
      where: donde,
      include: [
        {
          model: Pedido,
          attributes: ["pedido_id", "precio_final", "estado"]
        },
        {
          model: Usuario,
          as: "UsuarioAccion", // Usamos el alias definido en tus relaciones
          attributes: ["usuario_id", "nombre", "correo"]
        }
      ],
      order: [["fecha_cambio", "DESC"]] // Ver los cambios más recientes primero
    });

    return res.status(200).json({
      success: true,
      total_registros: logsAuditoria.length,
      data: logsAuditoria
    });
  })
);












module.exports = adminRoute;
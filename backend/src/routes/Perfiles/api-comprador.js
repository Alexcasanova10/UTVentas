const express = require("express");
const compradorRoute = express.Router();
const AsyncHandler = require("express-async-handler");
const { Pedido, Usuario, Producto } = require("../../models");
const { proteger, verificarRol } = require("../../middlewares/authMiddleware");

// ======================================================================
// HISTORIAL DE COMPRAS
// ======================================================================

compradorRoute.get(
  "/mis-compras",
  proteger,
  verificarRol(["Comprador"]),
  AsyncHandler(async (req, res) => {

    const compradorId = req.usuario.id;

    const compras = await Pedido.findAll({
      where: {
        comprador_id: compradorId
      },
      include: [
        {
          model: Producto,
          attributes: [
            "producto_id",
            "titulo",
            "precio"
          ]
        },
        {
          model: Usuario,
          as: "Vendedor",
          attributes: [
            "usuario_id",
            "nombre",
            "correo"
          ]
        }
      ],
      order: [["fecha_creacion", "DESC"]]
    });

    return res.status(200).json({
      success: true,
      message: "Historial obtenido correctamente.",
      compras
    });

  })
);

// ======================================================================
// DETALLE DE UNA COMPRA
// ======================================================================

compradorRoute.get(
  "/mis-compras/:pedido_id",
  proteger,
  verificarRol(["Comprador"]),
  AsyncHandler(async (req, res) => {

    const compradorId = req.usuario.id;
    const { pedido_id } = req.params;

    const compra = await Pedido.findOne({
      where: {
        pedido_id,
        comprador_id: compradorId
      },
      include: [
        {
          model: Producto,
          attributes: [
            "producto_id",
            "titulo",
            "descripcion",
            "precio"
          ]
        },
        {
          model: Usuario,
          as: "Vendedor",
          attributes: [
            "usuario_id",
            "nombre",
            "correo"
          ]
        }
      ]
    });

    if (!compra) {
      return res.status(404).json({
        success: false,
        message: "Compra no encontrada."
      });
    }

    return res.status(200).json({
      success: true,
      compra
    });

  })
);

module.exports = compradorRoute;
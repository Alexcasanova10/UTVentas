const express = require("express");
const usuarioRoute = express.Router();
const AsyncHandler = require("express-async-handler");

const { Usuario, Rol, sequelize} = require("../../models"); // Importación desde el index de modelos

const { 
  proteger,
  verificarRol,
  verificarRolId} = require("../../middlewares/authMiddleware");
const { Op } = require('sequelize'); // Asegúrate de tener Op importado

const generateToken = require("../../tokenGenerate");
const bcrypt = require('bcryptjs');
require('dotenv').config();
 

// API DE REGISTRO DE USUARIO
 

// API LOGIN
 

// API LOGOUT 
usuarioRoute.post("/logout", 
    AsyncHandler(async (req, res) => {
        try {
            // Opción 1: Si estás usando sesiones (express-session)
            if (req.session) {
                req.session.destroy((err) => {
                    if (err) {
                        console.error('Error destruyendo sesión:', err);
                        return res.status(500).json({
                            success: false,
                            message: "Error al cerrar sesión"
                        });
                    }
                    
                    // Limpiar cookie de sesión
                    res.clearCookie('connect.sid'); // Nombre por defecto de la cookie de sesión
                    
                    return res.json({
                        success: true,
                        message: "Sesión cerrada exitosamente"
                    });
                });
            } 
            // Opción 2: Si solo usas JWT (el logout es client-side)
            else {
                // Con JWT, el logout se maneja del lado del cliente eliminando el token
                // Pero podemos dar una respuesta exitosa
                return res.json({
                    success: true,
                    message: "Sesión cerrada exitosamente. Elimina el token del lado del cliente."
                });
            }
        } catch (error) {
            console.error('Error en logout:', error);
            res.status(500).json({
                success: false,
                message: "Error interno del servidor"
            });
        }
    })
);

// API PERFIL
 
 

module.exports = usuarioRoute;
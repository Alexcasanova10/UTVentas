
const express = require("express");
const usuarioRoute = express.Router();
const AsyncHandler = require("express-async-handler");
const { Usuario, Rol, sequelize } = require("../../models"); // Importación unificada desde tu index.js de modelos
const bcrypt = require('bcryptjs');
const nodemailer = require('nodemailer');
require('dotenv').config();

// Almacenamiento temporal en memoria para los códigos de verificación (correo -> { codigo, expiracion })
// Nota: En producción esto se puede mover a Redis o a una tabla temporal en la base de datos
const codigosTemporales = {};

// Configuración del transportador de Nodemailer (usa variables de entorno de tu .env)
const transporter = nodemailer.createTransport({
    service: 'gmail', // Puedes cambiarlo por tu proveedor SMTP (Outlook, Gmail, etc.)
    auth: {
        user: process.env.EMAIL_USER, // Tu correo de envíos (ej: utventas.soporte@gmail.com)
        pass: process.env.EMAIL_PASS  // Tu contraseña de aplicación (App Password)
    }
});

// ==========================================
// 1. API PARA SOLICITAR CÓDIGO DE VERIFICACIÓN
// ==========================================
usuarioRoute.post("/solicitar-codigo", AsyncHandler(async (req, res) => {
    const { correo } = req.body;

    if (!correo) {
        return res.status(400).json({
            success: false,
            message: "El correo electrónico es requerido"
        });
    }

    // EXCLUSIVO UTJ: Expresión regular para validar exactamente 10 dígitos seguido de @soy.utj.edu.mx
    const utjEmailRegex = /^\d{10}@soy\.utj\.edu\.mx$/;
    if (!utjEmailRegex.test(correo)) {
        return res.status(400).json({
            success: false,
            message: "El correo debe tener el formato institucional de la UTJ (Ej: 2123300393@soy.utj.edu.mx)"
        });
    }

    // Verificar si el correo ya está registrado en la base de datos
    const usuarioExistente = await Usuario.findOne({ where: { correo } });
    if (usuarioExistente) {
        return res.status(400).json({
            success: false,
            message: "Este correo electrónico ya se encuentra registrado"
        });
    }

    // Generar un código aleatorio de 6 dígitos
    const codigoVerificacion = Math.floor(100000 + Math.random() * 900000).toString();
    
    // Guardar el código con una validez de 20 minutos
    codigosTemporales[correo] = {
        codigo: codigoVerificacion,
        expiracion: Date.now() + 20 * 60 * 1000 // 20 minutos
    };

    // Plantilla de correo para el estudiante
    const mailOptions = {
        from: `"UTVentas Soporte" <${process.env.EMAIL_USER}>`,
        to: correo,
        subject: "Código de Verificación - UTVentas",
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 8px; padding: 20px;">
                <h2 style="color: #17a987; text-align: center;">¡Bienvenido a UTVentas!</h2>
                <p>Estás a un paso de unirte al marketplace exclusivo de la comunidad de la UTJ.</p>
                <p>Usa el siguiente código para completar tu registro en la plataforma:</p>
                <div style="background-color: #f8f9fa; border: 1px dashed #17a987; padding: 15px; text-align: center; font-size: 24px; font-weight: bold; letter-spacing: 5px; color: #333; margin: 20px 0; border-radius: 4px;">
                    ${codigoVerificacion}
                </div>
                <p style="font-size: 12px; color: #666; text-align: center;">Este código expirará en 10 minutos.</p>
            </div>
        `
    };

    // Enviar el correo electrónico
    try {
        await transporter.sendMail(mailOptions);
        res.status(200).json({
            success: true,
            message: "Código de verificación enviado con éxito a tu correo de la UTJ"
        });
    } catch (error) {
        console.error("Error al enviar el correo:", error);
        return res.status(500).json({
            success: false,
            message: "No se pudo enviar el correo de verificación. Inténtalo más tarde."
        });
    }
}));


/* vieja API
usuarioRoute.post("/registro-usuario", AsyncHandler(async (req, res) => {
    const transaction = await sequelize.transaction();
    
    try {
        const { nombre, correo, password, rol_id, codigo, telefono_defecto } = req.body;

        // Validaciones de campos obligatorios
        if (!nombre || !correo || !password || !rol_id || !codigo) {
            await transaction.rollback();
            return res.status(400).json({
                success: false,
                message: "Todos los campos son obligatorios: nombre, correo, password, rol_id, codigo"
            });
        }

        // Validar tamaño de contraseña
        if (password.length < 6) {
            await transaction.rollback();
            return res.status(400).json({
                success: false,
                message: "La contraseña debe tener al menos 6 caracteres"
            });
        }

        // VALIDAR EL CÓDIGO DE VERIFICACIÓN ENVIADO AL CORREO
        const datosCodigo = codigosTemporales[correo];
        if (!datosCodigo) {
            await transaction.rollback();
            return res.status(400).json({
                success: false,
                message: "No se ha solicitado ningún código para este correo o ya expiró"
            });
        }

        if (datosCodigo.expiracion < Date.now()) {
            delete codigosTemporales[correo]; // Limpiar código expirado
            await transaction.rollback();
            return res.status(400).json({
                success: false,
                message: "El código de verificación ha expirado, solicita uno nuevo"
            });
        }

        if (datosCodigo.codigo !== codigo) {
            await transaction.rollback();
            return res.status(400).json({
                success: false,
                message: "El código de verificación ingresado es incorrecto"
            });
        }

        // 1. Verificar que el rol ingresado existe en la base de datos
        const rolExistente = await Rol.findByPk(rol_id, { transaction });
        if (!rolExistente) {
            await transaction.rollback();
            return res.status(400).json({
                success: false,
                message: `El rol seleccionado con ID ${rol_id} no existe`
            });
        }

        // Encriptar password usando la biblioteca bcryptjs
        const salt = await bcrypt.genSalt(10);
        const contrasena_hash = await bcrypt.hash(password, salt);

        // 2. Crear el usuario en la base de datos con los campos correctos del modelo nuevo
        const nuevoUsuario = await Usuario.create({
            nombre: nombre,
            correo: correo,
            contrasena_hash: contrasena_hash,
            telefono_defecto: telefono_defecto || null,
            rol_id: rol_id,
            es_verificado: true // Pasa automáticamente a verificado porque ya validamos el token de correo
        }, { transaction });

        // Limpiar el código temporal usado de la memoria
        delete codigosTemporales[correo];

        await transaction.commit();

        res.status(201).json({
            success: true,
            message: "¡Registro completado con éxito! Tu cuenta de UTVentas ha sido creada y verificada",
            data: {
                usuario_id: nuevoUsuario.usuario_id,
                nombre: nuevoUsuario.nombre,
                correo: nuevoUsuario.correo,
                rol_id: nuevoUsuario.rol_id,
                rol_nombre: rolExistente.nombre,
                es_verificado: nuevoUsuario.es_verificado,
                fecha_registro: nuevoUsuario.fecha_registro
            }
        });

    } catch (error) {
        if (transaction && !transaction.finished) {
            await transaction.rollback();
        }
        console.error('Error durante el registro del estudiante:', error);
        res.status(500).json({
            success: false,
            message: "Error interno del servidor al procesar el registro"
        });
    }
}));
*/

// ==========================================
// 2. API DE REGISTRO DE USUARIO (CON NOMBRE DE ROL)
// ==========================================
usuarioRoute.post("/registro-usuario", AsyncHandler(async (req, res) => {
    const transaction = await sequelize.transaction();
    
    try {
        const { nombre, correo, password, rol_nombre, codigo, telefono_defecto } = req.body;

        // Validaciones de campos obligatorios
        if (!nombre || !correo || !password || !rol_nombre || !codigo) {
            await transaction.rollback();
            return res.status(400).json({
                success: false,
                message: "Todos los campos son obligatorios: nombre, correo, password, rol_nombre, codigo"
            });
        }

        // Validación de seguridad para que no se registren administradores por la vía pública
        if (rol_nombre.toLowerCase() === 'administrador') {
            await transaction.rollback();
            return res.status(403).json({
                success: false,
                message: "No está permitido registrar cuentas de administrador desde este formulario"
            });
        }

        // Validar tamaño de contraseña
        if (password.length < 6) {
            await transaction.rollback();
            return res.status(400).json({
                success: false,
                message: "La contraseña debe tener al menos 6 caracteres"
            });
        }

        // VALIDAR EL CÓDIGO DE VERIFICACIÓN
        const datosCodigo = codigosTemporales[correo];
        if (!datosCodigo) {
            await transaction.rollback();
            return res.status(400).json({
                success: false,
                message: "No se ha solicitado ningún código para este correo o ya expiró"
            });
        }

        if (datosCodigo.expiracion < Date.now()) {
            delete codigosTemporales[correo];
            await transaction.rollback();
            return res.status(400).json({
                success: false,
                message: "El código de verificación ha expirado, solicita uno nuevo"
            });
        }

        if (datosCodigo.codigo !== codigo) {
            await transaction.rollback();
            return res.status(400).json({
                success: false,
                message: "El código de verificación ingresado es incorrecto"
            });
        }

        // 1. BUSCAR EL ROL POR SU NOMBRE (En minúsculas para evitar problemas de mayúsculas/minúsculas)
        const rolExistente = await Rol.findOne({
            where: sequelize.where(
                sequelize.fn('lower', sequelize.col('nombre')),
                rol_nombre.toLowerCase()
            ),
            transaction
        });

        if (!rolExistente) {
            await transaction.rollback();
            return res.status(400).json({
                success: false,
                message: `El rol '${rol_nombre}' no es válido. Usa: 'comprador' o 'vendedor'`
            });
        }

        // Encriptar password
        const salt = await bcrypt.genSalt(10);
        const contrasena_hash = await bcrypt.hash(password, salt);

        // 2. Crear el usuario en la base de datos vinculando el ID del rol encontrado
        const nuevoUsuario = await Usuario.create({
            nombre: nombre,
            correo: correo,
            contrasena_hash: contrasena_hash,
            telefono_defecto: telefono_defecto || null,
            rol_id: rolExistente.rol_id, // Usamos el ID obtenido de la búsqueda
            es_verificado: true
        }, { transaction });

        // Limpiar el código temporal usado de la memoria
        delete codigosTemporales[correo];

        await transaction.commit();

        res.status(201).json({
            success: true,
            message: "¡Registro completado con éxito! Tu cuenta de UTVentas ha sido creada y verificada",
            data: {
                usuario_id: nuevoUsuario.usuario_id,
                nombre: nuevoUsuario.nombre,
                correo: nuevoUsuario.correo,
                rol_nombre: rolExistente.nombre, // Retornamos el nombre del rol para el Frontend
                es_verificado: nuevoUsuario.es_verificado,
                fecha_registro: nuevoUsuario.fecha_registro
            }
        });

    } catch (error) {
        if (transaction && !transaction.finished) {
            await transaction.rollback();
        }
        console.error('Error durante el registro del estudiante:', error);
        res.status(500).json({
            success: false,
            message: "Error interno del servidor al procesar el registro"
        });
    }
}));




module.exports = usuarioRoute;




// API DE REGISTRO DE USUARIO
 

// API LOGIN
 

// API LOGOUT 
// usuarioRoute.post("/logout", 
//     AsyncHandler(async (req, res) => {
//         try {
//             // Opción 1: Si estás usando sesiones (express-session)
//             if (req.session) {
//                 req.session.destroy((err) => {
//                     if (err) {
//                         console.error('Error destruyendo sesión:', err);
//                         return res.status(500).json({
//                             success: false,
//                             message: "Error al cerrar sesión"
//                         });
//                     }
                    
//                     // Limpiar cookie de sesión
//                     res.clearCookie('connect.sid'); // Nombre por defecto de la cookie de sesión
                    
//                     return res.json({
//                         success: true,
//                         message: "Sesión cerrada exitosamente"
//                     });
//                 });
//             } 
//             // Opción 2: Si solo usas JWT (el logout es client-side)
//             else {
//                 // Con JWT, el logout se maneja del lado del cliente eliminando el token
//                 // Pero podemos dar una respuesta exitosa
//                 return res.json({
//                     success: true,
//                     message: "Sesión cerrada exitosamente. Elimina el token del lado del cliente."
//                 });
//             }
//         } catch (error) {
//             console.error('Error en logout:', error);
//             res.status(500).json({
//                 success: false,
//                 message: "Error interno del servidor"
//             });
//         }
//     })
// );

// API PERFIL
 
 
 

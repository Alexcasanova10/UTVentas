const express = require("express");
const dotenv = require("dotenv");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const session = require("express-session");
const path = require("path");
const userAgent = require("express-useragent");
const { sequelize } = require('./src/models'); // Importar modelos

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middlewares
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.use(cors({
    origin: process.env.FRONTEND_URL || "*", 
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(userAgent.express());

app.use(session({
    secret: process.env.SESSION_SECRET || 'secret-key-default',
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        sameSite: "strict",
        maxAge: 30 * 24 * 60 * 60 * 1000
    }
}));

// Middleware para poner los modelos en el objeto req
app.use((req, res, next) => {
    req.models = require('./src/models');
    next();
});

// Rutas (aquí importarás tus rutas después)
app.get('/', (req, res) => {
    res.send("Hola mundo UTVentas - Servidor Express funcionando");
});

// paypal payment api for client key;
app.use('/api/config/paypal', (req, res) => {
  res.send(process.env.PAYPAL_CLIENT_ID);
});

app.get('/api/config/paypal', (req, res) => {
  res.send(process.env.PAYPAL_CLIENT_ID);
});

// Ruta para probar la conexión a la BD
app.get('/api/test-db', async (req, res) => {
    try {
        await sequelize.authenticate();
        res.json({ 
            success: true, 
            message: 'Conexión a la base de datos establecida correctamente' 
        });
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            message: 'Error al conectar con la base de datos',
            error: error.message 
        });
    }
});

/*

//Importar rutas
const sesionUsuarioRoute = require("./src/routes/SesionUsuario/apis-sesion")

// RUTAS DE EJEMPLO
const protectedRoute = require("./src/routes/SesionUsuario/protegidasRoutes")

const adminRoute = require("./src/routes/Perfiles/api-admin")
const vendedorRoute = require("./src/routes/Perfiles/api-vendedor")
const compradorRoute = require("./src/routes/Perfiles/api-comprador")
const productoRoute = require("./src/routes/Perfiles/api-productos")
 

//Route SesionesUsuario
app.use("/api/sesiones",sesionUsuarioRoute)

//Route protegidas
app.use("/api/protegidas",protectedRoute)

//Route admin
app.use("/api/admin",adminRoute)

//Route vendedor
app.use("/api/admin",vendedorRoute)

//Route producto
app.use("/api/admin",productoRoute)

*/


// Middleware para rutas no encontradas
app.use((req, res, next) => {
    res.status(404).json({ "message": "Página no encontrada" });
});

// Iniciar servidor y probar conexión a BD
app.listen(PORT, async () => {
    console.log(`=================================`);
    console.log(`Servidor corriendo en: http://localhost:${PORT}`);
    
    try {
        await sequelize.authenticate();
        console.log('✅ Conexión a MySQL establecida correctamente');
        console.log('📦 Modelos cargados y listos para usar');
    } catch (error) {
        console.error('❌ Error al conectar a MySQL:', error.message);
    }
    
    console.log(`=================================`);
});
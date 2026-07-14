const express = require("express");
const vendedorRoute = express.Router();
const AsyncHandler = require("express-async-handler");
const { sequelize } = require('../../models');
const { Op } = require('sequelize');
require('dotenv').config();




module.exports = vendedorRoute;
// express.js server-side framework router
const router = module.exports = require('express').Router();

// routers
router.use('/', require('./app/home').router);
router.use('/users', require('./app/users').router);
router.use('/boats', require('./app/boats').router);
router.use('/loads', require('./app/loads').router);
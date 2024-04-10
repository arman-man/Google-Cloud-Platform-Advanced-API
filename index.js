// express.js server-side framework router
const router = module.exports = require('express').Router();

// routers
router.use('/', require('./API/home').router);
router.use('/users', require('./API/users').router);
router.use('/boats', require('./API/boats').router);
router.use('/loads', require('./API/loads').router);
// express.js server-side framework router
const router = module.exports = require('express').Router();

// routers
router.use('/', require('./home').router);
router.use('/boats', require('./boats').router);
router.use('/loads', require('./loads').router);
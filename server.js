// express.js server-side framework
const express = require('express');
const app = express();

// Handlebars for dynamic HTML
const { engine } = require('express-handlebars');
app.engine('.hbs', engine({ extname: '.hbs' }));
app.set('view engine', '.hbs');

// to serve static files (in this case styles.css)
app.use(express.static('public'));

// router indexes
app.use('/', require('./index'));

// Listen to the App Engine-specified port, or 8080 otherwise
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}...`);
});
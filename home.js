// express.js server-side framework
const express = require('express');
const router = express.Router();

// converts json objects to a more easily accessible format
const bodyParser = require('body-parser');
router.use(bodyParser.json());

// enviornment variables
const { CLIENT_ID, CLIENT_SECRET, DOMAIN, APP_URL } = require('./constants');

// Axios for HTTP requests
const axios = require('axios');

// functions to create users
const post_user = require('./users').post_user;
const get_users = require('./users').get_users;

// middleware for 405
const methodNotAllowed = require('./helpers').methodNotAllowed

// middleware for 406
const checkAccepts = require('./helpers').checkAccepts

/* ------------- Begin Auth0 login/logout/profile ------------- */

// package for user login and logout
const { auth } = require('express-openid-connect');

// package for user profile
const { requiresAuth } = require('express-openid-connect');

// config for login/logout/profile
const config = {
    authRequired: false,
    auth0Logout: true,
    baseURL: APP_URL,
    clientID: CLIENT_ID,
    issuerBaseURL: 'https://' + DOMAIN,
    secret: CLIENT_SECRET
};

// auth router attaches /login, /logout, and /callback routes to the baseURL
router.use(auth(config));

// req.isAuthenticated is provided from the auth router
router.get('/', async (req, res) => {
    if (req.oidc.isAuthenticated()) {
        const users = await get_users();
        const userName = req.oidc.user.name;

        // Check if the user's name is already in the database
        const userExists = users.some(user => user.name === userName);

        if (!userExists) {
            // If the user does not exist, add them to the database
            await post_user(userName);
        }

        // Render the 'home' view with a logged-in message
        res.render('home', { message: 'Logged in' });
    } else {
        // Render the 'home' view with a logged-out message
        res.render('home', { message: 'Logged out' });
    }
});

// user's profile page
router.get('/profile', requiresAuth(), (req, res) => {
    // Render the 'profile' view, passing the user's profile data to the view
    const user_JWT_id_token = req.oidc.idToken
    const user_name = req.oidc.user.name
    res.render('profile', { user_JWT_id_token: user_JWT_id_token, user_name: user_name });
});

// authentication and adding user to database if it isn't already in database (for use with Postman only)
router.post('/login', checkAccepts, function (req, res) {
    const username = req.body.username;
    const password = req.body.password;
    const boats = req.body.boats || [];

    axios.post(`https://${DOMAIN}/oauth/token`, {
        grant_type: 'password',
        username: username,
        password: password,
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET
    })
        .then(async response => {

            let responseData = response.data

            const users = await get_users();

            // Check if the username is already in the database
            const userExists = users.some(user => user.name === username);

            if (!userExists) {
                // If the user does not exist, add them to the database
                const key = await post_user(username, boats);

                responseData = {
                    ...response.data,
                    "user": username,
                    "boats": boats,
                }
            }

            res.status(200).json(responseData);
        })
        .catch(error => {
            res.status(500).json(error.message);
        });
});

// Handle unsupported methods for '/login'
router.all('/login', methodNotAllowed);

// Handle unsupported methods for '/login'
router.all('/logout', methodNotAllowed);

// Handle unsupported methods for '/login'
router.all('/profile', methodNotAllowed);

// Handle unsupported methods for '/'
router.all('/', methodNotAllowed);

/* ------------- End Auth0 login/logout/profile ------------- */

module.exports = { router };
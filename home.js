// express.js server-side framework
const express = require('express');
const router = express.Router();

// converts json objects to a more easily accessible format
const bodyParser = require('body-parser');
router.use(bodyParser.json());

// enviornment variables
const { CLIENT_ID, CLIENT_SECRET, DOMAIN, APP_URL } = require('./constants');

// functions imported from './users' to create user accounts using Auth0
const get_all_users_helper = require('./users').get_all_users_helper;
const post_user = require('./users').post_user;

// jwt authentication
const jwt = require('express-jwt');
const jwksRsa = require('jwks-rsa');

// jwt authentication middleware
const checkJwt = jwt({
    secret: jwksRsa.expressJwtSecret({
        cache: true,
        rateLimit: true,
        jwksRequestsPerMinute: 5,
        jwksUri: `https://${DOMAIN}/.well-known/jwks.json`
    }),

    // Validate the audience and the issuer.
    issuer: `https://${DOMAIN}/`,
    algorithms: ['RS256']
});

// custom JWT middleware
const customJwtMiddleware = (req, res, next) => {
    checkJwt(req, res, err => {
        // JWT validation error or no token, but still proceed
        next();
    });
};

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
        const users = await get_all_users_helper();
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

/* ------------- End Auth0 login/logout/profile ------------- */

module.exports = { router };
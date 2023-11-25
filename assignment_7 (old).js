// express.js server-side framework
const express = require('express');
const app = express();

// datastore
const ds = require('./datastore');
const datastore = ds.datastore;

// to serve static files (in this case styles.css)
app.use(express.static('public'));

// converts json objects to a more easily accessible format
const bodyParser = require('body-parser');
router.use(bodyParser.json());

// Handlebars for dynamic html
const { engine } = require('express-handlebars');
app.engine('.hbs', engine({ extname: '.hbs' }));
app.set('view engine', '.hbs');

// enviornment variables
const { BOAT, USER, APP_URL, CLIENT_ID, CLIENT_SECRET, DOMAIN } = require('./constants');

// get item from datastore
function fromDatastore(item) {
    item.id = item[Datastore.KEY].id;
    return item;
}

// Axios for HTTP requests
const axios = require('axios');

// jwt authentication
const jwt = require('express-jwt');
const jwksRsa = require('jwks-rsa');

// routers
const router = express.Router();
const login = express.Router();
const owners = express.Router();

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
    //baseURL: 'http://localhost:8080',
    baseURL: 'https://hw7-manukyaa.uw.r.appspot.com',
    clientID: CLIENT_ID,
    issuerBaseURL: 'https://' + DOMAIN,
    secret: CLIENT_SECRET
};

// auth router attaches /login, /logout, and /callback routes to the baseURL
app.use(auth(config));

// req.isAuthenticated is provided from the auth router
app.get('/', (req, res) => {

    if (req.oidc.isAuthenticated()) {
        // If the user is authenticated, render a view (e.g., 'home') with specific data
        res.render('home', { message: 'Logged in' });
    } else {
        // If the user is not authenticated, render a view (e.g., 'home') with specific data
        res.render('home', { message: 'Logged out' });
    }
});

app.get('/profile', requiresAuth(), (req, res) => {
    // Render the 'profile' view, passing the user's profile data to the view
    const user_JWT_id_token = req.oidc.idToken
    const user_name = req.oidc.user.name
    res.render('profile', { user_JWT_id_token: user_JWT_id_token, user_name: user_name });
});

/* ------------- End Auth0 login/logout/profile ------------- */

/* ------------- Begin Boat Model Functions ------------- */
function post_boat(name, type, length, isPublic, owner) {
    let key = datastore.key(BOAT);
    const new_boat = { "name": name, "type": type, "length": length, "public": isPublic, "owner": owner };
    return datastore.save({ "key": key, "data": new_boat }).then(() => { return key });
}

function get_owner_boats(owner) {
    const q = datastore.createQuery(BOAT);
    return datastore.runQuery(q).then((entities) => {
        return entities[0].map(fromDatastore).filter(item => item.owner === owner);
    });
}

function get_owner_boats_public(owner) {
    const q = datastore.createQuery(BOAT);
    return datastore.runQuery(q).then((entities) => {
        return entities[0].map(fromDatastore).filter(item => item.owner === owner && item.public === true);
    });
}

function get_public_boats() {
    const q = datastore.createQuery(BOAT);
    return datastore.runQuery(q).then((entities) => {
        return entities[0].map(fromDatastore).filter(item => item.public === true);
    });
}

function get_boat(id) {
    const key = datastore.key([BOAT, parseInt(id, 10)]);
    return datastore.get(key);
}

function delete_boat(id) {
    const key = datastore.key([BOAT, parseInt(id, 10)]);
    return datastore.delete(key);
}

/* ------------- End Model Functions ------------- */

/* ------------- Begin Controller Functions ------------- */
// with authentication - create a boat for a specified owner
router.post('/', customJwtMiddleware, function (req, res) {

    // Check if JWT is invalid or not provided
    if (!req.user || !req.user.name) {
        return res.status(401).json({ 'Error': 'Unauthorized access. Valid JWT required.' });
    }

    if (req.get('content-type') !== 'application/json') {
        return res.status(415).json({ 'Error': 'Server only accepts application/json data.' });
    }

    post_boat(req.body.name, req.body.type, req.body.length, req.body.public, req.user.name)
        .then(key => {
            res.location(req.protocol + "://" + req.get('host') + req.baseUrl + '/' + key.id);
            res.status(201).json({ 'id': key.id });
        })
});

// without authentication - get the public boats for a specified owner
owners.get('/:owner_id/boats', function (req, res) {
    get_owner_boats_public(req.params.owner_id)
        .then((boats) => {
            const accepts = req.accepts(['application/json']);
            if (!accepts) {
                res.status(406).json({ 'Error': 'Not Acceptable' });
            } else if (accepts === 'application/json') {
                res.status(200).json(boats);
            } else {
                res.status(500).json({ 'Error': 'Content type got messed up!' });
            }
        });
});

// with authentication - get the public and private boats for a specified owner, or all the public boats if invalid jwt
router.get('/', customJwtMiddleware, function (req, res) {
    if (req.user && req.user.name) {
        // JWT is valid, get boats for the user
        get_owner_boats(req.user.name)
            .then((boats) => {
                res.status(200).json(boats);
            })
            .catch(error => {
                res.status(500).send(error.message);
            });
    } else {
        // No or invalid JWT, get public boats
        get_public_boats()
            .then((boats) => {
                res.status(200).json(boats);
            })
            .catch(error => {
                res.status(500).send(error.message);
            });
    }
});

// with authentication - delete a boat for a specified owner
router.delete('/:boat_id', customJwtMiddleware, function (req, res) {
    // Check if JWT is valid
    if (!req.user || !req.user.name) {
        return res.status(401).json({ 'Error': 'Missing/Invalid JWT' });
    }

    get_boat(req.params.boat_id)
        .then((boat) => {
            if (!boat) {
                // No boat with this boat_id exists
                return res.status(403).json({ 'Error': 'No boat with this boat_id exists' });
            } else if (boat[0].owner !== req.user.name) {
                // Boat is owned by another person
                return res.status(403).json({ 'Error': 'Boat is owned by another person or boat does not exist' });
            } else {
                // Delete the boat
                delete_boat(req.params.boat_id).then(() => res.status(204).end());
            }
        })
        .catch(error => {
            res.status(500).send(error.message);
        });
});

// authentication
login.post('/', function (req, res) {
    const username = req.body.username;
    const password = req.body.password;

    axios.post(`https://${DOMAIN}/oauth/token`, {
        grant_type: 'password',
        username: username,
        password: password,
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET
    })
        .then(response => {
            res.json(response.data);
        })
        .catch(error => {
            res.status(500).send(error.message);
        });
});

/* ------------- End Controller Functions ------------- */

app.use('/boats', router);
app.use('/owners', owners);
app.use('/login', login);

// Listen to the App Engine-specified port, or 8080 otherwise
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}...`);
});
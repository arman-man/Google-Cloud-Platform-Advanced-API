// datastore
const ds = require('../../database/datastore');
const datastore = ds.datastore;

// enviornment variables
const { BOAT, DOMAIN } = require('./constants');

// helper function that deletes boat-load relationship if one of them are deleted
async function delete_relationship_boat_load(bid, lid, get_load_func, put_load_func) {
    const b_key = datastore.key([BOAT, parseInt(bid, 10)]);
    return datastore.get(b_key)
        .then(async (boat) => {
            // Check if the boat has loads and if the specific load is assigned to it
            if (typeof (boat[0].loads) != 'undefined' && boat[0].loads != null) {
                const loadIndex = boat[0].loads.findIndex(element => element == lid);
                // If the load is found, remove it
                if (loadIndex > -1) {
                    boat[0].loads.splice(loadIndex, 1);
                }
            }
            // Save the boat data back to the datastore
            return datastore.save({ "key": b_key, "data": boat[0] });
        })
        .then(async () => {
            // Retrieve the load object and update it
            const loadObject = await get_load_func(lid);
            // Set the carrier to null to reflect that the load is no longer carried by any boat
            const carrier = null;
            // Update the load without the carrier information
            return await put_load_func(lid, loadObject[0].volume, loadObject[0].item, loadObject[0].creation_date, carrier);
        });
}

// helper function that deletes user-boat relationship if one of them are deleted
async function delete_relationship_user_boat(bid, uid, get_user_func, put_user_func) {
    // Retrieve the user object
    const userObject = await get_user_func(uid);

    // Get the boat using its ID
    const b_key = datastore.key([BOAT, parseInt(bid, 10)]);
    return datastore.get(b_key)
        .then(async (boat) => {
            // Check if the boat has an owner
            if (typeof boat[0].owner === userObject[0].name) {
                // Remove the owner from the boat as it's being deleted
                delete boat[0].owner;
            }
            // Save the updated boat data back to the datastore
            return datastore.save({ "key": b_key, "data": boat[0] });
        })
        .then(async () => {
            // Remove the boat from the user's list of boats
            const boatIndex = userObject[0].boats.findIndex(element => element == bid);
            if (boatIndex > -1) {
                userObject[0].boats.splice(boatIndex, 1);
            }
            // Update the user with the modified list of boats
            return await put_user_func(uid, userObject[0].name, userObject[0].boats);
        });
}

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
        if (err) {
            // Handle JWT error here, e.g., return a response or pass the error to next
            return res.status(401).json({ 'Error': 'Invalid JWT' });
        }
        next();
    });
};

// Middleware to handle unsupported methods
function methodNotAllowed(req, res, next) {
    res.status(405).json({ 'Error': 'Method Not Allowed' });
}

// Middleware to check for acceptable content type
function checkAccepts(req, res, next) {
    if (req.accepts('json')) {
        next();
    } else {
        res.status(406).json({ 'Error': 'Not Acceptable: This service only provides JSON responses' });
    }
}

module.exports = { delete_relationship_boat_load, delete_relationship_user_boat, customJwtMiddleware, methodNotAllowed, checkAccepts };
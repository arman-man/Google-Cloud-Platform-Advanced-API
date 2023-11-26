// express.js server-side framework
const express = require('express');
const router = express.Router();

// datastore
const ds = require('./datastore');
const datastore = ds.datastore;
const fromDatastore = ds.fromDatastore

// converts json objects to a more easily accessible format
const bodyParser = require('body-parser');
router.use(bodyParser.json());

// enviornment variables
const { USER, APP_URL, CLIENT_ID, CLIENT_SECRET, DOMAIN } = require('./constants');

// Axios for HTTP requests
const axios = require('axios');

// helper function for managing boat-load relationship
const delete_relationship_user_boat = require('./helpers').delete_relationship_user_boat;

// boat functions for user-boat relationship
const get_boat_helper = require('./boats').get_boat_helper;
const update_boat = require('./boats').update_boat;

/* ------------- Begin User Model Functions ------------- */

// create a user
async function post_user(name, boats) {
    var key = datastore.key(USER);
    const new_user = { "name": name, "boats": boats };
    return datastore.save({ "key": key, "data": new_user }).then(() => { return key });
}

// helper function for creating users
async function get_all_users_helper() {
    const q = datastore.createQuery(USER);
    return datastore.runQuery(q).then((entities) => {
        return entities[0].map(fromDatastore);
    });
}

// get specified user
async function get_user(id) {
    const key = datastore.key([USER, parseInt(id, 10)]);
    return datastore.get(key).then((entity) => {
        if (entity[0] === undefined || entity[0] === null) {
            return entity;
        } else {
            return entity.map(fromDatastore);
        }
    });
}

// get all users with pagination
async function get_users_pagination(req) {
    var q = datastore.createQuery(USER).limit(5);
    const results = {};
    if (Object.keys(req.query).includes("cursor")) {
        q = q.start(req.query.cursor);
    }
    return datastore.runQuery(q).then((entities) => {
        results.items = entities[0].map(fromDatastore);
        if (entities[1].moreResults !== ds.Datastore.NO_MORE_RESULTS) {
            results.next = req.protocol + "://" + req.get("host") + req.baseUrl + "?cursor=" + entities[1].endCursor;
        }
        return results;
    });
}

/* ------------- End Model Functions ------------- */

/* ------------- Begin Controller Functions ------------- */

/* I don't think I need this function at all
// authentication and adding user to database (for use with Postman)
router.post('/', function (req, res) {
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

            const users = await get_all_users_helper();

            // Check if the username is already in the database
            const userExists = users.some(user => user.name === username);

            if (!userExists) {
                // If the user does not exist, add them to the database
                const key = await post_user(username, boats);

                responseData = {
                    ...response.data,
                    "user": username,
                    "boats": boats,
                    "self": APP_URL + "/users/" + key.id
                }
            }

            res.json(responseData);
        })
        .catch(error => {
            res.status(500).json(error.message);
        });
});
*/

// get a specified user
router.get('/:id', function (req, res) {
    const id = req.params.id;

    get_user(id)
        .then(user => {
            if (user[0] === undefined || user[0] === null) {
                res.status(404).json({ 'Error': 'No user with this user_id exists' });
            } else {
                user[0]["self"] = APP_URL + "/users/" + id;

                user[0]["boats"] = user[0]["boats"].map(boatId => {
                    return {
                        "id": boatId,
                        "self": APP_URL + "/boats/" + boatId
                    };
                });

                res.status(200).json(user[0]);
            }
        });
});

// get all users with pagination
router.get('/', function (req, res) {
    get_users_pagination(req)
        .then(results => {
            const usersAndBoats = results.items.map(user => {
                user["self"] = APP_URL + "/users/" + user.id;

                user["boats"] = user.boats.map(boatId => {
                    return {
                        "id": boatId,
                        "self": APP_URL + "/boats/" + boatId
                    };
                });

                return user;
            });

            const response = {
                users: usersAndBoats,
            };

            // Add a 'next' property if there is a next page of results
            if (results.next) {
                response.next = results.next;
            }
            res.status(200).json(response);
        })
});

/* ------------- End Controller Functions ------------- */

module.exports = { router, get_all_users_helper, post_user };
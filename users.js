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
const { USER } = require('./constants');

/* ------------- Begin User Model Functions ------------- */

// create a user
async function post_user(name, boats = []) {
    var key = datastore.key(USER);
    const new_user = { "name": name, "boats": boats };
    return datastore.save({ "key": key, "data": new_user }).then(() => { return key });
}

// get all users
async function get_users() {
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

// update a user
async function update_user(id, name, boats) {
    const key = datastore.key([USER, parseInt(id, 10)]);
    if (boats === null || boats === undefined) {
        const user = { "name": name, "boats": [] };
        return datastore.save({ "key": key, "data": user });
    }
    else {
        const user = { "name": name, "boats": boats };
        return datastore.save({ "key": key, "data": user });
    }
}

/* ------------- End Model Functions ------------- */

/* ------------- Begin Controller Functions ------------- */

// get all users
router.get('/', async function (req, res) {
    try {
        const users = await get_users();
        res.status(200).json(users);
    } catch (err) {
        res.status(500).send(err.message);
    }
});

/* ------------- End Controller Functions ------------- */

module.exports = { router, get_users, post_user, update_user, get_user };
// datastore
const ds = require('./datastore');
const datastore = ds.datastore;
const fromDatastore = ds.fromDatastore

// enviornment variables
const { USER } = require('./constants');

/* ------------- Begin User Model Functions ------------- */

// create a user
async function post_user(name, boats = null) {
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
        const user = { "name": name, "boats": null };
        return datastore.save({ "key": key, "data": user });
    }
    else {
        const user = { "name": name, "boats": boats };
        return datastore.save({ "key": key, "data": user });
    }
}

/* ------------- End Model Functions ------------- */

module.exports = { get_users, post_user, update_user, get_user };
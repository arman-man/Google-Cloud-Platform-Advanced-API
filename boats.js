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
const { BOAT, APP_URL } = require('./constants');

// load functions for boat-load relationship
const get_load = require('./loads').get_load;
const update_load = require('./loads').update_load;

// functions to update user for boat-user relationship
const update_user = require('./users').update_user;
const get_user = require('./users').get_user;
const get_users = require('./users').get_users;

// helper function for managing boat-load relationship
const delete_relationship_boat_load = require('./helpers').delete_relationship_boat_load;

// helper function for managing user-boat relationship
const delete_relationship_user_boat = require('./helpers').delete_relationship_user_boat;

// custom JWT middleware for verifying CRUD on users-boats
const customJwtMiddleware = require('./helpers').customJwtMiddleware

// middleware for 405
const methodNotAllowed = require('./helpers').methodNotAllowed

// middleware for 406
const checkAccepts = require('./helpers').checkAccepts

/* ------------- Begin Boat Model Functions ------------- */

// create a boat
async function post_boat(name, type, length, loads, owner) {
    var key = datastore.key(BOAT);
    const new_boat = { "name": name, "type": type, "length": length, "loads": loads, "owner": owner };
    return datastore.save({ "key": key, "data": new_boat }).then(() => { return key });
}

// get a specified boat
async function get_boat(id) {
    const key = datastore.key([BOAT, parseInt(id, 10)]);
    return datastore.get(key).then((entity) => {
        if (entity[0] === undefined || entity[0] === null) {
            return entity;
        } else {
            return entity.map(fromDatastore);
        }
    });
}

// get all boats
async function get_boats() {
    var q = datastore.createQuery(BOAT);
    return datastore.runQuery(q).then((entities) => {
        return {
            items: entities[0].map(fromDatastore)
        };
    });
}

// get all the boats of an authenticated owner
async function get_owner_boats(req, owner) {
    let q = datastore.createQuery(BOAT).limit(5);
    if (req.query.cursor) {
        q = q.start(req.query.cursor);
    }
    const results = {};
    return datastore.runQuery(q).then((entities) => {
        results.items = entities[0].map(fromDatastore).filter(item => item.owner === owner);
        if (entities[1].moreResults !== ds.Datastore.NO_MORE_RESULTS) {
            results.next = req.protocol + "://" + req.get("host") + req.baseUrl + "?cursor=" + entities[1].endCursor;
        }
        return results;
    });
}

// update a boat
async function update_boat(id, name, type, length, loads, owner) {
    const key = datastore.key([BOAT, parseInt(id, 10)]);
    if (owner === null || owner === undefined) {
        const boat = { "name": name, "type": type, "length": length, "loads": loads, "owner": null };
        return datastore.save({ "key": key, "data": boat });
    }
    else {
        const boat = { "name": name, "type": type, "length": length, "loads": loads, "owner": owner };
        return datastore.save({ "key": key, "data": boat });
    }
}

async function boat_update_name_constraint(name) {
    if (name === null || name === undefined) {
        return false;
    }

    const allBoatsResponse = await get_boats();
    const allBoats = allBoatsResponse.items; // Accessing the items array

    if (!Array.isArray(allBoats)) {
        console.error('allBoats is not an array:', allBoats);
        throw new Error('Expected an array of boats');
    }

    const boat_names = allBoats.map(item => item.name);
    return !boat_names.includes(name);
}

// helper function for creating relationship between boat-load
async function put_reservation(bid, lid) {
    const b_key = datastore.key([BOAT, parseInt(bid, 10)]);
    let boat_name;
    return datastore.get(b_key)
        .then((boat) => {
            boat_name = boat[0].name
            if (typeof (boat[0].loads) === 'undefined') {
                boat[0].loads = null;
            }
            boat[0].loads.push(lid);
            return datastore.save({ "key": b_key, "data": boat[0] });
        })
        .then(async () => {
            const carrier = { "id": bid, "name": boat_name };
            const loadObject = await get_load(lid);
            return update_load(lid, loadObject[0].volume, loadObject[0].item, loadObject[0].creation_date, carrier);
        });
}

// delete a boat
async function delete_boat(id) {
    const key = datastore.key([BOAT, parseInt(id, 10)]);
    return datastore.delete(key);
}

/* ------------- End Model Functions ------------- */

/* ------------- Begin Controller Functions ------------- */

// with authentication - create a boat for the authenticated user
router.post('/', customJwtMiddleware, checkAccepts, async function (req, res) {
    // JWT Authentication Check
    if (!req.user || !req.user.name) {
        return res.status(401).json({ 'Error': 'Missing/Invalid JWT' });
    }

    const { name, type, length, loads = null } = req.body;
    const ownerName = req.user.name;

    // Validate request body
    if (!name || !type || !length) {
        return res.status(400).json({ "Error": "The request object is missing at least one of the required attributes" });
    }

    // Check if the boat name is unique
    try {
        const isNameUnique = await boat_update_name_constraint(name);
        if (!isNameUnique) {
            return res.status(400).set("Content-Type", "application/json").json({ "Error": "A boat with this name already exists" });
        }

        // Create boat
        post_boat(name, type, length, loads, ownerName)
            .then(async (key) => {
                // Fetch all users
                const users = await get_users();
                // Find the user with the matching name
                const user = users.find(u => u.name === ownerName);

                if (!user) {
                    return res.status(404).json({ "Error": "User not found" });
                }

                // Update user's boats with the boat's name
                const userBoats = user.boats ? [...user.boats, name] : [name];
                await update_user(user.id, user.name, userBoats);

                // Return the response
                res.status(201).json({
                    "id": key.id,
                    "name": name,
                    "type": type,
                    "length": length,
                    "loads": loads,
                    "owner": ownerName,
                    "self": APP_URL + "/boats/" + key.id
                });
            })
            .catch((error) => {
                // Handle error from post_boat
                res.status(500).json({ "Error": "Internal Server Error", "Details": error.message });
            });
    } catch (error) {
        // Handle error from boat_update_name_constraint
        res.status(500).json({ "Error": "Internal Server Error", "Details": error.message });
    }
});

// with authentication - get the boats of an authenticated owner
router.get('/', customJwtMiddleware, checkAccepts, function (req, res) {
    if (req.user && req.user.name) {
        // JWT is valid, get boats for the user
        get_owner_boats(req, req.user.name)
            .then(boats => {
                const boatsWithDetails = boats.items.map(boat => {
                    boat["self"] = APP_URL + "/boats/" + boat.id;
                    boat["loads"] = boat.loads.map(loadId => {
                        return {
                            "id": loadId,
                            "self": APP_URL + "/loads/" + loadId
                        };
                    });

                    if (boat.owner) {
                        boat.owner["self"] = APP_URL + "/users/" + boat.owner.id;
                    }

                    return boat;
                });

                const response = {
                    boats: boatsWithDetails,
                };

                if (boats.next) {
                    response.next = boats.next;
                }

                // Check the format query parameter
                const format = req.query.format;
                if (format === 'html') {
                    // Render the page with the boats data
                    res.render('boats', { response: response });
                } else {
                    // Default to JSON response if no format is specified or if format is not 'html'
                    res.status(200).json(response);
                }
            })
            .catch(error => {
                res.status(500).send(error.message);
            });
    } else {
        // No or invalid JWT
        res.status(401).json({ 'Error': 'No authentication' });
    }
});

// with authentication - put boat name, type, length
router.put('/:id', customJwtMiddleware, checkAccepts, async function (req, res) {
    // JWT Authentication Check
    if (!req.user || !req.user.name) {
        return res.status(401).json({ 'Error': 'Missing/Invalid JWT' });
    }

    if (req.get("content-type") !== "application/json") {
        res.status(415).set("Content-Type", "application/json").json({ "Error": "Server only accepts application/json data." });
    } else {
        const id = req.params.id;
        const boat = await get_boat(id);

        // No boat with that ID
        if (!boat || boat.length === 0) {
            res.status(404).json({ 'Error': 'No boat with this id exists' });
        } else if (boat[0].owner !== req.user.name) {
            // Check if the boat is owned by the user
            res.status(403).json({ 'Error': 'Boat is owned by another user' });
        } else {
            const name = req.body.name;
            const type = req.body.type;
            const length = req.body.length;

            // Input validation
            if (!name || !type || !length) {
                res.status(400).json({ "Error": "The request object is missing at least one of the required attributes" });
            } else {
                if (await boat_update_name_constraint(name)) {
                    // Update the boat without changing the owner and loads
                    await update_boat(id, name, type, length, boat[0].loads, boat[0].owner);
                    res.status(303).location(req.protocol + "://" + req.get("host") + req.baseUrl + "/" + id).end();
                } else {
                    res.status(400).set("Content-Type", "application/json").json({ "Error": "A boat with this name already exists" });
                }
            }
        }
    }
});

// with authentication - patch boat name, type, length
router.patch('/:id', customJwtMiddleware, checkAccepts, async function (req, res) {
    // JWT Authentication Check
    if (!req.user || !req.user.name) {
        return res.status(401).json({ 'Error': 'Missing/Invalid JWT' });
    }

    if (req.get("content-type") !== "application/json") {
        res.status(415).set("Content-Type", "application/json").json({ "Error": "Server only accepts application/json data." });
    } else {
        const id = req.params.id;
        const boat = await get_boat(id);

        // No boat with that ID
        if (!boat || boat.length === 0) {
            res.status(404).json({ 'Error': 'No boat with this id exists' });
        } else if (boat[0].owner !== req.user.name) {
            // Check if the boat is owned by the user
            res.status(403).json({ 'Error': 'Boat is owned by another user' });
        } else {
            // Take values from request if provided, otherwise use existing values
            const boatName = req.body.name !== undefined ? req.body.name : boat[0].name;
            const boatType = req.body.type !== undefined ? req.body.type : boat[0].type;
            const boatLength = req.body.length !== undefined ? req.body.length : boat[0].length;

            // Do not allow changes to owner and loads
            const boatOwner = boat[0].owner;
            const boatLoads = boat[0].loads;

            // Input validation
            if (!boatName && !boatType && !boatLength) {
                res.status(400).json({ "Error": "The request object is missing all of the possible attributes" });
            } else {
                // Update the boat without changing the owner and loads
                await update_boat(id, boatName, boatType, boatLength, boatLoads, boatOwner)
                res.status(204).end();
            }
        }
    }
});

// with authentication - delete a boat for a specified owner
router.delete('/:id', customJwtMiddleware, checkAccepts, async function (req, res) {
    // Check if JWT is valid
    if (!req.user || !req.user.name) {
        return res.status(401).json({ 'Error': 'Missing/Invalid JWT' });
    }

    try {
        const boat = await get_boat_helper(req.params.id);

        // No boat with this id exists
        if (!boat || boat.length === 0) {
            return res.status(404).json({ 'Error': 'No boat with this id exists' });
        } else if (boat[0].owner !== req.user.name) {
            // Boat is owned by another person
            return res.status(403).json({ 'Error': 'Boat is owned by another person or boat does not exist' });
        } else {
            // Handle the relationship with loads
            if (boat[0].loads && boat[0].loads.length > 0) {
                await Promise.all(boat[0].loads.map(loadId =>
                    delete_relationship_boat_load(req.params.id, loadId, get_load, update_load)
                ));
            }

            // Handle the relationship with the user
            if (boat[0].owner) {
                await delete_relationship_user_boat(req.params.id, boat[0].owner, get_user, update_user);
            }

            // Delete the boat
            await delete_boat(req.params.id);
            res.status(204).end();
        }
    } catch (error) {
        // Handle any errors that might occur
        res.status(500).json({ 'Error': 'An error occurred while deleting the boat' });
    }
});

// with authentication - create relationship between boat-load
router.put('/:bid/loads/:lid', customJwtMiddleware, checkAccepts, async function (req, res) {
    // JWT Authentication Check
    if (!req.user || !req.user.name) {
        return res.status(401).json({ 'Error': 'Missing/Invalid JWT' });
    }

    const bid = req.params.bid;
    const lid = req.params.lid;

    const boat = await get_boat_helper(bid);
    const load = await get_load(lid);

    if (boat === undefined || boat === null || load === undefined || load === null) {
        res.status(404).json({ 'Error': 'The specified boat and/or load does not exist' });
    } else if (boat.owner !== req.user.name) {
        // Check if the boat is owned by the user
        res.status(403).json({ 'Error': 'Boat is owned by another user' });
    } else {
        if (load.carrier !== null) {
            res.status(403).json({ 'Error': 'The load is already loaded on another boat' });
        }
        else {
            await put_reservation(bid, lid)
                .then(() => res.status(204).end())
                .catch(error => {
                    res.status(500).json({ 'Error': 'An error occurred while updating the reservation' });
                });
        }
    }
});

// with authentication - delete relationship between boat-load
router.delete('/:bid/loads/:lid', customJwtMiddleware, checkAccepts, async function (req, res) {
    // JWT Authentication Check
    if (!req.user || !req.user.name) {
        return res.status(401).json({ 'Error': 'Missing/Invalid JWT' });
    }

    const bid = req.params.bid;
    const lid = req.params.lid;

    const boat = await get_boat(bid);
    const load = await get_load(lid);

    if (load[0] === undefined || load[0] === null || boat[0] === undefined || boat[0] === null) {
        res.status(404).json({ 'Error': 'No boat with this boat_id is loaded with the load with this load_id' });
    } else {
        // Check if the boat is owned by the user
        if (boat[0].owner !== req.user.name) {
            res.status(403).json({ 'Error': 'Boat is owned by another user' });
        } else if (load[0].carrier === null) {
            res.status(404).json({ 'Error': 'No boat with this boat_id is loaded with the load with this load_id' });
        } else {
            if (load[0].carrier.id != bid) {
                res.status(404).json({ 'Error': 'No boat with this boat_id is loaded with the load with this load_id' });
            } else {
                await delete_relationship_boat_load(bid, lid, get_load, update_load)
                    .then(() => res.status(204).end())
                    .catch(error => {
                        res.status(500).json({ 'Error': 'An error occurred while updating the reservation' });
                    });
            }
        }
    }
});

// get a specified boat's loads with authentication
router.get('/:id/loads', customJwtMiddleware, checkAccepts, async function (req, res) {
    // JWT Authentication Check
    if (!req.user || !req.user.name) {
        return res.status(401).json({ 'Error': 'Missing/Invalid JWT' });
    }

    const id = req.params.id;

    get_boat(id)
        .then(boat => {
            if (boat[0] === undefined || boat[0] === null) {
                res.status(404).json({ 'Error': 'No boat with this id exists' });
            } else {
                // Check if the boat is owned by the user
                if (boat[0].owner !== req.user.name) {
                    res.status(403).json({ 'Error': 'Boat is owned by another user' });
                } else {
                    boat[0]["self"] = APP_URL + "/boats/" + id;

                    boat[0]["loads"] = boat[0]["loads"].map(async loadId => {
                        const getLoad = await get_load(loadId);
                        return {
                            "id": loadId,
                            "item": getLoad[0].item,
                            "creation_date": getLoad[0].creation_date,
                            "volume": getLoad[0].volume,
                            "self": APP_URL + "/loads/" + loadId
                        };
                    });
                    res.status(200).json(boat[0]);
                }
            }
        })
        .catch(error => {
            res.status(500).json({ 'Error': 'An error occurred while fetching the boat data' });
        });
});

// Handle unsupported methods for '/:id'
router.all('/:id', methodNotAllowed);

// Handle unsupported methods for '/:id/loads'
router.all('/:id/loads', methodNotAllowed);

// Handle unsupported methods for '/'
router.all('/', methodNotAllowed);

// Handle unsupported methods for '/:bid/loads/:lid'
router.all('/:bid/loads/:lid', methodNotAllowed);

/* ------------- End Controller Functions ------------- */

module.exports = { router };

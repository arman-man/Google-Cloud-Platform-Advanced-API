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

// helper function for managing boat-load relationship
const delete_relationship_boat_load = require('./helpers').delete_relationship_boat_load;

// helper function for managing user-boat relationship
const delete_relationship_user_boat = require('./helpers').delete_relationship_user_boat;

// load functions for boat-load relationship
const get_load = require('./loads').get_load;
const update_load = require('./loads').update_load;

// custom JWT middleware for verifying CRUD on users-boats
const customJwtMiddleware = require('./home').customJwtMiddleware

/* ------------- Begin Boat Model Functions ------------- */

// create a boat
async function post_boat(name, type, length, loads, owner) {
    var key = datastore.key(BOAT);
    const new_boat = { "name": name, "type": type, "length": length, "loads": loads, "owner": owner };
    return datastore.save({ "key": key, "data": new_boat }).then(() => { return key });
}

// get a specified boat helper
async function get_boat_helper(id) {
    const key = datastore.key([BOAT, parseInt(id, 10)]);
    return datastore.get(key).then((entity) => {
        if (entity[0] === undefined || entity[0] === null) {
            return entity;
        } else {
            return entity.map(fromDatastore);
        }
    });
}

// get all boats helper
async function get_all_boats_helper() {
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
    if (owner == null || owner == undefined) {
        const boat = { "name": name, "type": type, "length": length, "loads": loads, "owner": null };
        return datastore.save({ "key": key, "data": boat });
    }
    else {
        const boat = { "name": name, "type": type, "length": length, "loads": loads, "owner": owner };
        return datastore.save({ "key": key, "data": boat });
    }
}

// prevent duplicate names for put/patch
async function boat_update_name_constraint(name) {
    if (name === null || name === undefined) {
        return false;
    }

    const allBoats = await get_all_boats_helper();
    const boat_names = allBoats.map(item => item.name);
    if (boat_names.includes(name)) {
        return false;
    }
    else {
        return true;
    }
}

// helper function for creating relationship between boat-load
async function put_reservation(bid, lid) {
    const b_key = datastore.key([BOAT, parseInt(bid, 10)]);
    let boat_name;
    return datastore.get(b_key)
        .then((boat) => {
            boat_name = boat[0].name
            if (typeof (boat[0].loads) === 'undefined') {
                boat[0].loads = [];
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

// create a boat
router.post('/', function (req, res) {
    const name = req.body.name;
    const type = req.body.type;
    const length = req.body.length;
    const loads = req.body.loads || [];
    const owner = req.body.owner || null;

    if (!name || !type || !length) {
        res.status(400).json({ "Error": "The request object is missing at least one of the required attributes" });
    }
    else {
        post_boat(name, type, length, loads, owner)
            .then((key) => {
                res.status(201).json({
                    "id": key.id,
                    "name": name,
                    "type": type,
                    "length": length,

                    "loads": loads,
                    "owner": owner,
                    "self": APP_URL + "/boats/" + key.id
                });
            });
    }
});

// delete relationship between boat-load
router.delete('/:bid/loads/:lid', async function (req, res) {
    const bid = req.params.bid;
    const lid = req.params.lid;

    const boat = await get_boat_helper(bid);
    const load = await get_load(lid);

    if (load[0] === undefined || load[0] === null || boat[0] === undefined || boat[0] === null) {
        res.status(404).json({ 'Error': 'No boat with this boat_id is loaded with the load with this load_id' });
    } else {
        if (load[0].carrier === null) {
            res.status(404).json({ 'Error': 'No boat with this boat_id is loaded with the load with this load_id' });
        }
        else {
            if (load[0].carrier.id != bid) {
                res.status(404).json({ 'Error': 'No boat with this boat_id is loaded with the load with this load_id' });
            }
            else {
                await delete_relationship_boat_load(bid, lid, get_load, update_load)
                    .then(() => res.status(204).end())
            }
        }
    }
});

// get a specified boat's loads
router.get('/:id/loads', async function (req, res) {
    const id = req.params.id;

    get_boat_helper(id)
        .then(boat => {
            if (boat[0] === undefined || boat[0] === null) {
                res.status(404).json({ 'Error': 'No boat with this boat_id exists' });
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
        });
});

// with authentication - get the boats of an authenticated owner
router.get('/', customJwtMiddleware, function (req, res) {
    if (req.user && req.user.name) {
        // JWT is valid, get boats for the user
        get_owner_boats(req.user.name)
            .then(boats => {
                get_all_boats_helper()
                    .then(results => {
                        const boatsAndLoads = results.items.map(boat => {
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
                            boats: boatsAndLoads,
                        };

                        if (results.next) {
                            response.next = results.next;
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
router.put("/:id", customJwtMiddleware, async function (req, res) {
    // JWT Authentication Check
    if (!req.user || !req.user.name) {
        return res.status(401).json({ 'Error': 'Missing/Invalid JWT' });
    }

    if (req.get("content-type") !== "application/json") {
        res.status(415).set("Content-Type", "application/json").json({ "Error": "Server only accepts application/json data." });
    }
    else {
        const id = req.params.id;
        const boat = await get_boat_helper(id);

        //no boat with that ID
        if (boat === undefined || boat === null) {
            res.status(404).json({ 'Error': 'No boat with this boat_id exists' });
        }
        else if (boat.owner !== req.user.name) {
            // Check if the boat is owned by the user
            res.status(403).json({ 'Error': 'Boat is owned by another user' });
        }
        else {
            const name = req.body.name;
            const type = req.body.type;
            const length = req.body.length;
            const loads = req.body.loads;
            const owner = req.body.owner;

            //input validation
            if (!name || !type || !length) {
                res.status(400).json({ "Error": "The request object is missing at least one of the required attributes" });
            }
            else {
                if (await boat_update_name_constraint(name)) {
                    await update_boat(id, name, type, length, loads, owner)
                    res.status(303).location(req.protocol + "://" + req.get("host") + req.baseUrl + "/" + id).end();
                }
                else {
                    res.status(400).set("Content-Type", "application/json").json({ "Error": "A boat with this name already exists" });
                }
            }
        }
    }
});

// with authentication - patch boat name, type, length
router.patch("/:id", customJwtMiddleware, async function (req, res) {
    // JWT Authentication Check
    if (!req.user || !req.user.name) {
        return res.status(401).json({ 'Error': 'Missing/Invalid JWT' });
    }

    if (req.get("content-type") !== "application/json") {
        res.status(415).set("Content-Type", "application/json").json({ "Error": "Server only accepts application/json data." });
    }
    else {
        const id = req.params.id;
        const boat = await get_boat_helper(id);

        // No boat with that ID
        if (boat === undefined || boat === null) {
            res.status(404).json({ 'Error': 'No boat with this boat_id exists' });
        }
        else if (boat.owner !== req.user.name) {
            // Check if the boat is owned by the user
            res.status(403).json({ 'Error': 'Boat is owned by another user' });
        }
        else {
            const name = req.body.name;
            const type = req.body.type;
            const length = req.body.length;
            const loads = req.body.loads;
            const owner = req.body.owner;

            // Input validation
            if (!name && !type && !length) {
                res.status(400).json({ "Error": "The request object is missing all of the 3 possible attributes" });
            }
            else {
                if (await boat_update_name_constraint(name)) {
                    const boatName = (name !== null && name !== undefined) ? name : boat.name;
                    const boatType = (type !== null && type !== undefined) ? type : boat.type;
                    const boatLength = (length !== null && length !== undefined) ? length : boat.length;
                    const boatLoads = (loads !== null && loads !== undefined) ? loads : boat.loads;
                    const boatOwner = (owner !== null && owner !== undefined) ? owner : boat.owner;

                    await update_boat(id, boatName, boatType, boatLength, boatLoads, boatOwner)
                    res.status(204).end();
                }
                else {
                    res.status(400).set("Content-Type", "application/json").json({ "Error": "A boat with this name already exists" });
                }
            }
        }
    }
});

// with authentication - create relationship between boat-load
router.put('/:bid/loads/:lid', customJwtMiddleware, async function (req, res) {
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

// with authentication - delete a boat for a specified owner
router.delete('/:boat_id', customJwtMiddleware, async function (req, res) {
    // Check if JWT is valid
    if (!req.user || !req.user.name) {
        return res.status(401).json({ 'Error': 'Missing/Invalid JWT' });
    }

    try {
        const boat = await get_boat_helper(req.params.boat_id);

        // No boat with this boat_id exists
        if (!boat || boat.length === 0) {
            return res.status(404).json({ 'Error': 'No boat with this boat_id exists' });
        } else if (boat[0].owner !== req.user.name) {
            // Boat is owned by another person
            return res.status(403).json({ 'Error': 'Boat is owned by another person or boat does not exist' });
        } else {
            // Handle the relationship with loads
            const handleLoadRelationships = boat[0].loads && boat[0].loads.length > 0
                ? Promise.all(boat[0].loads.map(loadId => delete_relationship_boat_load(req.params.boat_id, loadId, get_load, update_load)))
                : Promise.resolve();

            // Handle the relationship with the user (if necessary)
            const handleUserRelationship = boat[0].owner
                ? delete_relationship_user_boat(boat[0].owner, req.params.boat_id)
                : Promise.resolve();

            // Execute both actions and then delete the boat
            await Promise.all([handleLoadRelationships, handleUserRelationship]);
            await delete_boat(req.params.boat_id);
            res.status(204).end();
        }
    } catch (error) {
        // Handle any errors that might occur
        res.status(500).json({ 'Error': 'An error occurred while deleting the boat' });
    }
});


/* ------------- End Controller Functions ------------- */

module.exports = { router, get_boat_helper, update_boat };

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
const { LOAD, APP_URL } = require('./constants');

// helper function for managing boat-load relationship
const delete_relationship_boat_load = require('./helpers').delete_relationship_boat_load;

/* ------------- Begin load Model Functions ------------- */

// create a load
async function post_load(volume, item, creation_date, carrier) {
    var key = datastore.key(LOAD);
    const new_load = { "volume": volume, "item": item, "creation_date": creation_date, "carrier": carrier };
    return datastore.save({ "key": key, "data": new_load }).then(() => { return key });
}

// get a specified load
async function get_load(id) {
    const key = datastore.key([LOAD, parseInt(id, 10)]);
    return datastore.get(key).then((entity) => {
        if (entity[0] === undefined || entity[0] === null) {
            return entity;
        } else {
            return entity.map(fromDatastore);
        }
    });
}

// get all loads with pagination
async function get_loads(req) {
    var q = datastore.createQuery(LOAD).limit(3); // Assuming LOAD is the kind for loads in your datastore and you want to limit the query to 5 items
    const results = {};
    if (Object.keys(req.query).includes("cursor")) {
        q = q.start(req.query.cursor);
    }
    return datastore.runQuery(q).then((entities) => {
        results.items = entities[0].map(fromDatastore); // Convert each load entity from the datastore format to your application's format
        if (entities[1].moreResults !== ds.Datastore.NO_MORE_RESULTS) {
            results.next = req.protocol + "://" + req.get("host") + req.baseUrl + "?cursor=" + entities[1].endCursor;
        }
        return results;
    });
}

// update a load
async function update_load(id, volume, item, creation_date, carrier) {
    const key = datastore.key([LOAD, parseInt(id, 10)]);
    if (carrier == null || carrier == undefined) {
        const load = { "volume": volume, "item": item, "creation_date": creation_date, "carrier": null };
        return datastore.save({ "key": key, "data": load });
    }
    else {
        const load = { "volume": volume, "item": item, "creation_date": creation_date, "carrier": carrier };
        return datastore.save({ "key": key, "data": load });
    }
}

// delete a load
async function delete_load(id) {
    const key = datastore.key([LOAD, parseInt(id, 10)]);
    return datastore.delete(key);
}

/* ------------- End Model Functions ------------- */

/* ------------- Begin Controller Functions ------------- */

// create a load
router.post('/', function (req, res) {
    const volume = req.body.volume;
    const item = req.body.item;
    const creation_date = req.body.creation_date;
    const carrier = req.body.carrier || null;

    if (!volume || !item || !creation_date) {
        res.status(400).json({ "Error": "The request object is missing at least one of the required attributes" });
    }
    else {
        post_load(volume, item, creation_date, carrier)
            .then((key) => {
                res.status(201).json({
                    "id": key.id,
                    "volume": volume,
                    "item": item,
                    "creation_date": creation_date,
                    "carrier": carrier,
                    "self": APP_URL + "/loads/" + key.id
                });
            });
    }
});

// get a specified load
router.get('/:id', function (req, res) {
    const id = req.params.id;

    get_load(id)
        .then(load => {
            if (load[0] === undefined || load[0] === null) {
                res.status(404).json({ 'Error': 'No load with this load_id exists' });
            } else {
                load[0]["self"] = APP_URL + "/loads/" + id;
                if (load[0].carrier != null && load[0].carrier != undefined) {
                    load[0].carrier["self"] = APP_URL + "/boats/" + load[0].carrier.id;
                }
                res.status(200).json(load[0]);
            }
        });
});

// get all loads
router.get('/', function (req, res) {
    get_loads(req) // Assuming this function is now modified to handle pagination and return all loads.
        .then(results => {
            const loads = results.items.map(load => {
                load["self"] = APP_URL + "/loads/" + load.id;

                // If the load has a carrier, add a 'self' URL for the carrier.
                if (load.carrier) {
                    load.carrier["self"] = APP_URL + "/boats/" + load.carrier.id;
                }

                return load;
            });

            const response = {
                loads: loads,
            };

            // Add a 'next' property if there is a next page of results
            if (results.next) {
                response.next = results.next;
            }

            // Check the format query parameter
            const format = req.query.format;
            if (format === 'html') {
                // Render the page with the boats data
                res.render('loads', { response: response });
            } else {
                // Default to JSON response if no format is specified or if format is not 'html'
                res.status(200).json(response);
            }
        });
});

// put load volume, item, and creation_date
router.put("/:id", async function (req, res) {
    if (req.get("content-type") !== "application/json") {
        res.status(415).set("Content-Type", "application/json").json({ "Error": "Server only accepts application/json data." })
    }
    else {
        const id = req.params.id;
        const load = await get_load(id);

        //no load with that ID
        if (load === undefined || load === null) {
            res.status(404).json({ 'Error': 'No load with this load_id exists' });
        } else {
            const volume = req.body.volume;
            const item = req.body.item;
            const creation_date = req.body.creation_date;
            const carrier = req.body.carrier;

            //input validation
            if (!volume || !item || !creation_date) {
                res.status(400).json({ "Error": "The request object is missing at least one of the required attributes" });
            }
            else {
                await update_load(id, volume, item, creation_date, carrier)
                res.status(303).location(req.protocol + "://" + req.get("host") + req.baseUrl + "/" + id).end();
            }
        }
    }
});

// patch load volume, item, or creation_date
router.patch("/:id", async function (req, res) {
    if (req.get("content-type") !== "application/json") {
        res.status(415).set("Content-Type", "application/json").json({ "Error": "Server only accepts application/json data." })
    }
    else {
        const id = req.params.id;
        const load = await get_load(id);

        //no load with that ID
        if (load === undefined || load === null) {
            res.status(404).json({ 'Error': 'No load with this load_id exists' });
        } else {
            const volume = req.body.volume;
            const item = req.body.item;
            const creation_date = req.body.creation_date;
            const carrier = req.body.carrier;

            //input validation
            if (!volume && !item && !creation_date) {
                res.status(400).json({ "Error": "The request object is missing all of the 3 possible attributes" });
            }
            else {
                const loadVolume = (volume !== null && volume !== undefined) ? volume : load.volume;
                const loadItem = (item !== null && item !== undefined) ? item : load.item;
                const loadCreation_date = (creation_date !== null && creation_date !== undefined) ? creation_date : load.creation_date;
                const loadCarrier = (carrier !== null && carrier !== undefined) ? carrier : load.carrier;


                await update_load(id, loadVolume, loadItem, loadCreation_date, loadCarrier)
                res.status(204).end()

            }
        }
    }
});

// delete a specified load
router.delete('/:id', async function (req, res) {
    const id = req.params.id;
    const load = await get_load(id);

    //no load with that ID
    if (load[0] === undefined || load[0] === null) {
        res.status(404).json({ 'Error': 'No load with this load_id exists' });
    } else {
        //no carrier inside load
        if (load[0].carrier == null || load[0].carrier == undefined || load[0].carrier == []) {
            delete_load(id).then(() => res.status(204).end())
        }
        //load contains carrier, delete the relationship, then delete load
        else {
            const bid = load[0].carrier.id
            delete_relationship_boat_load(bid, id, get_load, update_load)
                .then(() => delete_load(id))
                .then(() => res.status(204).end())
        }
    }
});

/* ------------- End Controller Functions ------------- */

module.exports = { router, get_load, update_load };

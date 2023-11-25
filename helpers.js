// datastore
const ds = require('./datastore');
const datastore = ds.datastore;

// enviornment variables
const { USER, BOAT } = require('./constants');

// helper function that deletes boat-load relationship if one of them are deleted
async function delete_relationship_boat_load(bid, lid, get_load_func, put_load_func) {
    const b_key = datastore.key([BOAT, parseInt(bid, 10)]);
    return datastore.get(b_key)
        .then(async (boat) => {
            // Check if the boat has loads and if the specific load is assigned to it
            if (typeof (boat[0].loads) != 'undefined') {
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
async function delete_relationship_user_boat(uid, bid, get_boat_func, put_boat_func) {
    const u_key = datastore.key([USER, parseInt(uid, 10)]);
    return datastore.get(u_key)
        .then(async (user) => {
            // Check if the user has boats and if the specific boat is owned by it
            if (typeof (user[0].boats) != 'undefined') {
                const boatIndex = user[0].boats.findIndex(element => element == bid);
                // If the boat is found, remove it
                if (boatIndex > -1) {
                    user[0].boats.splice(boatIndex, 1);
                }
            }
            // Save the user data back to the datastore
            return datastore.save({ "key": u_key, "data": user[0] });
        })
        .then(async () => {
            // Retrieve the boat object and update it
            const boatObject = await get_boat_func(bid);
            // Set the owner to null to reflect that the boat is no longer owned by any user
            const owner = null;
            // Update the boat without the owner information
            return await put_boat_func(bid, boatObject[0].name, boatObject[0].type, boatObject[0].length, boatObject[0].loads, owner);
        });
}

module.exports = { delete_relationship_boat_load, delete_relationship_user_boat };
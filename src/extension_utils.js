exports.send_error = function(msg) {
    process.send({'msg':'error', 'text':msg});
};

exports.saveObject = function(object, dbClient, cb) {
    dbClient.collection('objects', function(coll) {
        object['srcfg:isPublic'] = true;
        object['srcfg:access_granted'] = [];

        console.log(object['@subject']);
        coll.update({'@subject': object['@subject']},
                    object, 
                    {'upsert':true},
                    cb);
    });
};

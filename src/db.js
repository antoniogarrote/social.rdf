var mongodb = require('mongodb');
var configuration = require("./configuration");
var utils = require('./utils').utils;
var core = require('./core');

/**
 * Starts a new connection to the DB using the configuration data
 */
var DB = function() {
    var options = configuration.db.options;
    options["auto_reconnect"] = true;
    options["poolSize"] = 4;
    this.client = new mongodb.Db(configuration.db.db, new mongodb.Server(configuration.db.host,
                                                                         configuration.db.port,
                                                                         options));
};

/**
 * Returns a collection of documents from the DB
 */
DB.prototype.collection = function(collection, f) {
    var that = this;

    var _collection = function() {
        that.client.collection(collection, function(err, collection){
            f(collection);
        });
    };

    if(this.client.state === 'notConnected') {
        this.client.open(function(err, p_client) {
            _collection();
        });
    } else {
        _collection();
    }

};

DB.prototype.bsonid = function(idString) {
    return this.client.bson_serializer.ObjectID(idString);
};

/**
 * Closes DB connection
 */
DB.prototype.close = function() {
    this.client.close();
};

/**
 * Find a JSON-LD node in a Mongo collection
 */
DB.prototype.findRDFNode = function(collectionName, subjectIRI, cb) {
    this.collection(collectionName, function(coll) {
        coll.find({'@subject': subjectIRI}).toArray(function(err, res) {
            cb(false, res[0]);
        });
    });    
};

/**
 * Find a JSON object in a mongodb collection
 */
DB.prototype.findNode = function(collectionName, queryMap, cb) {
    this.collection(collectionName, function(coll) {
        coll.find(queryMap).toArray(function(err, res) {
            cb(false, res[0]);
        });
    });    
};


DB.prototype.findAll = function(collectionName, queryMap, cb) {
    this.collection(collectionName, function(coll) {
        coll.find(queryMap).toArray(function(err, res) {
            cb(false, res);
        });
    });    
};

DB.prototype.paginate = function(collectionName, queryMap, options, cb) {
    this.collection(collectionName, function(coll) {
        coll.find(queryMap,options).toArray(function(err, res) {
            cb(false, res);
        });
    });    
};


/**
 * Updates or creates a Mongo document containing the provided RDF node in the
 * given collection.
 */
DB.prototype.updateRDFNode = function(collectionName, subjectIRI, newNode, cb) {
    this.collection(collectionName, function(coll) {
        coll.update({'@subject':subjectIRI}, newNode, {safe:true, upsert:true}, cb);
    });
};

/**
 * Returns all the accounts in the DB
 */
DB.prototype.accounts = function(cb) {
    var that = this;
    this.collection('accounts', function(coll) {
        coll.find({}).toArray(function(err, res) {
            try{
                cb(err, res);
            } catch(e) {
                cb(true, e);
            }
        });
    });
};

/**
 * Returns all the public bindings in the DB
 */
DB.prototype.publicBindings = function(cb) {
    var that = this;
    this.collection('bindings', function(coll) {
        coll.find({'srcfg:isPublic':'true'}).toArray(function(err, res) {
            try{
                cb(err, utils.cleanMongoProperties(res));
            } catch(e) {
                cb(true, e);
            }
        });
    });
};

/**
 * Returns all the public bindings in the DB
 */
DB.prototype.privateBindings = function(cb) {
    var that = this;
    this.collection('bindings', function(coll) {
        coll.find({'srcfg:isPublic':'false'}).toArray(function(err, res) {
            try {
                cb(err, utils.cleanMongoProperties(res));
            } catch(e) {
                cb(true, e);
            }
        });
    });
};

/**
 * Returns all the public data in all feeds
 */
DB.prototype.publicStream = function(page,limit,sorted,cb) {
    var that = this;
    this.publicBindings(function(err, bindings) {
        if(err) {
            cb(err, bindings);
        } else {
            var bindingIRIs = [];
            for(var i=0; i<bindings.length; i++) {
                bindingIRIs.push(bindings[i]['@subject']);
            };
            that.paginate('stream', 
                          {'srext:bound_to':{'$in': bindingIRIs}}, 
                          {'skip':(page*limit), 'limit':limit, 'sort':sorted},
                          cb);
        }
    });
};

/**
 * Returns all the public data in all feeds
 */
DB.prototype.graphStream = function(page,limit,sorted,bindingIRIs,cb) {
    var that = this;
    this.publicBindings(function(err, bindings) {
        if(err) {
            cb(err, bindings);
        } else {
            that.paginate('stream', 
                          {'srext:bound_to':{'$in': bindingIRIs}}, 
                          {'skip':(page*limit), 'limit':limit, 'sort':sorted},
                          cb);
        }
    });
};

/**
 * Returns all the private data in all feeds
 */
DB.prototype.privateStream = function(cb) {
    var that = this;
    this.privateBindings(function(err, bindings) {
        
        if(err) {
            cb(err, bindings);
        } else {
            var bindingIRIs = [];
            for(var i=0; i<bindings.length; i++) {
                bindingIRIs.push(bindings[i]['@subject']);
            };
            that.findAll('stream', {'srext:bound_to':{'$in': bindingIRIs}}, cb);
        }
    });
};

/**
 * Returns the configuration object
 */
DB.prototype.configuration = function(cb) {
    this.collection('configuration', function(coll) {
        coll.find({}).toArray(function(err, res) {
            cb(false, res[0]);
        });
    });
};

/**
 * Creates a web hook request
 *
 * webID: URI of the webid requesting the web hook creation
 * graph: graph where the hoook will be attached, must match the srcfg:hasValue of 
 *        of some binding
 * name:  name for the hook
 * query: *valid* SPARQL query that will be executed when the hook si fired
 */
DB.prototype.saveWebHookRequest = function(webID, graph, cbURL, name, query, cb) {
    var that = this;
    this.collection('bindings', function(coll) {
        coll.find({'srcfg:hasValue': graph,
                   'srcfg:isPublic': 'true'}).toArray(function(err, res) {
            if(res.length==1) {
                that.collection('webhooks', function(coll) {
                    coll.insert(core.vocabulary.webhooks.makeWebHook(webID,
                                                                     res[0],
                                                                     cbURL,
                                                                     name,
                                                                     query),
                               cb);
                });
            } else {
                cb(true, "Graph not found");
            }
        });
    });
};
// Exports
exports.DB = DB;

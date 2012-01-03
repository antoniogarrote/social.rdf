var rdfstore = require('./../rdfstore.js');
var configuration = require('./../configuration');
var core = require('./../core');
var utils = require("./../utils").utils;
var cp = require('child_process');
var db = require('./../db');

var routes = {'/webhooks': 'webhooksHandler'};

var dbClient = new db.DB();

var Services = function(options){
    this.extensions = options.extensions;    
};

var serveFile = utils.serveFile(configuration.admin.docroot);

/**
 * Routing logic
 */
Services.prototype.route = function(request, response, data, webID) {
    var handler = null;

    for(var path in routes) {
        if (request.url.indexOf(configuration.protected.baseUrl+path) == 0) {
            handler = routes[path];
            break;
        }
    }

    if(handler != null) {
        this[handler](request.url.split(configuration.admin.baseUrl)[1], request, response, data, request.profileWebId);
    } else {
        var parts = request.url.split(configuration.admin.baseUrl);
        if(parts.length > 2) {
            parts.shift();
            request.url = parts.join(configuration.admin.baseUrl);
        } else {
            request.url  = parts[1];
        }

        if(request.url != null) {
            serveFile(request, response);
        } else {
            response.writeHead(404, {"Content-Type":"text/plain"});
            response.end();
        }
    }
};

/**
 * Returns all the loaded extensions as JSON-LD objects.
 */
Services.prototype.webhooksHandler = function(path, request, response, data, webID) {
    var that = this;
    if(request.method === 'GET') {
        response.withCORSHeader(200, {"Content-Type":"text/plain"});
        response.end(new Buffer("hey"), "utf-8");
    } else if(request.method === 'POST'){
        response.withCORSHeader(201, {"Content-Type":"text/plain"});
        that._createWebHook(request, response, data, webID);
    } else if(request.method === 'DELETE') {
        response.withCORSHeader(401, {"Content-Type":"text/plain"});
        response.end();
    } else if(request.method === 'OPTIONS') {
        response.withCORSHeader(200, {"Content-Type":"text/plain"});
        response.end();
    } else {
        response.writeHead(401, {"Content-Type":"text/plain"});
        response.end();
    }
};

// manages the extension installation process
Services.prototype._createWebHook = function(request, response, data, webID) {
    var params = JSON.parse(data);
    var graph = params['graph'];
    var name = params['name'] || "";
    var query = params['query'];
    var cbURL = params['callback'];

    graph = graph.split("/stream")[1].split(".")[0];

    if(graph == null) {
        response.withCORSHeader(401, {"Content-Type":"text/plain"});
        response.end();
    } else {
        rdfstore.create(function(store){    
            try {
                store.execute(query, function(success, res) {
                    // query is valid
                    if(success) {
                        dbClient.saveWebHookRequest(webID['@subject'], graph, cbURL, name, query,
                                                    function(err, res) {
                                                        console.log(err);
                                                        console.log(res);
                                                        if(err){
                                                            response.withCORSHeader(401, {"Content-Type":"text/plain"});
                                                            response.end();
                                                        } else {
                                                            response.withCORSHeader(201, {"Content-Type":"text/plain"});
                                                            response.end();
                                                        }
                                                    });
                    }
                });
            } catch(e) {
                console.log(e);
                response.withCORSHeader(401, {"Content-Type":"text/plain"});
                response.end(new Buffer("Invalid SPARQL query"),"utf-8");
            }
        });
    }
};

// exports
exports.Services = Services;

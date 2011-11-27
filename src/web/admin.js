var rdfstore = require('./../rdfstore.js');
var configuration = require('./../configuration');
var core = require('./../core');
var utils = require("./../utils").utils;
var cp = require('child_process');
var db = require('./../db');

var routes = {'/extensions': 'extensionsHandler',
              '/configuration': 'configurationHandler',
              '/webid': 'webIDHandler',
              '/webhooks':'webhooksHandler'};

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
        if (request.url.indexOf(configuration.admin.baseUrl+path) == 0) {
            handler = routes[path];
            break;
        }
    }
    
    if(handler != null) {
        this[handler](request.url.split(configuration.admin.baseUrl)[1], request, response, data, webID);
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
Services.prototype.extensionsHandler = function(path, request, response, data, webID) {
    var that = this;
    if(request.method === 'GET') {
        var extensions = [];
        for(var i=0; i<this.extensions.length; i++) {
            extensions.push(core.vocabulary.extensions.makeExtension(this.extensions[i]));
        }
        dbClient.findAll('accounts', {}, function(err,accounts){
            if(err) {
                response.writeHead(401, {"Content-Type":"text/plain"});
                response.end();
            } else {
                for(var i=0; i<accounts.length; i++) {
                    extensions.push(utils.cleanMongoProperties(accounts[i]));
                }
                response.writeHead(200, {"Content-Type":"application/json"});
                response.end(new Buffer(JSON.stringify(extensions)),'utf-8');
            }
        });
    } else if(request.method === 'POST'){
        that._createExtensionHandler(request, response, data, webID);
    } else if(request.method === 'PUT') {
        // update a list o extensions
        that._updateExtensionsHandler(request, response, data, webID);
    } else {
        response.writeHead(401, {"Content-Type":"text/plain"});
        response.end();
    }
};

// manages the extension installation process
Services.prototype._createExtensionHandler = function(request, response, data, webID) {
    var that = this;
    utils.seq(
        [true, function(_, env, k){
            // import response data containing request graph
            console.log('loading data into store');
            rdfstore.create(function(store) {
                console.log('created, loading');
                env['store'] = store;
                store.load("application/json", data, k);
            });

        }],
        [true, function(_, env, k){
            console.log('select extension');
            env['store'].execute("SELECT ?extension { ?extension a <http://social-rdf.org/vocab/Extension> }", k);

        }],
        [true, function(extensions, env, k){
            // store extension IRI and retrieve the configuration options in the request
            console.log('found extension, getting config data');
            env['extensionIri'] = extensions[0].extension.value; // there should be only one extension
            console.log("EXTENSION:"+env['extensionIri']);
            env['store'].execute("SELECT ?option ?value { ?option a <http://social-rdf.org/vocab/configuration#ConfigurationData> .\
                                                          ?option <"+core.vocabulary.configuration.hasValue+"> ?value }",k);
        }],
        [true, function(configurationOptions, env, k) {
            // build a configuration options map , retrieve the extension object and invoke the installation function
            console.log('got config data, installing');            
            console.log(configurationOptions);
            var configurationMap = {};
            for(var i=0; i<configurationOptions.length; i++) {
                configurationMap[configurationOptions[i].option.value] = configurationOptions[i].value.value;
            }
            console.log("Looking for extension");
            console.log(configurationMap);
            var ExtensionModule = core.extensions.findExtension(env['extensionIri'], that.extensions);
            var extension = new ExtensionModule();
            if(extension != null) {
                console.log("INVOKING EXTENSION");
                console.log(extension);
                extension.installForWebID(configurationMap, webID, k);
            } else {
                k(false, "Not found extension :"+env['extensionIri']);
            }

        }],
        function(accountGraph, env, k) {
            console.log('Installed!!!');            

            var timestamp = new Date().getTime();
            env['timestamp'] = timestamp;
            var accountUri = env['extensionIri'] + "_generated_" + timestamp;
            accountGraph['@subject'] = accountUri;
            core.jsonld.addValue(accountGraph, core.vocabulary.configuration.account_generated_by, env['extensionIri'], '@iri');
            core.jsonld.addValue(accountGraph, core.vocabulary.sioc.has_owner, webID['@subject'], '@iri');
            env['accountGraph'] = accountGraph;

            console.log("UPDATING ACCOUNT GRAPH");
            console.log(accountGraph);

            dbClient.updateRDFNode('accounts', accountUri, accountGraph, k);

        },
        [true,function(_, env, k) {

            env['store'].execute("SELECT * { ?binding a <http://social-rdf.org/vocab/configuration#URLBinding> . ?binding ?p ?o }",k);

        }],
        function(bindings, env, k) {
            env.newBindings = [];
            var newBindings = env.newBindings;
            var configurationMap = {};
            console.log("creating binding objects");
            for(var i=0; i<bindings.length; i++) {
                console.log(bindings[i].binding.value);
                var node = configurationMap[bindings[i].binding.value];
                if(node == null) {
                    node = {'@context': {'@coerce':{}},
                            '@subject': env['extensionIri'] + "_binding_" + env['timestamp'] + "_" + i };
                    core.jsonld.addValue(node, core.vocabulary.configuration.account_generated_by, env['extensionIri'], '@iri');
                }
                
                if(bindings[i].o.token === 'uri') {
                    core.jsonld.addValue(node, bindings[i].p.value, bindings[i].o.value, '@iri');
                } else {
                    core.jsonld.addValue(node, bindings[i].p.value, bindings[i].o.value, bindings[i].o.datatype);
                }
                configurationMap[bindings[i].binding.value] = node;
            }
            
            console.log("collecting bindings in array");
            var bindings = [];
            for(var p in configurationMap) {
                bindings.push(configurationMap[p]);
            }
            
            console.log("performing insertions");
            utils.repeat(0, bindings.length, function(k, env){
                var floop = arguments.callee;
                console.log("inserting");
                console.log(bindings[env._i]['@subject']);
                console.log(bindings[env._i]);
                dbClient.updateRDFNode('bindings', bindings[env._i]['@subject'], bindings[env._i], function(){
                    newBindings.push(bindings[env._i]);
                    k(floop, env);
                });
            },function() {

                
                console.log("ANSWERING");
                var objects = env['newBindings'] || [];
                objects.push(env['accountGraph']);

                try {
                    var extensionIri = env['extensionIri'];
                    var accountIri = env['accountGraph']['@subject'];
                    console.log(" -- starting account <"+accountIri+"> generated by <"+extensionIri+"> (IMPORT)");
                    var child = cp.fork(__dirname + '/../extension_launcher.js',
                                        [extensionIri, accountIri, 'import']);
                    console.log(" -- account forked");
                    console.log(" -- starting account <"+accountIri+"> generated by <"+extensionIri+">");
                    var child = cp.fork(__dirname + '/../extension_launcher.js',
                                        [extensionIri, accountIri, 'execute']);
                    console.log(" -- account forked");
                    core.extensions.registerExtensionAccount(accountIri, child);
                } catch(e) {
                    console.log("(!!) error starting child processes: ");
                    console.log(e);
                }

                
                response.writeHead(200, {"Content-Type":"application/json"});
                response.end(new Buffer(JSON.stringify(utils.cleanMongoProperties(objects))), 'utf-8');
            });
        },
        // error handler
        function(err,env){
            console.log("ERROR:");
            console.log(err);
            response.writeHead(401, {"Content-Type":"text/plain"});
            response.end();
        }

    ); // end of utils.seq
};

/**
 * Returns configuration info about the server
 */
Services.prototype.configurationHandler = function(path, request, response, data, webID) {
    var that = this;
    if(request.method === 'GET') {
        core.vocabulary.configuration.makeWebIDConfigurationData(function(err, config) {
            if(err) {
                response.writeHead(500, {"Content-Type":"text/plain"});
                response.end();
            } else {
                config = [utils.cleanMongoProperties(config)];
                response.writeHead(200, {"Content-Type":"application/json"});
                response.end(new Buffer(JSON.stringify(config)),'utf-8');
            }
        });
    } else if(request.method === 'PUT'){
        // Update profile here
        response.writeHead(401, {"Content-Type":"text/plain"});
        response.end();
    } else {
        response.writeHead(401, {"Content-Type":"text/plain"});
        response.end();
    }
}

/**
 * Returns Managed WebID and associated profile information  as JSON-LD objects.
 */
Services.prototype.webIDHandler = function(path, request, response, data, webID) {
    var that = this;
    if(request.method === 'GET') {
        core.managedWebID(function(err, node) {
            if(err) {
                response.writeHead(500, {"Content-Type":"text/plain"});
                response.end();
            } else {
                var webid = utils.cleanMongoProperties(node);
                dbClient.findAll('accounts', {}, function(err,accounts){
                    var accountsAcum = [];
                    for(var i=0; i<accounts.length; i++) {
                        accountsAcum.push(utils.cleanMongoProperties(accounts[i]));
                    }
                    rdfstore.create(function(store) {
                        var extensions = [];
                        for(var i=0; i<that.extensions.length; i++) {
                            extensions.push(core.vocabulary.extensions.makeExtension(that.extensions[i]));
                        }
                        store.load("application/json",accountsAcum, function(){
                            store.load("application/json",extensions, function(){
                                store.execute("SELECT ?service ?property ?value WHERE { \
                                                        ?account <http://social-rdf.org/vocab/configuration#isPublic> ?property .\
                                                        ?account ?property ?value .\
                                                        ?account <http://social-rdf.org/vocab/configuration#account_generated_by> ?extension.\
                                                        ?extension <http://social-rdf.org/vocab/extensions#serviceWrapped> ?service }",
                                              function(success, results){
                                                  if(success) {
                                                      var accounts = {};
                                                      for(var i=0; i<results.length; i++) {
                                                          var service = results[i].service.value;
                                                          var serviceObject = accounts[service] || {'@type': ["http://xmlns.com/foaf/0.1/OnlineAccount"],
                                                                                                    '@context':{'foaf':'http://xmlns.com/foaf/0.1/'},
                                                                                                    'foaf:accountServiceHomepage': service};
                                                          accounts[service] = serviceObject;

                                                          if(results[i].value.token === 'uri') {
                                                              core.jsonld.addValue(serviceObject, 
                                                                                   results[i].property.value,
                                                                                   results[i].value.value,
                                                                                   '@iri');
                                                          } else {
                                                              core.jsonld.addValue(serviceObject, 
                                                                                   results[i].property.value,
                                                                                   results[i].value.value,
                                                                                   results[i].value.datatytpe);
                                                          }
                                                      }

                                                      webid["foaf:holdsAccount"] = [];
                                                      for(var p in accounts) {
                                                          webid["foaf:holdsAccount"].push(accounts[p])
                                                      }

                                                      response.writeHead(200, {"Content-Type":"application/json"});
                                                      response.end(new Buffer(JSON.stringify([webid])),'utf-8');
                                                  } else {
                                                      response.writeHead(500, {"Content-Type":"text/plain"});
                                                      response.end();
                                                  }
                                              });
                            });
                        });
                    });
                });
            }
        });
    } else if(request.method === 'PUT'){
        core.managedWebID(function(err,node){

            var newWebID = JSON.parse(data);

            // validations
            if(node['foaf:maker'] == (newWebID['foaf:maker'] || newWebID['http://xmlns.com/foaf/0.1/maker']) &&
               node['foaf:primaryTopic'] == (newWebID['foaf:primaryTopic'] || newWebID['http://xmlns.com/foaf/0.1/primaryTopic']) &&
               node['@subject'] === newWebID['@subject']) {
                var purged = {};
                for(var p in newWebID) {
                    // properties must be compacted
                    // @todo
                    // is safer to import into a new store and then,
                    // use core.graphToJSONLD to re-encode the JSON object.
                    if(p.indexOf(".") == -1) {
                        purged[p] = newWebID[p];
                    }
                }
                dbClient.updateRDFNode('webids',purged['@subject'],purged,
                                      function(err, data){
                                          if(err) {
                                              response.writeHead(401, {"Content-Type":"text/plain"});
                                              response.end();
                                          } else {
                                              response.writeHead(200, {"Content-Type":"text/plain"});
                                              response.end();
                                          } 
                                      });
            } else {
                response.writeHead(401, {"Content-Type":"text/plain"});
                response.end();
            }
        });
    } else {
        response.writeHead(401, {"Content-Type":"text/plain"});
        response.end();
    }
};

// manages the extension installation process
Services.prototype._updateExtensionsHandler = function(request, response, data, webID) {
    var extensions = JSON.parse(data);
    utils.repeat(0,extensions.length, function(k,env){
        var floop = arguments.callee;
        core.jsonld.normalize(extensions[env._i]['@subject'], extensions[env._i], function(res, normalized) {
 	    if(res) {
                dbClient.updateRDFNode('accounts', extensions[env._i]['@subject'], normalized, function(){
                    k(floop, env);
                });
            } else {
                response.writeHead(500, {"Content-Type":"application/json"});
                response.end();
            }
        });
    },function(env){
        response.writeHead(200, {"Content-Type":"application/json"});
        response.end();
    });
};

// exports
exports.Services = Services;

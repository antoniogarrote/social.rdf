var rdfstore = require('./../rdfstore.js');
var configuration = require('./../configuration');
var core = require('./../core');
var utils = require("./../utils").utils;
var db = require('./../db');
var views = require('./views');

var routes = {'singleStreamPostHandler': /\/stream\/([^\/]+)\/([^\/]+)/,
              'graphStreamHandler': /\/stream\/([^\/]+)/,
              'streamHandler':/\/stream/};

var webIDPath = configuration.webIDPath
if(webIDPath.indexOf("#") !== -1) {
    webIDPath = webIDPath.split("#")[0];
}

var dbClient = new db.DB();

var Services = function(options){
    this.extensions = options.extensions;    
};

var serveFile = utils.serveFile(configuration.public.docroot);
/**
 * Routing logic
 */
Services.prototype.route = function(request, response, data) {
    var handler = null;
    var components = null;

    if(request.url === webIDPath) {
        handler = 'publicWebIDHandler';
    } else if(request.url.indexOf(configuration.public.baseUrl)!=0) {
        response.withCORSHeader(404, {"Content-Type":"text/plain"});
        response.end();
    } else {
        for(var handlerString in routes) {
            var path = routes[handlerString];
            var requestPath = request.url.split("?")[0].split(configuration.public.baseUrl).pop();
           request.requestPath = requestPath;

            if(requestPath && requestPath[requestPath.length-1] == '/') {
                requestPath = requestPath.substring(0,requestPath.length-1);
            }
            components = requestPath.match(path);
            if (components!=null) {
                handler = handlerString;
                break;
            }
        }
    }

    if(handler != null) {
        this[handler](request.url.split(configuration.public.baseUrl)[1], request, components, response, data);
    } else {
        var orig = request.url;
        var parts = request.url.split(configuration.public.baseUrl);
        if(parts.length > 2) {
            parts.shift();
            request.url = parts.join(configuration.public.baseUrl);
        } else {
            request.url  = parts[1];
        }

        if(request.url != null) {
            serveFile(request, response);
        } if(request.url.indexOf('semantic_ko')!=-1) {
            request.url = orig;
            serveFile(request, response);
        } else {
            response.withCORSHeader(404, {"Content-Type":"text/plain"});
            response.end();
        }
    }
};

// Returns all the media types in the request as an array
Services.prototype.mediaTypes = function(request, defaultMediaType) {
    var mediaTypes = request.headers['Accept'] || request.headers['accept'] || "text/html";
    mediaTypes = mediaTypes.split(";")[0];
    mediaTypes = mediaTypes.split(',');

    if(mediaTypes.length == 0) {
        mediaTypes[0] = defaultMediaType;
    }

    return mediaTypes;
};

Services.prototype.mediaTypeTemplate = function(request) {
    var mediaTypes = request.headers['Accept'] || request.headers['accept'] || "text/html";
    mediaTypes = mediaTypes.split(";")[0];
    mediaTypes = mediaTypes.split(',');
    for(var i=0; i<mediaTypes.length; i++) {
        if(configuration.mediaTypeTemplates[mediaTypes[i]]) {
            return [mediaTypes[i], configuration.mediaTypeTemplates[mediaTypes[i]]];
        }
    }

    return ['text/html', configuration.mediaTypeTemplates['*']];
};

/**
 * Returns all the loaded extensions as JSON-LD objects.
 */
Services.prototype.streamHandler = function(path, request, components, response, data) {
    var that = this;
    var mediaTypeInfo = this.mediaTypeTemplate(request);
    mediaTypeResp = mediaTypeInfo[0];
    mediaTypeTmpl = mediaTypeInfo[1];
    var params = utils.params(request.url);

    // set page
    var page;
    try {
        page = parseInt((params['page']||1));
        if(page<1) {
            page=1;
        }
    } catch(e) {
        page = 1;
    }
    var limit = configuration.itemsPerPage || 30;

    if(request.method === 'GET') {
        dbClient.publicStream((page-1),limit,{'dcterms:created':-1},function(err, nodes) {
            if(err) {
                response.withCORSHeader(500, {"Content-Type":"text/plain"});
                response.end();
            } else {
                core.vocabulary.addGraphIris(nodes,'public',configuration.public.baseUrl+'/stream');
                var updated = new Date();
                if(nodes != null &&  nodes.length>0 && nodes[0]['dcterms:created']) {
                    updated = nodes[0]['dcterms:created'];
                }

                views.render('feed', mediaTypeTmpl, nodes, {'feedTitle':'Public Global Graph',
                                                            'current_graph':configuration.public.baseUrl+'/stream',
                                                            'updated': updated,             
                                                            'graphs': core.bindings.graphURIs(null),
                                                            'page':page,
                                                            'prev-link':configuration.public.baseUrl+'/stream?page='+(page-1<1 ? 1 : (page-1)),
                                                            'next-link':configuration.public.baseUrl+'/stream?page='+(page+1)}, request, function(err, rendered) {
                                                                if(err) {
                                                                    response.withCORSHeader(500, {"Content-Type":"text/plain"});
                                                                    response.end();
                                                                } else {
                                                                    response.withCORSHeader(200, {"Content-Type":mediaTypeResp, "Charset":"utf-8"});
                                                                    response.end(new Buffer(rendered),'utf-8');
                                                                }
                                                            });
            }
        });
    } else if(request.method === 'OPTIONS') {
        response.withCORSHeader(200, {"Content-Type":"text/plain"});
        response.end();
    } else {
        response.withCORSHeader(401, {"Content-Type":"text/plain"});
        response.end();
    }
};

/**
 * Returs a set of JSON-LD microblo posts grouped in the provided Graph ID
 */
Services.prototype.graphStreamHandler = function(path, request, components, response, data) {
    var graphId = "/stream/"+components[1];

    var graphData = core.bindings.map[graphId];

    if(graphData != null) {
	var that = this;
        var mediaTypeInfo = this.mediaTypeTemplate(request);
        mediaTypeResp = mediaTypeInfo[0];
        mediaTypeTmpl = mediaTypeInfo[1];

        var params = utils.params(request.url);

        // set page
        var page;
        try {
            page = parseInt((params['page']||1));
            if(page<1) {
                page=1;
            }
        } catch(e) {
            page = 1;
        }

        var limit = configuration.itemsPerPage || 30;

	if(request.method === 'GET') {
            dbClient.graphStream((page-1),limit,{'dcterms:created':-1},graphData['binding'],function(err, nodes) {
                if(err) {
                    response.withCORSHeader(500, {"Content-Type":"text/plain"});
                    response.end();
                } else {
                    core.vocabulary.addGraphIris(nodes,'public',configuration.public.baseUrl+'/stream');
                    var updated = new Date();
                    if(nodes != null &&  nodes.length>0 && nodes[0]['dcterms:created']) {
                        updated = nodes[0]['dcterms:created'];
                    }

                    views.render('feed', 
                                 mediaTypeTmpl,
                                 nodes, 
                                 {'feedTitle':'Public Graph: '+components[1],
                                  'current_graph':'/social'+graphId,
                                  'updated': updated,
                                  'graphs': core.bindings.graphURIs(null),
                                  'page':page,
                                  'prev-link':'/social'+graphId+'?page='+(page-1<1 ? 1 : (page-1)),
                                  'next-link':'/social'+graphId+'?page='+(page+1)}, 
                                 request, 
                                 function(err, rendered) {
                                     if(err) {
                                         response.withCORSHeader(500, {"Content-Type":"text/plain"});
                                         response.end();
                                     } else {
                                         response.withCORSHeader(200, {"Content-Type":mediaTypeResp, "Charset":"utf-8"});
                                         response.end(new Buffer(rendered),'utf-8');
                                     }
                                 });
                }
            });
	} else {
            response.withCORSHeader(401, {"Content-Type":"text/plain"});
            response.end();
	}
    } else {
        response.withCORSHeader(404, {"Content-Type":"text/plain"});
        response.end();
    }
};

/**
 * Returns a single JSON-LD microblog post object identified by the provided ID
 */
Services.prototype.singleStreamPostHandler = function(path, request, components, response, data) {
    var nodeId = dbClient.bsonid(components[2]);
    var graphId = configuration.public.baseUrl+"/stream/"+components[1]+"/"+components[2];
    var that = this;
    var mediaTypeInfo = this.mediaTypeTemplate(request);
    mediaTypeResp = mediaTypeInfo[0];
    mediaTypeTmpl = mediaTypeInfo[1];

    if(request.method === 'GET') {
        dbClient.findNode('stream', {'_id':nodeId}, function(err, node) {
            if(err) {
                response.withCORSHeader(500, {"Content-Type":"text/plain"});
                response.end();
            } else if(node==null) {
                response.withCORSHeader(404, {"Content-Type":"text/plain"});
                response.end();
            } else {
                var nodes = [node];
                core.vocabulary.addGraphIris(nodes,'public',configuration.public.baseUrl+'/stream');
                var updated = new Date();
                if(nodes != null &&  nodes.length>0 && nodes[0]['dcterms:created']) {
                    updated = nodes[0]['dcterms:created'];
                }
                views.render('feed', mediaTypeTmpl, nodes, 
                             {'feedTitle':'Public Graph: '+configuration.public.baseUrl+'/'+components[1]+'/'+components[2],
                              'current_graph':graphId,
                              'updated': updated,                 
                              'graphs': core.bindings.graphURIs(null),
                              'page':1,
                              'prev-link':graphId+"?page=1",
                              'next-link':graphId+"?page=1"},
                             request, function(err, rendered) {
                    if(err) {
                        response.withCORSHeader(500, {"Content-Type":"text/plain"});
                        response.end();
                    } else {
                        response.withCORSHeader(200, {"Content-Type":mediaTypeResp, "Charset":"utf-8"});
                        response.end(new Buffer(rendered),'utf-8');
                    }
                });
            }
        });
    } else {
        response.withCORSHeader(401, {"Content-Type":"text/plain"});
        response.end();
    }
};


/**
 * Returns the public WebID profile
 */
Services.prototype.publicWebIDHandler = function(path, request, components, response, data) {
    var that = this;
    dbClient.configuration(function(err, config) {
        if(err) {
            response.withCORSHeader(500, {"Content-Type":"text/plain"});
            response.end();
        } else {
            if(config.localWebid) {
                // We are the providers, build the RDF graph with
                // profile + certificate info and encode it using the rig
                // representation

                core.managedWebID(function(err, profile) {
                    if(err) {
                        response.withCORSHeader(500, {"Content-Type":"text/plain"});
                        response.end();
                    } else {

                        var modulus = config.modulus;
                        var exponent = config.exponent;
                        var webID = config.webid;
                        var certificate = core.vocabulary.auth.makeCertificate(modulus, exponent, webID);

                        var exportMediaType = that.mediaTypes(request, "application/rdf+xml")[0];
                        that._addAccountsPublicProperties(profile,function(err, profile) {
                            if(exportMediaType === 'text/html') {
                                var formattedAccounts = [];
                                var formattedAccount;
                                profile['foaf:holdsAccount'] = profile['foaf:holdsAccount'] || [];
                                for(var i=0; i<profile['foaf:holdsAccount'].length; i++) {
                                    formattedAccount = that._prepareWebIDProfileForRDFa(profile['foaf:holdsAccount'][i]);
                                    formattedAccount['foaf:accountServiceHomepage'] = profile['foaf:holdsAccount'][i]['foaf:accountServiceHomepage'];
                                    formattedAccounts.push(formattedAccount);
                                }

                                var formatted = that._prepareWebIDProfileForRDFa(profile);
                                formatted['foaf:holdsAccount'] = formattedAccounts;
                                formatted['certificate'] = certificate;
                                views.renderWebIDRDFa(formatted, {}, function(err, data) {
                                    if(err) {
                                        response.withCORSHeader(500, {"Content-Type":"text/plain"});
                                        response.end();
                                    } else {
                                        response.withCORSHeader(200, {"Content-Type":'text/html'});
                                        response.end(new Buffer(data),'utf-8');
                                    }
                                });
                            } else {
                                core.jsonld.encode([utils.cleanMongoProperties(profile), 
                                                    utils.cleanMongoProperties(certificate)], exportMediaType, function(err, data) {
                                                        if(err) {
                                                            response.withCORSHeader(500, {"Content-Type":"text/plain"});
                                                            response.end();
                                                        } else {
                                                            response.withCORSHeader(200, {"Content-Type":exportMediaType});
                                                            response.end(new Buffer(data),'utf-8');
                                                        }
                                                    });
                            }
                        });
                        
                    }
                });

            } else {
                // redirection to the remote server
                response.withCORSHeader(301, {"Content-Type":"text/plain",
                                              "Location": config.webid});
                response.end();

            }
        }
    });
};

Services.prototype._prepareWebIDProfileForRDFa = function(webid) {
    var acum = {'@subject': webid['@subject'],
                'properties': []};

    var isIri, prop;
    for(var p in webid) {
        if(p!='foaf:holdsAccount' && p[0] != '@' && p[0] != '_') {
            isIri = false;
            prop = {'name': p};
            if(webid['@context'] && 
               webid['@context']['@coerce'] && 
               webid['@context']['@coerce']['@iri'] && 
               webid['@context']['@coerce']['@iri'].length) {
                
                for(var i=0; i<webid['@context']['@coerce']['@iri'].length; i++) {
                    if(webid['@context']['@coerce']['@iri'][i] === p) {
                        isIri = true;
                        break;
                    }
                }
            }

            if(isIri) {
                prop['urivalue'] = {'name':p, 'value':webid[p]};
            } else {
                if(webid[p] && webid[p].constructor == Date) {
                    prop['datavalue'] = {'name':p, 'value':webid[p], 'html_value':webid[p].format("m/dd/yyyy - HH:MM")};
                } else {
                    prop['datavalue'] = {'name':p, 'value':webid[p], 'html_value':webid[p]};
                }
            }

            acum['properties'].push(prop);
        }
    }

    return acum;
};

Services.prototype._addAccountsPublicProperties = function(webid,cb) {
    var that = this;
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
                                          cb(false, webid);
                                      } else {
                                          cb(true,webid);
                                      }
                                  });
                    });
            });
        });
    });
};

// exports
exports.Services = Services;

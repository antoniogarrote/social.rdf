var fs = require('fs');

var raptor = require('./raptor.js');
var configuration = require('./configuration');
var db = require('./db');
var webid = require('./webid');
var rdfstore = require('./rdfstore.js');
var utils = require('./utils');

// DB connection
var dbClient = new db.DB();

/**
 * Setups the system.
 * ++ If mustGenerate is false -> remote WebID:
 *    Performs the following actions:
 *      - Stores the system WebID
 *      - Stores the profile for the system WebID
 * ++ If mustGenerate is true -> generate new ID:
 *    - Creates certificate + password
 *    - saves certificate
 *    - Stores the system WebID
 *    - Stores the profile for the system WebID
 */
exports.setup = function(mustGenerate, options, cb) {
    // local function that stores the WebID information in the DB.
    var storeWebId = function(node, uri, isLocal, modulus, exponent) {
        dbClient.collection('configuration', function(coll) {
            coll.insert({'webid': uri, 'localWebid': isLocal, 
                         'modulus': modulus, 'exponent': exponent}, 
                        function(err, res){
                            if(err) {
                                cb(err, res);
                            } else {
                                dbClient.collection('webids', function(coll) {
                                    coll.insert(node, function(err, res){
                                        if(err) {
                                            cb(err, res);
                                        } else {
                                            cb(false, 'created');
                                        }
                                    });
                                });
                            }
                        });
        });
    };

    if(!mustGenerate) {
        var uri = options;
        webid.getWebID(uri, function(err, node) {
            if(err) {
                cb(err, node);
            } else {
                storeWebId(node, uri, false);
            }
        });
    } else {
        var newId = "http://"+configuration.domain;
        if(configuration.public.port != 80) {
            newId += ":" + configuration.public.port;
        }
        newId += configuration.webIDPath;

        webid.generateCertificate(newId, options, __dirname+"/../webid.p12", function(err, node){
            // node is a JSON-LD graph
            storeWebId(exports.vocabulary.auth.makeBasicProfile(newId), 
                       newId,
                       true, node['cert:modulus'], node['cert:exponent']);
        });                                 
    }
};

/**
 * Transforms a RDF-Inteface javascript graph object
 * into an array of JSON-LD nodes
 */
exports.graphToJSONLD = function(graph, rdf) {
    var nodes = {};
    
    graph.forEach(function(triple) {
        var subject = triple.subject.valueOf();
        var node = nodes[subject];
        if(node == null) {
            node = {"@subject" : subject, "@context": {}};
            nodes[subject] = node;
        }

        var predicate = triple.predicate.valueOf();
        if(predicate === "http://www.w3.org/1999/02/22-rdf-syntax-ns#type") {
            predicate = "@type";
        }

        var property  = null;
        var isCURIE = false;

        property = rdf.prefixes.shrink(predicate);

        if(property != predicate) {
            isCURIE = true;
        }
        if(property.indexOf("#") != -1) {
            property = property.split("#")[1];
        } else {
            property = property.split("/");
            property = property[property.length-1];
        }

        var object = triple.object.valueOf();

        if(node[property] != null) {
            if(!isCURIE) {
                if(node["@context"][property] != null || property[0] === '@') {
                    if(typeof(node[property]) === "object") {
                        node[property].push(object);
                    } else {
                        var object = [ node[property], object];
                        node[property] = object;
                    }
                } else {
                    property = triple.predicate.valueOf();
                    if(node[property] == null) {
                        node[property] = object;
                    } else {
                        if(typeof(node[property]) === "object") {
                            node[property].push(object);
                        } else {
                            var object = [ node[property], object ];
                            node[property] = object;
                        }
                    }

                    if(typeof(object) === 'string' &&
                       (object.indexOf("http://") == 0 || object.indexOf("https://") == 0)) {
                        exports.jsonld.coerce(node, property, "@iri")
                    }
                }
            } else {
                var prefix = property.split(":")[0];
                if(typeof(node[property]) === "object") {
                    node[property].push(object);
                } else {
                    var object = [ node[property], object];
                    node[property] = object;
                }
            }
        } else {
            node[property] = object;
            if(property[0] != '@') {
                if(isCURIE == true) {
                    // saving prefix
                    var prefix = property.split(":")[0];
                    node["@context"][prefix] = rdf.prefixes[prefix];
                } else {
                    // saving whole URI in context
                    node["@context"][property] = triple.predicate.valueOf();
                }

                if(typeof(object) === 'string' &&
                   (object.indexOf("http://") == 0 || object.indexOf("https://") == 0)) {
                    exports.jsonld.coerce(node, property, "@iri")
                }
                
            }
        }
    });

    var results = [];
    for(var p in nodes) {
        results.push(nodes[p]);
    }

    return results;
};

exports.managedWebID = function(cb) {
    dbClient.collection('configuration', function(coll) {
        coll.findOne({}, function(err, res){
            if(err) {
                cb(err, res);
            } else {
                dbClient.findRDFNode('webids', res.webid, function(err,res){
                    cb(err, res);
                });
            }
        });
    });
};

// Utilities functions to work with JSON-LD objects
exports.jsonld = {

    // Adds a coercion annotation to a json-ld object
    coerce: function(obj, property, type) {
        if(obj['@context'] == null) {
            obj['@context'] = {};
        }
        if(obj['@context']['@coerce'] == null) {
            obj['@context']['@coerce'] = {};
            obj['@context']['@coerce'][type] = property;
        } else if(typeof(obj['@context']['@coerce'][type]) === 'string' &&
                  obj['@context']['@coerce'][type] != property) {
            var oldValue = obj['@context']['@coerce'][type];
            obj['@context']['@coerce'][type] = [oldValue, property];
        } else if(typeof(obj['@context']['@coerce'][type]) === 'object') {
            for(var i=0; i<obj['@context']['@coerce'][type].length; i++) {
                if(obj['@context']['@coerce'][type][i] === property)  {
                    return obj;
                }
            }

            obj['@context']['@coerce'][type].push(property);
        } else {
            obj['@context']['@coerce'][type] = property;
        }

        return obj;
    },

    addValue: function(node, property, value, coerce) {
        var shrinked = exports.vocabulary.store.rdf.prefixes.shrink(property);
        if(shrinked != property || (exports.vocabulary.store.rdf.prefixes.get(shrinked.split(":")[0]) != null)) {
            var prefix = shrinked.split(":")[0];
            node[shrinked] = value;
            var context = node['@context'] || {};
            context[prefix] = exports.vocabulary.store.rdf.prefixes.get(prefix);
            if(coerce != null) {
                var coercions = context['@coerce'] || {};
                if(coercions[coerce] == null) {
                    coercions[coerce] = shrinked;
                } else if(typeof(coercions[coerce]) === 'string') {
                    coercions[coerce] = [ coercions[coerce], shrinked ];
                } else {
                    coercions[coerce].push(shrinked);
                }
                context['@coerce'] = coercions;
            }

            node['@context'] = context;
        } else {
            node[property] = value;
            if(coerce != null) {
                this.coerce(node, property, coerce);	 
            }
        }
    },

    normalize: function(subjectUri, jsonldGraph, cb) {
        exports.makeDefaultEmptyStore(function(store) {
            store.load("application/json",jsonldGraph,function(success, results) {
                if(success) {
                    store.node(subjectUri, function(success, graph) {
                        cb(true, exports.graphToJSONLD(graph, store.rdf)[0]);
                    });
                } else {
                    cb(false, "error exporting graph");
                }
            });
        });
    },

    encode: function(jsonldGraph, exportMediaType, cb) {
        if(exportMediaType === 'application/json') {
            cb(false,JSON.stringify(utils.cleanMongoProperties(jsonldGraph)));
        } else {
            rdfstore.create(function(store){
                store.load("application/json",jsonldGraph,function(success, results) {
                    if(success) {
                        store.graph(function(success, graph){
                            var serializer = raptor.newSerializer(exportMediaType);
                            var output = '';
                            serializer.on('data', function(data) {
                                output += data;
                            });
                            serializer.on('end', function(){
                                if(exportMediaType==='application/rdf+xml') {
                                    output = output.replace(/nodeID="_:/g,"nodeID=\"_");
                                }
                                cb(false, output);
                            });
                            serializer.on('error', function(type, message, code) {
                                cb(true, {'type':type, 'message':message, 'code':code});
                            });

                            serializer.serializeStart();

                            var triples = graph.toArray();
                            for(var i=0; i<triples.length; i++) {
                                var triple = triples[i];

                                var subject = triple.subject;
                                var predicate = triple.predicate;
                                var object = triple.object;

                                var components = {'subject':subject, 
                                                  'predicate':predicate, 
                                                  'object':object};

                                for(var component in components) {
                                    var val = components[component];
                                    if(val.interfaceName === 'BlankNode') {
                                        components[component] = {value: val.nominalValue, type:'bnode'};
                                    } else if(val.interfaceName === 'Literal') {
                                        if(val.language != null) {
                                            components[component] = {value: val.nominalValue, lang:val.language, type:'literal'};
                                        } else if(val.datatype != null) {
                                            components[component] = {value: val.nominalValue, datatype:val.datatype, type:'typed-literal'};
                                        } else {
                                            components[component] = {value: val.nominalValue, type:'literal'};                                        
                                        }
                                    } else if(val.interfaceName === 'NamedNode') {
                                        components[component] = {value: val.nominalValue, type:'uri'};
                                    }
                                }
                                serializer.serializeStatement(components);
                            }

                            serializer.serializeEnd();
                        });
                    } else {
                        cb(true, results);
                    }
                });
            });
        }
    }

};


// Utility functions build JSON-LD objects
exports.vocabulary = {

    store: new rdfstore.Store(),

    addGraphIris: function(nodes, privacy, path) {
        var uriBase = null;
        if(privacy == 'public') {
            uriBase = "http://"+configuration.domain;
            if(configuration.public.port != null) {
                uriBase = uriBase+":"+configuration.public.port;
            }
            uriBase = uriBase + path + "/";
        } else {
            uriBase = "https://"+configuration.domain;
            if(configuration.admin.port != null) {
                uriBase = uriBase+":"+configuration.admin.port;
            }
            uriBase = uriBase + path + "/";
        }

        

        var node,type;
        for(var i=0; i<nodes.length; i++) {
            node = nodes[i];
            type = (nodes['@type']||"http://rdfs.org/sioc/types#MicroblogPost").split("#")[1];
            exports.jsonld.addValue(node,
                                   'sioc:embedsKnowledge',
                                   uriBase+type+"/"+node['_id'],
                                   '@iri');
            delete node['_id'];
        }
    },

    configuration: {
        makeWebIDConfigurationData: function(cb){
            dbClient.configuration(function(err,config) {
                if(err) {
                    cb(err,config);
                } else {
                    var node = {'@subject': 'srcfg:the_server',
                                'srcfg:managed_webid': config.webid,
                                'srcfg:is_local_webid': config.localWebid,
                                '@context': {
                                    'srcfg': 'http://social-rdf.org/vocab/configuration#'
                                }};
                
                    exports.jsonld.coerce(node, 'srcfg:is_local_webid', "http://www.w3.org/2001/XMLSchema#boolean");
                    exports.jsonld.coerce(node, 'srcfg:managed_webid', "@iri");
                    cb(false, node);
                }
            });
        },

        makeExtensionConfigurationData: function(name, label, help, type, mandatory, defaultValue) {
            var xsd = "http://www.w3.org/2001/XMLSchema#";
            var rdfs = "http://www.w3.org/2000/01/rdf-schema#";
            return {'@subject': name,
                    'srcfg:help': help,
                    'srcfg:type': xsd+type,
                    'rdfs:label': label,
                    'srcfg:mandatory': mandatory,
                    'srcfg:default_value': defaultValue,
                    '@type': 'http://social-rdf.org/vocab/configuration#ConfigurationData',
                    '@context': {
                        'srcfg': 'http://social-rdf.org/vocab/configuration#',
                        'rdfs': 'http://www.w3.org/2000/01/rdf-schema#'
                    }};
        },
      
        makeUserAccount: function(webID) {
            return {'@type': 'http://rdfs.org/sioc/ns#UserAccount',
                    'sioc:account_of': webID['@subject'],
                    '@context': {
                        'sioc': 'http://rdfs.org/sioc/ns#',
                        '@coerce': {'@iri':'sioc:account_of'}
                    }};
        },

        makeExportedResource: function(name, label, help, resource, isPublic) {
            return {'@subject': name,
                    'srcfg:help': help,
                    'rdfs:label': label,
                    'srcfg:isPublic': isPublic,
                    'srcfg:resourcePublished': resource,
                    '@type': 'http://social-rdf.org/vocab/configuration#URLBinding',
                    '@context': {
                        'srcfg': 'http://social-rdf.org/vocab/configuration#',
                        'rdfs': 'http://www.w3.org/2000/01/rdf-schema#'
                    }};
        },
        
        the_server: 'http://social-rdf.org/the_server',
        stores_object_types: 'http://social-rdf.org/vocab/configuration#stores_object_types',
        access_granted: 'http://social-rdf.org/vocab/configuration#access_granted',
        update_frequency: 'http://social-rdf.org/vocab/configuration#update_frequency',
        managed_by_extension: 'http://social-rdf.org/vocab/configuration#managed_by_extension',
        hasValue : 'http://social-rdf.org/vocab/configuration#hasValue',
        has_account : 'http://social-rdf.org/vocab/configuration#has_account',
        account_generated_by: 'http://social-rdf.org/vocab/configuration#account_generated_by',
        belongs_to_account: 'http://social-rdf.org/vocab/configuration#belongs_to_account'
    },

    sioc: {
        MicroBlogPost:  'http://rdfs.org/sioc/types#MicroblogPost',
        Post:  'http://rdfs.org/sioc/ns#Post',
        content: 'http://rdfs.org/sioc/ns#content',
        has_creator: 'http://rdfs.org/sioc/ns#has_creator',
        has_owner: 'http://rdfs.org/sioc/ns#has_owner',
        id: 'http://rdfs.org/sioc/ns#id',
        avatar: 'http://rdfs.org/sioc/ns#avatar',
        name: 'http://rdfs.org/sioc/ns#name'
    },

    foaf: {
        mbox: 'http://xmlns.com/foaf/0.1/mbox',
        depiction: 'http://xmlns.com/foaf/0.1/avatar',
        name: 'http://xmlns.com/foaf/0.1/name',
        nick: 'http://xmlns.com/foaf/0.1/nick',
        accountName: 'http://xmlns.com/foaf/0.1/accountName',
        based_near: 'http://xmlns.com/foaf/0.1/based_near',
        homepage: 'http://xmlns.com/foaf/0.1/homepage',
        accountServiceHomepage: 'http://xmlns.com/foaf/0.1/accountServiceHomepage'
    },

    dcterms: {
        creator: 'http://purl.org/dc/terms/creator',
        created: 'http://purl.org/dc/terms/created'
    },

    auth: {
        makeCertificate: function(modulus,exponent,webID) {
            var cert = {'cert:modulus': modulus,
                        'cert:exponent': exponent,
			'@type': 'http://www.w3.org/ns/auth/cert#RSAPublicKey',
                        '@context':{
                            'cert': 'http://www.w3.org/ns/auth/cert#'
                        }
                       };

            exports.jsonld.coerce(cert, 'cert:modulus', "http://www.w3.org/2001/XMLSchema#hexBinary");
            exports.jsonld.coerce(cert, 'cert:exponent', "http://www.w3.org/2001/XMLSchema#integer");

            return cert;
        },

        makeBasicProfile: function(webId) {
            return {'@subject': webId,
                    '@type': ['http://xmlns.com/foaf/0.1/PersonalProfileDocument',
                              'http://xmlns.com/foaf/0.1/Person'],
                    'foaf:maker': webId,
                    'foaf:primaryTopic': webId,
                    '@context': {
                        'foaf': 'http://xmlns.com/foaf/0.1/',
			'cert': 'http://www.w3.org/ns/auth/cert#',
                        '@coerce': {'@iri':[
                            'http://xmlns.com/foaf/0.1/maker',
                            'http://xmlns.com/foaf/0.1/primaryTopic'
                        ]}
                    }};
        },
    },

    webhooks: {
        makeWebHook: function(webID, binding, cbURL, name, query) {
            var node = {};
            exports.jsonld.addValue(node,
                                    'dcterms:creator',
                                    webID,
                                    '@iri');
            exports.jsonld.addValue(node,
                                    'dcterms:created',
                                    new Date());
            exports.jsonld.addValue(node,
                                    'srwh:binding',
                                    binding['@subject'],
                                    '@iri');
            exports.jsonld.addValue(node,
                                    'srwh:callback',
                                    cbURL,
                                    '@iri');
            exports.jsonld.addValue(node,
                                    'dcterms:title',
                                    name);
            exports.jsonld.addValue(node,
                                    'srwh:query',
                                    query);

            return node;

        }
    },

    extensions: {
        makeExtension: function(extension) {
            return {'@subject':extension.iri,
                    '@type': 'http://social-rdf.org/vocab/Extension',
                    'srext:version': extension.version,
                    'rdfs:label': extension.description,
                    'srext:identifier': extension.identifier,
                    'srext:serviceWrapped': extension.service,
                    'srext:dataPublished': extension.dataPublished,
                    'srext:configurationData': extension.configurationData(),
                    '@context': {
                        'srext': 'http://social-rdf.org/vocab/extensions#',
                        'rdfs': 'http://www.w3.org/2000/01/rdf-schema#',
                        '@coerce': {'@iri':'srext:dataPublished'}
                    }};
        },

        bound_to: 'http://social-rdf.org/vocab/extensions#bound_to'
    },

    resources: {
        Post:  'http://rdfs.org/sioc/types#Post',
        MicroBlogPost:  'http://rdfs.org/sioc/types#MicroblogPost'
    }
};

exports.vocabulary.prefixMap = function() {
    var prefixMap = [];
    for(var p in exports.vocabulary.store.rdf.prefixes) {
        if(p!='defaultNs'  && p!='interfaceProperties' && typeof(exports.vocabulary.store.rdf.prefixes[p])!=='function' ) {
            prefixMap.push({'ns':p, 'iri':exports.vocabulary.store.rdf.prefixes[p]});
        }
    }

    return prefixMap;
};

exports.makeDefaultEmptyStore = function(cb) {
    rdfstore.create(function(store){
        for(var p in exports.vocabulary.store.rdf.prefixes) {
            if(p!='defaultNs'  && p!='interfaceProperties' && typeof(exports.vocabulary.store.rdf.prefixes[p])!=='function' ) {
                store.registerDefaultNamespace(p,exports.vocabulary.store.rdf.prefixes[p]);
            }
        }
        cb(store);
    });
};


// Add aditional prefixes to the rdf map
exports.vocabulary.store.rdf.prefixes.set('srext','http://social-rdf.org/vocab/extensions#');
exports.vocabulary.store.rdf.prefixes.set('srcfg','http://social-rdf.org/vocab/configuration#');
exports.vocabulary.store.rdf.prefixes.set('srwh','http://social-rdf.org/vocab/webhooks#');

// Handling of extensions
exports.extensions = {
    /**
     * Map of extenson account PIDs
     */
    accountPids: {},

    /**
     * Registers a new child process
     */
    registerExtensionAccount: function(accountUri, child) {
        this.accountPids[accountUri] = child;
    },

    /**
     * Load available extensions from the file system
     */
    load: function(extensionsPath) {
        extensionsPath == extensionsPath || __dirname+"/extensions";
        
        var moduleFiles = fs.readdirSync(extensionsPath);
        var modules = [];
        for(var i=0; i<moduleFiles.length; i++) {
            var module = require(extensionsPath+"/"+moduleFiles[i]);
            modules.push(module.Extension);
        }

        return modules;
    },

    /**
     * Finds a extension in the array of available extension
     */
    findExtension: function(uri, extensions) {
        for(var i=0; i<extensions.length; i++) {
            if(extensions[i].iri === uri) {
                return extensions[i];
            } 
        }
        return null;
    },

    /**
     * Iterate through accounts
     */
    doAccounts: function(cb, cbfinal) {
        dbClient.accounts(function(err, accounts) {
            if(err) {
                cb(err, accounts);
            } else {
                Utils.repeat(0, accounts.length, function(k,env){
                    var floop = arguments.callee;
                    cb(function(){
                        k(floop,env);
                    },accounts[env._i]);
                },function(){
                    cbfinal();
                })
            }
        });
    }
};

exports.webhooks = {
    request: function(webID, graphIri, name, query, cb) {
        dbClient.collection('bindings', function(coll) {
            coll.findOne({'srcfg:hasValue': graphIri})
        });
    }
};

exports.bindings = {

    map: {'/stream': {'type':'*', 'binding':'*'}},
    
    createBindingsMap: function(bindings) {
        var binding, resource;
        for(var i=0; i<bindings.length; i++) {
            binding = bindings[i];
            resource = binding['srcfg:resourcePublished'].split("#")[1];
            if(exports.bindings.map['/stream/'+resource] == null) {
                exports.bindings.map['/stream/'+resource] = {'type': binding['srcfg:resourcePublished'], 'binding':[], 'isResource':true };            
            }
            exports.bindings.map['/stream'+binding['srcfg:hasValue']] = {'type':binding['srcfg:resourcePublished'], 'binding': [binding['@subject']], 'isResource':false};
            exports.bindings.map['/stream/'+resource]['binding'].push(binding['@subject']);
            //map['/stream']['binding'].push(binding['@subject']);
        }
    },

    update: function(cb) {
        dbClient.publicBindings(function(err, bindings) {
            if(!err) {
                exports.bindings.map = {'/stream': {'type':'*', 'binding':'*'}};
                exports.bindings.createBindingsMap(bindings);
                cb(false,exports.bindings.map);
            } else {
                cb(true, bindings);
            }
        });
    },

    graphURIs: function(exclude) {
        var acum = {resources:[], bindings:[]};
        for(var p in exports.bindings.map) {
            if(p!=exclude) {
                if(exports.bindings.map[p]['isResource']) {
                    acum['resources'].push({'graph':'/social'+p});
                } else {
                    acum['bindings'].push({'graph':'/social'+p});
                }
            }
        }
        return acum;
    }
};

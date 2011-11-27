var raptor = require('./raptor.js');
var url = require('url');
var http = require('http');
var rdfstore = require('./rdfstore.js');
var core = require("./core");
var exec = require('child_process').exec;
var configuration = require("./configuration");

exports.VerificationAgent = function(certificate){
    this.subjectAltName = certificate.subjectaltname;
    this.modulus = certificate.modulus;
    this.exponent = certificate.exponent;
    this.uris = this.subjectAltName.split(",")
    for(var i=0; i<this.uris.length; i++) {
        this.uris[i] = this.uris[i].split("URI:")[1];
    }
};

exports.VerificationAgent.prototype.verify = function(callback) {
    this._verify(this.uris,callback);
};

exports.VerificationAgent.prototype._verify = function(uris, callback) {
    if(uris.length === 0) {
        callback(true,"NotVerified");
    } else {
        var that = this;
        var parsedUrl = url.parse(uris[0]);
        var options = {host: parsedUrl.host,
                       path: parsedUrl.pathname,
                       port: parsedUrl.port,
                       method: 'GET',
                       headers: {"Accept": "application/rdf+xml,application/xhtml+xml,text/html"}};

        if(options.host.indexOf(":") != -1) {
            options.host = options.host.split(":")[0];
        }

        var req = http.request(options,function(response){
            if(response.statusCode==200) {
                var res = "";
                
                response.on('data', function(chunk){
                    res = res+chunk;
                });

                response.on('end', function(){
                    var contentType = (response.headers['content-type'] || response.headers['Content-Type'])
                    if(contentType) {
                        that._verifyWebId(uris[0], res, contentType, callback);
                    } else {
                        callback(true,"missingResponseContentType");
                    }
                });
            } else {
                callback(true, "badRemoteResponse");
            }
        });

        req.on('error', function(error) {
            uris.shift();
            that._verify(uris, callback);
        });

        req.end();
    }
};

exports.VerificationAgent.prototype._verifyWebId = function(webidUri, data, mediaTypeHeader, callback) {
    var that = this;
    var mediaType = null;
    if(mediaTypeHeader === "application/rdf+xml") {
        mediaType = 'rdfxml';
    } else {
        mediaType = 'rdfa';
    }

    var parser = raptor.newParser(mediaType);
    var statements = "";
    var nextStatement = "";


    parser.on('statement', function(statement) {
        nextStatement = "<"+statement.subject.value+"><"+statement.predicate.value+">";
        if(statement.object.type === "uri") {
            nextStatement = nextStatement + "<"+statement.object.value+">.";
        } else {
            if(statement.object.type === 'typed-literal') {
                nextStatement = nextStatement + "\""+statement.object.value+"\"^^<"+statement.object.datatype+">.";
            } else {
                nextStatement = nextStatement + "\""+statement.object.value+"\".";
            }
        }
        statements = statements+nextStatement;
    });

    parser.on('end', function(){
        rdfstore.create(function(store){
            store.load("text/turtle",statements,function(success, results) {
                store.execute("PREFIX cert: <http://www.w3.org/ns/auth/cert#>\
                               PREFIX rsa: <http://www.w3.org/ns/auth/rsa#>\
                               SELECT ?m ?e ?webid\
                               WHERE {\
                                 ?cert cert:identity ?webid ;\
                                 rsa:modulus ?m ;\
                                 rsa:public_exponent ?e .\
                               }", function(success, results) {
                                   if(success) {
                                       var modulus = null;
                                       var exponent = null;
                                       for(var i=0; i<results.length; i++) {
                                           if(results[i].webid && results[i].webid.value===webidUri) {
                                               modulus = results[i].m;
                                               exponent = results[i].e;
                                           }
                                       }
                                       if(modulus!=null && exponent!=null) {
                                           that._resolveModulusValue(store, modulus, function(modulus){
                                               that._resolveExponentValue(store, exponent, function(exponent) {
                                                   if(((""+that.modulus).toUpperCase()==(""+modulus).toUpperCase()) &&
                                                      ((""+that.exponent).toUpperCase() == (""+exponent).toUpperCase())) {
                                                       store.node(webidUri, function(success, graph) {
                                                           callback(false, core.graphToJSONLD(graph, store.rdf)[0]);
                                                       });
                                                   } else {
                                                       callback(true, "notMatchingCertificate");
                                                   }
                                               });
                                           });
                                       } else {
                                           callback(true, "certficateDataNotFound");
                                       }
                                   } else {
                                       callback(true, "certficateDataNotFound");
                                   }
                               });
            });
        });
    });

    //parser.parseStart(webidUri);
    parser.parseStart("http://test.com/something");
    parser.parseBuffer(new Buffer(data));
    parser.parseBuffer();
};

exports.VerificationAgent.prototype._resolveModulusValue = function(store, modulus, cb) {
    if(modulus.token === 'uri') {
        store.execute("SELECT ?v { <"+modulus.value+"><http://www.w3.org/ns/auth/cert#hex>?v }", function(success, results){
            if(results.length == 1) {
                cb(results[0].v.value);
            } else {
                store.execute("SELECT ?v { <"+modulus.value+"><http://www.w3.org/ns/auth/cert#decimal>?v }", function(success, results){
                    cb(parseInt(results[0].v.value).toString(16));
                })
            }
        });
    } else {
        if(modulus.type == "http://www.w3.org/ns/auth/cert#decimal") {
            cb(parseInt(modulus.value).toString(16));
        } else {
            cb(modulus.value);
        }
    }
};

exports.VerificationAgent.prototype._resolveExponentValue = function(store, exponent, cb) {
    if(exponent.token === 'uri') {
        store.execute("SELECT ?v { <"+exponent.value+"><http://www.w3.org/ns/auth/cert#hex>?v }", function(success, results){
            if(results.length == 1) {
                cb(results[0].v.value);
            } else {
                store.execute("SELECT ?v { <"+exponent.value+"><http://www.w3.org/ns/auth/cert#decimal>?v }", function(success, results){
                    cb(parseInt(results[0].v.value).toString(16));
                }); 
            }
        });
    } else {
        if(exponent.type == "http://www.w3.org/ns/auth/cert#decimal") {
            cb(parseInt(exponent.value).toString(16));
        } else {
            cb(exponent.value);
        }
    }
};


/**
 * Retrieves RDF data for WebID URI and returns it as a JSON object
 */
exports.getWebID = function(uri, cb) {
    var that = this;
    var parsedUrl = url.parse(uri);
    var options = {host: parsedUrl.host,
                   path: parsedUrl.pathname,
                   port: parsedUrl.port,
                   method: 'GET',
                   headers: {"Accept": "application/rdf+xml,application/xhtml+xml,text/html"}};

    if(options.host.indexOf(":") != -1) {
        options.host = options.host.split(":")[0];
    }

    var req = http.request(options,function(response){
        if(response.statusCode==200) {
            var res = "";
                
            response.on('data', function(chunk){
                res = res+chunk;
            });

            response.on('end', function(){
                var mediaTypeHeader = (response.headers['content-type'] || response.headers['Content-Type'])
                if(mediaTypeHeader) {
                    if(mediaTypeHeader === "application/rdf+xml") {
                        var mediaType = 'rdfxml';
                    } else {
                        var mediaType = 'rdfa';
                    }

                    var parser = raptor.newParser(mediaType);
                    var statements = "";
                    var nextStatement = "";

                    parser.on('statement', function(statement) {
                        nextStatement = "<"+statement.subject.value+"><"+statement.predicate.value+">";
                        if(statement.object.type === "uri") {
                            nextStatement = nextStatement + "<"+statement.object.value+">.";
                        } else {
                            nextStatement = nextStatement + "\""+statement.object.value+"\".";
                        }
                        statements = statements+nextStatement;
                    });

                    parser.on('end', function(){
                        rdfstore.create(function(store){
                            store.load("text/turtle",statements,function(success, results) {
                                store.node(uri, function(success, graph) {
                                    var jsonld = core.graphToJSONLD(graph, store.rdf);
                                    for(var i=0; i<jsonld.length; i++) {
                                        var node = jsonld[i];
                                        if(node['@subject'] === uri) {
                                            return cb(false, node);
                                        }
                                    }
                                    cb(true, "Invalid linked profile");
                                });
                            });
                        });
                    });

                    parser.parseStart(uri);
                    parser.parseBuffer(new Buffer(res));
                    parser.parseBuffer();
                } else {
                    callback(true,"missingResponseContentType");
                }
            });
        } else {
            callback(true, "badRemoteResponse");
        }
        
    });

    req.on('error', function(error) {
        cb(true, error);
    });

    req.end();

};

/**
 * Generates a new WebID certificate  for
 * the provided options and stores it in
 *  the provided path
 */
exports.generateCertificate = function(webid, password, path, callback) {
    var command = configuration.certificates.command;
    command += " " + webid + " " + path + " " + password;
    exec(command, function(stderr, stdout, _stdin) {
        if(stderr) {
            callback(true, stderr);
        } else {
            try {
                var data = JSON.parse(stdout);
                var cert = core.vocabulary.auth.makeCertificate(data.modulus,
                                                                data.exponent,
                                                                data.webid);

                callback(false, cert);
            } catch(e) {
                callback(true, e);
            }
        }
    });
};

/**
 * Returns the WebID this server manages
 */
exports.managedWebID = function() {

}

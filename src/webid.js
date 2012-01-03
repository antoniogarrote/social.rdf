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
    this.moduus = (''+this.modulus).replace(/^([0]{2})+/,"");
    this.exponent = ''+parseInt(certificate.exponent,16);
    this.uris = this.subjectAltName.split(",");
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
        var parsedUrl = url.parse(uris[0], true, true);
        var options = {host: parsedUrl.hostname,
                       path: parsedUrl.pathname,
		       port: parsedUrl.port,
                       method: 'GET',
                       headers: {"Accept": "application/rdf+xml,application/xhtml+xml,text/html"}};

        var req = http.request(options,function(response){
            if(response.statusCode==200) {
                var res = "";
                
                response.on('data', function(chunk){
                    res = res+chunk;
                });

                response.on('end', function(){
                    var contentType = (response.headers['content-type'] || response.headers['Content-Type']);
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
	    console.log("*** ERROR!!!");
	    console.log(error);
            uris.shift();
            that._verify(uris, callback);
        });

        req.end();
    }
};

exports.VerificationAgent.prototype._verifyWebId = function(webidUri, data, mediaTypeHeader, callback) {
    var that = this;

    this._parseAndLoad(mediaTypeHeader, webidUri, data, function(success, store){
	if(success) {
	    var query = that._buildVerificationQuery(webidUri, that.modulus, that.exponent);
	    store.execute(query, function(success, result) {
		if(success && result) {
		    callback(false, {'webid':webidUri, 'store':store});
		} else {
		    callback(true, "Profile data does not match certificate information");
		}
	    });
	} else {
	    callback(true, "Error parsing profile document");
	}
    });
};

exports.VerificationAgent.prototype._buildVerificationQuery = function(webid, modulus, exponent) {
    return "PREFIX : <http://www.w3.org/ns/auth/cert#>\
	    PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>\
	    ASK {\
               <"+webid+"> :key [\
                 :modulus \""+modulus+"\"^^xsd:hexBinary;\
                 :exponent "+exponent+";\
               ] .\
            }";
};

exports.VerificationAgent.prototype._parseAndLoad = function(mediaTypeHeader, webidUri, data, cb) {
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
        if(statement.subject.type === "uri") {
            nextStatement = "<"+statement.subject.value+"><"+statement.predicate.value+">";	    
	} else {
            nextStatement = "_:"+statement.subject.value+"<"+statement.predicate.value+">";
	}

        if(statement.object.type === "uri") {
            nextStatement = nextStatement + "<"+statement.object.value+">.";
        } else if(statement.object.type === "bnode"){
            nextStatement = nextStatement + "_:"+statement.object.value+".";
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
			   if(success) {
			       cb(true, store);
			   } else {
			       cb(false, null);
			   }
	    });
	});
    });    

    parser.parseStart(webidUri);
    parser.parseBuffer(new Buffer(data));
    parser.parseBuffer();
};

/**
 * Retrieves RDF data for WebID URI and returns it as a JSON object
 */
exports.getWebID = function(uri, cb) {
    var that = this;
    var parsedUrl = url.parse(uri);
    var options = {host: parsedUrl.hostname,
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
                var mediaTypeHeader = (response.headers['content-type'] || response.headers['Content-Type']);
                if(mediaTypeHeader) {
                    if(mediaTypeHeader.indexOf("application/rdf+xml")!=-1) {
                        var mediaType = 'rdfxml';
                    } else {
                        var mediaType = 'rdfa';
                    }

                    var parser = raptor.newParser(mediaType);
                    var statements = "";
                    var nextStatement = "";

                    parser.on('statement', function(statement) {
			if(statement.subject.type === 'uri') {
                            nextStatement = "<"+statement.subject.value+"><"+statement.predicate.value+">";
			} else if(statement.subject.type === 'bnode') {
                            nextStatement = "_:"+statement.subject.value+"<"+statement.predicate.value+">";
			}
                        if(statement.object.type === "uri") {
                            nextStatement = nextStatement + "<"+statement.object.value+">.";
                        } else if(statement.object.type === 'bnode') {
                            nextStatement = nextStatement + "_:"+statement.object.value+".";			    
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
                        core.makeDefaultEmptyStore(function(store){
                            store.load("text/turtle",statements,function(success, results) {
				store.graph(function(sccess, graph) {
				    var nodes = core.graphToJSONLD(graph, store.rdf);
				    var acum = {};
				    var topNode = null;
				    for(var i=0; i<nodes.length; i++) {
					acum[nodes[i]['@subject']] = nodes[i];
					if(nodes[i]['@subject'] === uri) {
					    topNode = nodes[i];
					}
				    }
				    if(topNode != null) {
					var topNodeUri = topNode['@subject'];
					var added = {topNodeUri: true};
					var pending = [topNode];
					while(pending.length != 0) {
					    var currentNode = pending.pop();
					    if(currentNode['@subject'].indexOf("_:") === 0) {
						delete currentNode['@subject'];
					    }

					    console.log("=======\nPROCESSING:"+currentNode['@subject']);
					    for(var p in currentNode) {
						if(currentNode[p].constructor === Array) {
						    var acumProps = [];
						    for(var j=0; j<currentNode[p].length; j++) {
							if(acum[currentNode[p][j]] != null && added[currentNode[p][j]] == null) {
							    console.log("ADDING(1): "+currentNode[p][j]['@subject']);
							    added[currentNode[p][j]] = true;
							    pending.push(acum[currentNode[p][j]]);
							    acumProps.push(acum[currentNode[p][j]]);
							} else {
							    acumProps.push(currentNode[p][j]);
							}
						    }
						    currentNode[p] = acumProps;
						} else {
						    
   						    if(p.indexOf('@')!=0 && acum[currentNode[p]] != null && added[currentNode[p]] == null) {
							console.log("ADDING(2): "+currentNode[p]+" for property "+p);
							added[currentNode[p]] = true;
							pending.push(acum[currentNode[p]]);
   							currentNode[p] = acum[currentNode[p]];
   						    } else {
							console.log("IGNORING");
							console.log(currentNode[p]);
							//console.log(acum[currentNode[p]]);
							//console.log(added[currentNode[p]['@subject']]);
							//console.log("---------\n\n");
						    }
						}
					    }
					}
					if(topNode['foaf:primaryTopic'] == null) {
					    core.jsonld.addValue(topNode, 'foaf:primaryTopic', topNode['@subject'], '@iri');
					}
					return cb(false, topNode);
				    } else {
					return cb(true, "Invalid linked profile");
				    }
				});

                                //store.node(uri, function(success, graph) {
                                //    var jsonld = core.graphToJSONLD(graph, store.rdf);
                                //    for(var i=0; i<jsonld.length; i++) {
                                //        var node = jsonld[i];
                                //        if(node['@subject'] === uri) {
				// 	    if(node['foaf:primaryTopic'] != null) {
				//		return store.node(node['foaf:primaryTopic'], function(success, graph) {						
				//		    var jsonld = core.graphToJSONLD(graph, store.rdf);
				//		    return cb(false, jsonld[0]);
				//		});
				//	    } else {
				//		return cb(false, node);
				//	    }
                                //        }
                                //    }
  			        //    return cb(true, "Invalid linked profile");
                                //});
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
                                                                ''+parseInt(''+data.exponent,16),
                                                                data.webid);

                callback(false, cert);
            } catch(e) {
                callback(true, e);
            }
        }
    });
};
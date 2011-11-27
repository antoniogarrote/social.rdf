var path = require('path');
var Mu = require('../../local_deps/mu/index.js');
var utils = require('../utils').utils;
var core = require("../core");
var configuration = require("../configuration");

// Load extensions
var extensions = core.extensions.load(process.cwd()+"/"+configuration.extensionsPath);

// load the templates root
Mu.templateRoot = __dirname+'./../templates';

exports.formatNode = function(node, mediaType) {
    if(mediaType == 'rdfa') {
        for(var p in node) {
            if(node[p] && node[p].constructor == Date) {
                node['dcterms_created_formatted'] = node[p].format("m/dd/yyyy - HH:MM");
            }
            if(p == 'sioc:content') {
                node[p] = node[p].replace("\n","<br/>");
            }
        };
        return node;
    } else {
        return node;
    }
};

/**
 * Renders the managed WebID as RDFa
 */
exports.renderWebIDRDFa = function(node, options, cb){
    options['ns'] = options['ns'] || core.vocabulary.prefixMap();
    options['feedTitle'] = 'Public WebID Profile';
    for(var p in options) {
        node[p] = options[p];
    }
    Mu.render('webid.js', node, options, function(err, output){
        if(err) {
            cb(err, "error rendering");
        }
        var data = "";
        output.addListener('data', function(c) {
            data+=c;
        });
        output.addListener('end', function(){
            cb(false, data);
        });
    });
};

/**
 * Renders a single node for the provided mediaType
 */
exports.renderNode = function(node, request, mediaType, cb){
    if(mediaType === 'json') {
        cb(false, node);
    } else {
        var types = node['@type']        
        var template = mediaType+"/Post.js";
        
        utils.repeat(0, types.length, function(k, env){
            var floop = arguments.callee;
            if(k.found != null) {
                k(floop,env);
            } else {
                var findTemplateByType = function() {
                    if(types[env._i] === "http://rdfs.org/sioc/ns#Post") {
                        k(floop,env);
                    } else {
                        var type = types[env._i].split("http://rdfs.org/sioc/ns#")[1];
                        if(type == null) {
                            var type = types[env._i].split("http://rdfs.org/sioc/types#")[1];
                        }
                        path.exists(__dirname+"/../templates/"+mediaType+"/"+type+".js.mu", function(exists){
                            if(exists) {
                                env.found = mediaType+"/"+type+".js";
                                k(floop,env);
                            } else {
                                k(floop,env);
                            }
                        });
                    }
                };
                var extension = core.extensions.findExtension(node['srcfg:managed_by_extension'], extensions);
                if(extension!= null) {
                    extension = new extension();
                    path.exists(__dirname+"/../templates/"+mediaType+"/"+extension.identifier+".js.mu", function(exists){
                        if(exists) {
                            env.found = mediaType+"/"+extension.identifier+".js";
                            k(floop,env);
                        } else {
                            findTemplateByType();
                        }
                    });
                } else {
                    findTemplateByType();
                }
            }
        }, function(env) {
            try {
                var extension = core.extensions.findExtension(node['srcfg:managed_by_extension'], extensions);
                var formattedNode = new extension().formatNode(node, mediaType);
                if(formattedNode == null) {
                    formattedNode = exports.formatNode(node,mediaType);
                } else {
                    formattedNode = exports.formatNode(formattedNode,mediaType);
                }
                Mu.render((env.found || template), formattedNode, {}, function(err, output){
                    if(err) {
                        cb(err, "error rendering");
                    }
                    var data = "";
                    output.addListener('data', function(c) {
                        data+=c;
                    });
                    output.addListener('end', function(){
                        cb(false, data);
                    });
                });
            } catch(e) {
                console.log("(!!) Error");
                console.log(e);
                cb(true, e);
            }
        }, {'found':null});

        for(var i=0; i<types.length; i++) {
        }
    }
};

/**
 * Renders a set of RDF nodes using the provided layout, media type and options
 */
exports.render = function(layoutName, mediaType, nodes, options, request, cb) {
    var rendered = [];
    var options = options || {};
    utils.repeat(0, nodes.length, function(k, env) {
        var floop = arguments.callee;
        exports.renderNode(nodes[env._i], request, mediaType, function(err, renderedNode) {
            if(!err) {
                if(mediaType === 'json') {
                    rendered.push(renderedNode);
                } else {
                    rendered.push({'node':renderedNode});
                }
                k(floop, env);
            } else {
                k(floop, env);
            }
        });
    }, function(env) {
        if(mediaType === 'json') {
            cb(false, JSON.stringify(rendered));
        } else {
            try {
                var layoutTemplate = 'layouts/'+mediaType+"/"+layoutName+".js";
                options['feedItems'] = rendered;
                options['ns'] = options['ns'] || core.vocabulary.prefixMap();
                Mu.render(layoutTemplate, options, {}, function(err, output){
                    if(err) {
                        cb(err, "error rendering");
                    }
                    var data = "";
                    output.addListener('data', function(c) {
                        data+=c;
                    });
                    output.addListener('end', function(){
                        cb(false, data);
                    });
                });
            } catch(e) {
                console.log("(!!) Error");
                console.log(e);
                cb(true,e);
            }
        }
    });
};

var https = require('https'); 
var http = require('http'); 
var fs = require('fs'); 
var webid = require('./webid');
var core = require('./core');
var adminWeb = require('./web/admin');
var publicWeb = require('./web/public');
var protectedWeb = require('./web/protected');
var utils = require("./utils").utils;
var cp = require('child_process');
var configuration = require("./configuration");


var httpsOptions = {
    key: fs.readFileSync('./ssl/privatekey.pem'),   
    cert: fs.readFileSync('./ssl/certificate.pem'),   
    requestCert: true, 
}; 

var httpOptions = {};

/*************/
/* Bootstrap */
/*************/

// Load extensions
var extensions = core.extensions.load(process.cwd()+"/"+configuration.extensionsPath);

// create servers
var adminAPI = new adminWeb.Services({extensions:extensions});
var publicAPI = new publicWeb.Services({extensions:extensions});
var protectedAPI = new protectedWeb.Services({extensions:extensions});

// load extension prefixes
for(var i=0; i<extensions.length; i++) {
    var prefixes = extensions[i].prefixes;
    for (var p in prefixes) {
        core.vocabulary.store.rdf.prefixes.set(p, extensions[i].prefixes[p]);
    }
}


/******************/
/* Start Accounts */
/******************/
console.log("starting extension accounts");

core.extensions.doAccounts(function(k,accountJson){
    var account = accountJson['@subject'];
    var extension = accountJson['srcfg:account_generated_by'];

   // console.log(" -- starting account <"+account+"> generated by <"+extension+">");
   // var child = cp.fork(__dirname + '/extension_launcher.js',
   //                     [extension, account, 'execute']);
   // console.log(" -- account forked");
   // core.extensions.registerExtensionAccount(account, child);

    //continue
    k();
},function() {
    console.log("finished loading extensions");
    // finished loading extensions, load bindings
    core.bindings.update(function(err, bindings) {
        if(err) {
            console.log("(!!) Error loading bindings: "+bindings);
        } else {
            // finished loading bindings, start servers
            startHttp();
            startHttps();
        }
    });
});


/*****************/
/* Start servers */
/*****************/

var startHttps = function() {
    console.log("trying to create server at "+configuration.admin.port);
    https.createServer(httpsOptions,function (req, res) { 
        try {
            res.withCORSHeader = utils.withCORSHeader

            var data = "";
            req.on('data', function(chunk){
                data = data + chunk;
            });
            req.on('end', function(){
                var certificate = req.connection.getPeerCertificate();
                if(certificate) {
                    var verifAgent = new webid.VerificationAgent(certificate);
                    verifAgent.verify(function(err, profileGraph){
                        if(err) {
                            res.writeHead(400,{"Content-Type":"text/plain"});
                            res.end();
                        } else {
                            core.managedWebID(function(err, managedWebID){
                                if(err) {
                                    res.writeHead(400,{"Content-Type":"text/plain"});
                                    res.end();
                                } else {
                                    if(req.url.indexOf(configuration.admin.baseUrl)==0 &&
                                       managedWebID['@subject'] == profileGraph['@subject']) {
                                        req.data = data;
                                        adminAPI.route(req, res, data, managedWebID);
                                    } else {
                                        req.data = data;
                                        req.profileWebId = profileGraph;
                                        protectedAPI.route(req, res, data, managedWebID);
                                    }
                                }
                            });
                        }
                    });
                } else {
                    res.withCORSHeader(400,{"Content-Type":"text/plain"});
                    res.end();
                }
            });
        } catch(e) {
            console.log("(!!) Error");
            console.log(e);
            res.writeHead(500,{"Content-Type":"text/plain"});
            res.end();
        }
    }).listen(configuration.admin.port);

    console.log("private server running at "+configuration.admin.port);
};


// HTTP server

var startHttp = function() {
    console.log("trying to create server at "+configuration.public.port);

    http.createServer(function (req, res) { 
        try {
            res.withCORSHeader = utils.withCORSHeader;

            var data = "";
            req.on('data', function(chunk){
                data = data + chunk;
            });
            req.on('end', function(){
                req.data = data;
                if(req.url.indexOf("\.atom") != -1) {
                    req.url = req.url.replace(".atom","");
                    req.headers['Accept'] = "application/atom+xml";
                }
                publicAPI.route(req, res, data);
            });
        } catch(e) {
            console.log("(!!) Error");
            console.log(e);
            res.withCORSHeader(500,{"Content-Type":"text/plain"});
            res.end();
        }
    }).listen(configuration.public.port);

    console.log("public server running at "+configuration.public.port);
};

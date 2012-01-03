//
// general options
//

// Server domain
exports.domain = "localhost";

// WebID (or redirection if WebID is in a remote server) URI path 
// take into account HTTP-RANGE14
exports.webIDPath = "/social#me";


// path to the extensions that will be loaded
exports.extensionsPath = "src/extensions";

//
// Secure administrative HTTPS endpoint
//
exports.admin = {
    port: 8081,
    baseUrl: '/admin',
    docroot: 'docroot/admin'
};

exports.public = {
    port: 8080,
    baseUrl: '/social',
    docroot: 'docroot/public'
};

exports.protected = {
    baseUrl: '/social',
    docroot: 'docroot/admin'
};

//
// MongoDB configuration
//
exports.db = { 
    server: 'mongodb',
    host: 'localhost',
    port: 27017,
    options: {},
    db: 'social_rdf'
};

//
// Decides which template will be used to
// render RDF nodes for each media type
//
exports.mediaTypeTemplates = {
    'text/html' : 'rdfa',
    'application/atom+xml': 'atom',
    'application/xhtml+xml' : 'rdfa',
    'application/json' : 'json',
    // default
    '*' : 'rdfa'
}

//
// Number of items per page in views
// 
exports.itemsPerPage = 30;

//
// Certificates
//
exports.certificates = {
    'command': 'java -cp ./certificate_tool/CertificatesGeneration.jar:./certificate_tool/bcpg-jdk16-146.jar:./certificate_tool/bcmail-jdk16-146.jar:./certificate_tool/bcprov-jdk16-146.jar:./certificate_tool/bcprov-ext-jdk16-146.jar:./certificate_tool/bctsp-jdk16-146.jar rdf.social.webid.SelfSignedCertficateGenerator'
}

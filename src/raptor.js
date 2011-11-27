var events = require('events');
var raptorTarget = require(__dirname + '/raptor.node');


function inherits(target, source) {
    for (var k in source.prototype)
        target[k] = source.prototype[k];
};


exports.newParser = function(mimeType, cb) {
    if(cb==null) {
        var parser = raptorTarget.newParser(mimeType);
        inherits(parser, events.EventEmitter);
        return parser;
    } else {
        var res = raptorTarget.newParser(mimeType, function(parser) {
            inherits(parser, events.EventEmitter)
            cb(parser);
        });
    }
};


exports.newSerializer = function(mimeType) {
    mimeType = this.mediaType(mimeType);
    var serializer = null;

    if(mimeType == null) {
        serializer = raptorTarget.newSerializer();
    } else {
        serializer = raptorTarget.newSerializer(mimeType);
    }

    inherits(serializer, events.EventEmitter)

    return serializer
};

exports.mediaType = function(typeExpr) {
    if(typeExpr === 'application/rdf+xml' || typeExpr === 'text/html') {
        return 'rdfxml';
    } else if(typeExpr === 'text/turtle' || typeExpr === 'application/turtle' ||
              typeExpr === 'text/n3' || typeExpr === 'application/n3' || typeExpr === 'text/plain') {
        return 'turtle';
    }
};

const MAX_STATEMENTS = Number.MAX_VALUE;

var util    = require('util');
var raptor = require('./../raptor');

var time;

var parser = raptor.newParser('rdfxml');

// start parsing when all other callbacks are in place
process.nextTick(function () {
    if (process.argv.length > 2) {
        time = Date.now();
        parser.parseFile(process.argv[2]);
    }
});

var subjectsMap = {};
var subjectCount = 0;
var tripleCount = 0;
parser.on('statement', function (statement) {
    // if (statement.subject.type == 'bnode') {
    //     util.puts(statement);
    // }
    
    if (++tripleCount >= MAX_STATEMENTS) {
        parser.abort();
    }
});

parser.on('message', function (type, message, code) {
    if (type == 'error' || type == 'warning') {
        util.log(type.toUpperCase() + ': ' + message + ' (' + code + ')');
    }
});

var namespaces = {};
parser.on('namespace', function (prefix, uri) {
    if (!(prefix in namespaces)) {
        namespaces[prefix] = uri;
    }
});

parser.on('end', function () {
    util.puts(tripleCount + ' statements parsed.');
    util.puts('Parsing took ' + (Date.now() - time) + ' ms.');
    
    // if (subjectsMap && subjectCount) {
    //     util.puts(subjectCount + ' distinct predicates found.');
    // }
    
    util.puts('Namespaces: ' + util.inspect(namespaces));
});

/*
parser.on('description', function (description) {
    util.puts('New description: ' + util.inspect(description));
});
*/

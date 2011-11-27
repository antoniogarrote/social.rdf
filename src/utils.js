var path = require('path');
var fs = require('fs');
var url = require('url');

Utils = {};

/**
 * Module dependencies.
 */

var parse = require('url').parse;
var mime = require('mime');
var zlib = require('zlib');

/**
 * Strip `Content-*` headers from `res`.
 *
 * @param {ServerResponse} res
 * @api public
 */

var removeContentHeaders = function(res){
	Object.keys(res._headers).forEach(function(field){
		if (0 === field.indexOf('content')) {
			res.removeHeader(field);
		}
	});
};

/**
 * gzipped cache.
 */

var gzippoCache = {};

/**
 * gzip file.
 */

var gzippo = function(filename, charset, callback) {

	fs.readFile(filename, function (err, data) {
		if (err) throw err;
			zlib.gzip(data, function(err, result) {
				callback(result);
			});
	});


};

/**
 * By default gzip's static's that match the given regular expression /text|javascript|json/
 * and then serves them with Connects static provider, denoted by the given `dirPath`.
 *
 * Options:
 *
 *	-	`maxAge`  cache-control max-age directive, defaulting to 1 day
 *	-	`clientMaxAge`  client cache-control max-age directive, defaulting to 1 week
 *	-	`contentTypeMatch` - A regular expression tested against the Content-Type header to determine whether the response
 *		should be gzipped or not. The default value is `/text|javascript|json/`.
 *	-	`prefix` - A url prefix. If you want all your static content in a root path such as /resource/. Any url paths not matching will be ignored
 *
 * Examples:
 *
 *     connect.createServer(
 *       connect.staticGzip(__dirname + '/public/');
 *     );
 *
 *     connect.createServer(
 *       connect.staticGzip(__dirname + '/public/', {maxAge: 86400000});
 *     );
 *
 * @param {String} path
 * @param {Object} options
 * @return {Function}
 * @api public
 */

Utils.serveFile = function staticGzip(dirPath, options){
	options = options || {};
	var
		maxAge = options.maxAge || 86400000,
		contentTypeMatch = options.contentTypeMatch || /text|javascript|css/,
		clientMaxAge = options.clientMaxAge || 604800000,
		prefix = options.prefix || '';

	if (!dirPath) throw new Error('You need to provide the directory to your static content.');
	if (!contentTypeMatch.test) throw new Error('contentTypeMatch: must be a regular expression.');

  return function staticGzip(req, res){
		var url, filename, contentType, acceptEncoding, charset;

		function pass(name) {
                    Utils.serveFileRaw(dirPath, req, res);
		}

		function setHeaders(cacheObj) {
			res.setHeader('Content-Type', contentType);
			res.setHeader('Content-Encoding', 'gzip');
			res.setHeader('Vary', 'Accept-Encoding');
			res.setHeader('Content-Length', cacheObj.content.length);
			res.setHeader('Last-Modified', cacheObj.mtime.toUTCString());
			res.setHeader('Date', new Date().toUTCString());
			res.setHeader('Expires', new Date(Date.now() + clientMaxAge).toUTCString());
			res.setHeader('Cache-Control', 'public, max-age=' + (clientMaxAge / 1000));
			res.setHeader('ETag', '"' + cacheObj.content.length + '-' + Number(cacheObj.mtime) + '"');
		}

		function sendGzipped(cacheObj) {
			setHeaders(cacheObj);
			res.end(cacheObj.content, 'binary');
		}

		function gzipAndSend(filename, gzipName, mtime) {
			gzippo(filename, charset, function(gzippedData) {
				gzippoCache[gzipName] = {
					'ctime': Date.now(),
					'mtime': mtime,
					'content': gzippedData
				};
				sendGzipped(gzippoCache[gzipName]);
			});
		}

		if (req.method !== 'GET' && req.method !== 'HEAD') {
		    //return next();
                    res.writeHead(500);
                    res.end();
		}

		url = parse(req.url);

		// Allow a url path prefix
		if (url.pathname.substring(0, prefix.length) !== prefix) {
                    //res.writeHead(500);
                    res.end();
		}

		filename = path.join(dirPath, url.pathname.substring(prefix.length));

		contentType = mime.lookup(filename);
		charset = mime.charsets.lookup(contentType, 'UTF-8');
		contentType = contentType + (charset ? '; charset=' + charset : '');
		acceptEncoding = req.headers['accept-encoding'] || '';

		if (!contentTypeMatch.test(contentType)) {
			return pass(filename);
		}

		if (!~acceptEncoding.indexOf('gzip')) {
			return pass(filename);
		}

		//This is storing in memory for the moment, need to think what the best way to do this.
		//Check file is not a directory

		fs.stat(filename, function(err, stat) {
			if (err || stat.isDirectory()) {
				return pass(filename);
			}

			var base = path.basename(filename),
					dir = path.dirname(filename),
					gzipName = path.join(dir, base + '.gz');

			if (req.headers['if-modified-since'] &&
				gzippoCache[gzipName] &&
				+stat.mtime <= new Date(req.headers['if-modified-since']).getTime()) {
				setHeaders(gzippoCache[gzipName]);
				removeContentHeaders(res);
				res.statusCode = 304;
				return res.end();
			}

			//TODO: check for pre-compressed file
			if (typeof gzippoCache[gzipName] === 'undefined') {
				gzipAndSend(filename, gzipName, stat.mtime);
			} else {
				if ((gzippoCache[gzipName].mtime < stat.mtime) ||
				((gzippoCache[gzipName].ctime + maxAge) < Date.now())) {
					gzipAndSend(filename, gzipName, stat.mtime);
				} else {
					sendGzipped(gzippoCache[gzipName]);
				}
			}
		});
	};
};


Utils.repeat = function(c,max,floop,fend,env) {
    if(arguments.length===4) { env = {}; }
    if(c<max) {
        env._i = c;
        floop(function(floop,env){
            Utils.repeat(c+1, max, floop, fend, env);
        },env);
    } else {
        fend(env);
    }
};

Utils._iterate = function(c,max,results, ferr, fs, env) {
    if(c<max) {
        var floop = fs[c];
        var isInverted = false;
        if(typeof(floop)!=='function') {
            isInverted = floop[0];
            floop = floop[1];
        }
        try {
            floop(results, env, function(err, res){
                if((isInverted && err) || (!isInverted && !err)) {
                    Utils._iterate(c+1, max, res, ferr, fs, env);
                } else {
                    ferr(res,env);
                }
            });
        } catch(e) {
            ferr(e,env);
        }
    }
};

Utils.seq = function() {
    var functions = [];
    for(var i=0; i<arguments.length; i++) {
        functions.push(arguments[i]);
    }
    var maybeEnv = functions.pop();
    var env = {}
    var errorFunction = null;
    if(typeof(maybeEnv) == 'function') {
        errorFunction = maybeEnv;
    } else {
        env = maybeEnv;
        errorFunction = functions.pop();
    }

    Utils._iterate(0, functions.length, null, errorFunction, functions, env);
};


// Web Utils

Utils.serveFileRaw = function(docroot, request, response, contentType) {
    var filePath = process.cwd()+'/'+docroot+request.url;
    if(filePath[filePath.length-1] === '/')
        filePath = filePath+"index.html";

    if(contentType == null) {
        var extname = path.extname(filePath);
        if(extname === '.js') {
            contentType = 'text/javascript';
        } else if(extname === '.css'){
            contentType = 'text/css'
        } else if(extname === '.html' || extname === '.htm') {
            contentType = 'text/html'
        }
    }

    path.exists(filePath, function(exists){        
        if(!exists) {
            response.writeHead(404);
            response.end();
        } else {
            fs.readFile(filePath, function(error, content){
                if(error) {
                    response.writeHead(500);
                    response.end();

                } else {
                    if(contentType != null) 
                        response.writeHead(200,{'Content-Type': contentType});
                    response.end(content, 'utf-8')
                }
            });
        }
    });
};

Utils.cleanMongoProperties = function(data) {
    if(data.length == null) {
        delete data['_id'];
        return data;
    } else {
        for(var i=0; i<data.length; i++) {
            delete data[i]['_id'];
        }
        return data;
    }
}

Utils.withCORSHeader = function(status, headers) {
    headers["Access-Control-Allow-Origin"] = "*";
    headers["Access-Control-Allow-Methods"] = "POST, GET, PUT, DELETE, OPTIONS";
    headers["Access-Control-Allow-Headers"] = "Content-Type, Depth, User-Agent, X-File-Size, X-Requested-With, If-Modified-Since, X-File-Name, Cache-Control";
    this.writeHead(status, headers);
};

Utils.params = function(path) {
    return url.parse(path,true)['query'];
};

Utils.capitalize = function (string){
    return string.charAt(0).toUpperCase() + string.slice(1);
};

Utils.dateFormat = function () {
	var	token = /d{1,4}|m{1,4}|yy(?:yy)?|([HhMsTt])\1?|[LloSZ]|"[^"]*"|'[^']*'/g,
		timezone = /\b(?:[PMCEA][SDP]T|(?:Pacific|Mountain|Central|Eastern|Atlantic) (?:Standard|Daylight|Prevailing) Time|(?:GMT|UTC)(?:[-+]\d{4})?)\b/g,
		timezoneClip = /[^-+\dA-Z]/g,
		pad = function (val, len) {
			val = String(val);
			len = len || 2;
			while (val.length < len) val = "0" + val;
			return val;
		};

	// Regexes and supporting functions are cached through closure
	return function (date, mask, utc) {
		var dF = Utils.dateFormat;

		// You can't provide utc if you skip other args (use the "UTC:" mask prefix)
		if (arguments.length == 1 && Object.prototype.toString.call(date) == "[object String]" && !/\d/.test(date)) {
			mask = date;
			date = undefined;
		}

		// Passing date through Date applies Date.parse, if necessary
		date = date ? new Date(date) : new Date;
		if (isNaN(date)) throw SyntaxError("invalid date");

		mask = String(dF.masks[mask] || mask || dF.masks["default"]);

		// Allow setting the utc argument via the mask
		if (mask.slice(0, 4) == "UTC:") {
			mask = mask.slice(4);
			utc = true;
		}

		var	_ = utc ? "getUTC" : "get",
			d = date[_ + "Date"](),
			D = date[_ + "Day"](),
			m = date[_ + "Month"](),
			y = date[_ + "FullYear"](),
			H = date[_ + "Hours"](),
			M = date[_ + "Minutes"](),
			s = date[_ + "Seconds"](),
			L = date[_ + "Milliseconds"](),
			o = utc ? 0 : date.getTimezoneOffset(),
			flags = {
				d:    d,
				dd:   pad(d),
				ddd:  dF.i18n.dayNames[D],
				dddd: dF.i18n.dayNames[D + 7],
				m:    m + 1,
				mm:   pad(m + 1),
				mmm:  dF.i18n.monthNames[m],
				mmmm: dF.i18n.monthNames[m + 12],
				yy:   String(y).slice(2),
				yyyy: y,
				h:    H % 12 || 12,
				hh:   pad(H % 12 || 12),
				H:    H,
				HH:   pad(H),
				M:    M,
				MM:   pad(M),
				s:    s,
				ss:   pad(s),
				l:    pad(L, 3),
				L:    pad(L > 99 ? Math.round(L / 10) : L),
				t:    H < 12 ? "a"  : "p",
				tt:   H < 12 ? "am" : "pm",
				T:    H < 12 ? "A"  : "P",
				TT:   H < 12 ? "AM" : "PM",
				Z:    utc ? "UTC" : (String(date).match(timezone) || [""]).pop().replace(timezoneClip, ""),
				o:    (o > 0 ? "-" : "+") + pad(Math.floor(Math.abs(o) / 60) * 100 + Math.abs(o) % 60, 4),
				S:    ["th", "st", "nd", "rd"][d % 10 > 3 ? 0 : (d % 100 - d % 10 != 10) * d % 10]
			};

		return mask.replace(token, function ($0) {
			return $0 in flags ? flags[$0] : $0.slice(1, $0.length - 1);
		});
	};
}();

// Some common format strings
Utils.dateFormat.masks = {
	"default":      "ddd mmm dd yyyy HH:MM:ss",
	shortDate:      "m/d/yy",
	mediumDate:     "mmm d, yyyy",
	longDate:       "mmmm d, yyyy",
	fullDate:       "dddd, mmmm d, yyyy",
	shortTime:      "h:MM TT",
	mediumTime:     "h:MM:ss TT",
	longTime:       "h:MM:ss TT Z",
	isoDate:        "yyyy-mm-dd",
	isoTime:        "HH:MM:ss",
	isoDateTime:    "yyyy-mm-dd'T'HH:MM:ss",
	isoUtcDateTime: "UTC:yyyy-mm-dd'T'HH:MM:ss'Z'"
};

// Internationalization strings
Utils.dateFormat.i18n = {
	dayNames: [
		"Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat",
		"Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"
	],
	monthNames: [
		"Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
		"January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"
	]
};

// For convenience...
Date.prototype.format = function (mask, utc) {
	return Utils.dateFormat(this, mask, utc);
};


/*
var f1 = function(cb) {
    cb(false, 1);
};

var f2inv = function(cb) {
    cb(true, 2);
};

var f3 = function(cb) {
    cb(false, 3);
};

Utils.seq(function(res, env, k){
    console.log('1');
    f1(k);
},
[true, function(res, env, k){
    console.log('2');
    env['a'] = res;
    f2inv(k);
}],
function(res, env, k) {
    console.log('3');
    env['b'] = res;
    f3(k);
},
function(res, env, k) {
    console.log("SUM: "+(env['a']+env['b']+res));
}, 
function(err) {
    console.log("ERROR");
});
*/

exports.utils = Utils;

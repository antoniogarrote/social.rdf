var sys = require('util');
var OAuth = require('oauth').OAuth;
var core = require('../core');
var utils = require('../utils').utils;

var Extension = function(){
    this.identifier = 'twitter';
};

/**
 * Name identifying this extension
 */
Extension.identifier = "twitter";

/**
 * IRI identifying the extension
 */
Extension.iri = "http://social-rdf.org/vocab/extensions/twitter#extension";

/**
 * Version of this extension
 */
Extension.version = "0.0.1";

/**
 * Description of this extension functionality
 */
Extension.description = "Exports status updates and the list of followers/following users to the social.rdf server";

/**
 * Prefix for extension URIs
 */
Extension.prefixes = {'srtwt': 'http://social-rdf.org/vocab/extensions/twitter/'};

/**
 * Service this extension wraps
 */
Extension.service = "http://twitter.com";

/**
 * List of data objects that will be published by this extension
 */
Extension.dataPublished = [
    core.vocabulary.configuration.makeExportedResource('http://social-rdf.org/vocab/extensions/twitter/public_updates', 
                                                       'Public Updates', 
                                                       'The public updates published in the configured Twitter account', 
                                                       core.vocabulary.resources.MicroBlogPost, 
                                                       true),

    core.vocabulary.configuration.makeExportedResource('http://social-rdf.org/vocab/extensions/twitter/private_updates', 
                                                       'Followed users updates', 
                                                       'The public updates from all the Twitter users this account Twitter account is following', 
                                                       core.vocabulary.resources.MicroBlogPost, 
                                                       false)        
];

/**
 * Returns an array of JSON-LD objects containing the pieces of configuration data required by this application
 * to run.
 */
Extension.configurationData = function(){
    return [
        core.vocabulary.configuration.makeExtensionConfigurationData("http://social-rdf.org/vocab/extensions/twitter/oauth_consumer_key", 
                                                                     "OAuth consumer key", 
                                                                     "An application consumer key registered in Twitter.", 
                                                                     "string", 
                                                                     true, 
                                                                     ''),
        core.vocabulary.configuration.makeExtensionConfigurationData("http://social-rdf.org/vocab/extensions/twitter/oauth_consumer_secret", 
                                                                     "OAuth consumer secret", 
                                                                     "An application consumer secret registered in Twitter.", 
                                                                     "string", 
                                                                     true, 
                                                                     ''),
        core.vocabulary.configuration.makeExtensionConfigurationData("http://social-rdf.org/vocab/extensions/twitter/oauth_access_token_key", 
                                                                     "OAuth access token key", 
                                                                     "An access token key generated for this application and user account", 
                                                                     "string", 
                                                                     true, 
                                                                     ''),        
        core.vocabulary.configuration.makeExtensionConfigurationData("http://social-rdf.org/vocab/extensions/twitter/oauth_access_token_secret", 
                                                                     "OAuth access token secret", 
                                                                     "An access token generated for this application and useraccount", 
                                                                     "string", 
                                                                     true, 
                                                                     ''),        
        core.vocabulary.configuration.makeExtensionConfigurationData("http://social-rdf.org/vocab/extensions/twitter/update_frequency", 
                                                                     "Frequency of update checks (minutes)", 
                                                                     "New data from Twitter will be retrived with this frequency", 
                                                                     "int", 
                                                                     false, 
                                                                     15)
    ]
};


/**
 * Returns an account object generated by this extension when associated to an identity with some configuration data.
 * Returns null if the extension doest not require account creation.
 */
Extension.prototype.installForWebID = function(configuration, webID, callback){
    try {
        var oauthConsumerKey = configuration["http://social-rdf.org/vocab/extensions/twitter/oauth_consumer_key"];
        var oauthConsumerSecret = configuration["http://social-rdf.org/vocab/extensions/twitter/oauth_consumer_secret"];
        var oauthAccessTokenKey = configuration["http://social-rdf.org/vocab/extensions/twitter/oauth_access_token_key"];
        var oauthAccessTokenSecret = configuration["http://social-rdf.org/vocab/extensions/twitter/oauth_access_token_secret"];
        var updateFrequency = configuration["http://social-rdf.org/vocab/extensions/twitter/update_frequency"];

        var oa= new OAuth("",
                          "",
                          oauthConsumerKey,
                          oauthConsumerSecret,
                          "1.0",
                          null,
                          "HMAC-SHA1");

        oa.getProtectedResource("http://api.twitter.com/1/account/verify_credentials.json", "GET", 
                                oauthAccessTokenKey,
                                oauthAccessTokenSecret,
                                function (error, data, response) {
                                    data = JSON.parse(data);
                                    var screenName = data['screen_name'];
                                    var userId = data['id'];
                                    var profileImage = data['profile_image_url'];
                                    
                                    var userAccount = core.vocabulary.configuration.makeUserAccount(webID);
                                    userAccount['srtwt:oauth_consumer_key'] = oauthConsumerKey;
                                    userAccount['srtwt:oauth_consumer_secret'] = oauthConsumerSecret;
                                    userAccount['srtwt:oauth_access_token_key'] = oauthAccessTokenKey;
                                    userAccount['srtwt:oauth_access_token_secret'] = oauthAccessTokenSecret;
                                    core.jsonld.addValue(userAccount, core.vocabulary.sioc.name, screenName);
                                    core.jsonld.addValue(userAccount, core.vocabulary.sioc.id, userId);
                                    core.jsonld.addValue(userAccount, core.vocabulary.sioc.avatar, profileImage);
                                    userAccount['srtwt:update_frequency'] = parseInt(updateFrequency);

                                    core.jsonld.coerce(userAccount, 'srtwt:profile_image_url', '@iri');
                                    userAccount['@context']['srtwt'] = 'http://social-rdf.org/vocab/extensions/twitter/';
                                    userAccount['@context']['srcfg'] = 'http://social-rdf.org/vocab/configuration#';                                    

                                    callback(true, userAccount);
                                });

    } catch(e) {
        cb(false, e);
    }
};

/**
 * Main loop of the extension
 */
Extension.prototype.execute = function(account, bindings, dbClient){
    try {
        console.log("[twitter] ** executing extension...");

        var that = this;

        this.webid = account['sioc:has_owner'];
        this.account = account;
        this.bindings = bindings;
        
        var publicBinding = null;
        var privateBinding = null;

        for(var i=0; i<bindings.length; i++) {
            if(bindings[i]['srcfg:isPublic'] === "true") {
                publicBinding = bindings[i];
            } else {
                privateBinding = bindings[i];
            }
        }

        var oauthConsumerKey = account["srtwt:oauth_consumer_key"];
        var oauthConsumerSecret = account["srtwt:oauth_consumer_secret"];
        var oauthAccessTokenKey = account["srtwt:oauth_access_token_key"];
        var oauthAccessTokenSecret = account["srtwt:oauth_access_token_secret"];
        var updateFrequency = parseInt(account["srtwt:update_frequency"]);


        var lastId = null;

        var updateFunction = function(){
            try {
                console.log("[twitter] ** updating twitter status");
                var oa= new OAuth("",
                                  "",
                                  oauthConsumerKey,
                                  oauthConsumerSecret,
                                  "1.0",
                                  null,
                                  "HMAC-SHA1");
                 
                var uri = "http://api.twitter.com/1/statuses/user_timeline.json";
                if(lastId!=null) {
                    uri = uri+"?since_id="+lastId;
                }
                 
                oa.getProtectedResource(uri, "GET", oauthAccessTokenKey, oauthAccessTokenSecret, 
                                        function (error, data, response) {
                                            data = JSON.parse(data);
                                            utils.repeat(0, data.length, function(k, env) {
                                                var floop = arguments.callee;
                                                var i = env._i;
                                                lastId = data.id_Str;
                                                var microblogpost = that.makeMicroBlogPost(data[i]);
                                                if(microblogpost["dcterms:creator"] === that.webid) {
                                                    core.jsonld.addValue(microblogpost, core.vocabulary.extensions.bound_to, [privateBinding['@subject'], publicBinding['@subject']], '@iri');
                                                } else {
                                                    core.jsonld.addValue(microblogpost, core.vocabulary.extensions.bound_to, [privateBinding['@subject']], '@iri');
                                                }

                                                dbClient.collection('stream', function(coll) {
                                                    //console.log("*** inserted tweet :"+lastId);
                                                    //console.log(microblogpost);
                                                    coll.insert(microblogpost, function(err, res){
                                                        k(floop, env);
                                                    });
                                                });

                                            },
                                            function(){
                                                console.log("[twitter] ** end of update");
                                            });
                                        });
            } catch(e) {
                //console.log("(!!!) Exception updating tweet stream");
                //console.log(e);
            }
        };

        // setting up the timer
        setInterval(updateFunction, (updateFrequency*60*1000));
        updateFunction();

    } catch(e) {
        //console.log("(!!!) exception executing twitter extension");
        //console.log(e);
    }

};

Extension.prototype.import = function(account, bindings, dbClient){
    try {
        console.log("[twitter] ** importing data...");

        var that = this;

        this.webid = account['sioc:has_owner'];
        this.account = account;
        this.bindings = bindings;
        
        var publicBinding = null;
        var privateBinding = null;

        for(var i=0; i<bindings.length; i++) {
            if(bindings[i]['srcfg:isPublic'] === "true") {
                publicBinding = bindings[i];
            } else {
                privateBinding = bindings[i];
            }
        }

        var oauthConsumerKey = account["srtwt:oauth_consumer_key"];
        var oauthConsumerSecret = account["srtwt:oauth_consumer_secret"];
        var oauthAccessTokenKey = account["srtwt:oauth_access_token_key"];
        var oauthAccessTokenSecret = account["srtwt:oauth_access_token_secret"];
        var updateFrequency = parseInt(account["srtwt:update_frequency"]);


        var lastId = null;

        var page = 1;
        var updateFunction = function(){
            try {

                var currentPage = page;
                page++;

                console.log("[twitter] ** importing user timeline page -> "+currentPage);

                var oa= new OAuth("",
                                  "",
                                  oauthConsumerKey,
                                  oauthConsumerSecret,
                                  "1.0",
                                  null,
                                  "HMAC-SHA1");
                 
                var uri = "http://api.twitter.com/1/statuses/user_timeline.json?include_rts=true&count=200&page="+currentPage;
                oa.getProtectedResource(uri, "GET", oauthAccessTokenKey, oauthAccessTokenSecret, 
                                        function (error, data, response) {
                                            data = JSON.parse(data);
                                            utils.repeat(0, data.length, function(k, env) {
                                                var floop = arguments.callee;
                                                var i = env._i;
                                                lastId = data.id_Str;
                                                var microblogpost = that.makeMicroBlogPost(data[i]);
                                                core.jsonld.addValue(microblogpost, core.vocabulary.extensions.bound_to, [publicBinding['@subject']], '@iri');

                                                dbClient.collection('stream', function(coll) {
                                                    //console.log("*** inserted tweet :"+lastId);
                                                    //console.log(microblogpost);
                                                    coll.insert(microblogpost, function(err, res){
                                                        k(floop, env);
                                                    });
                                                });

                                            },
                                            function(){
                                                console.log("[twitter] ** end of update");
                                            });
                                        });
            } catch(e) {
                console.log("(!!!) Exception importing tweet stream");
                console.log(e);
                process.exit(1);
            }
        };

        // setting up the timer
        setInterval(updateFunction, (30*1000));
        updateFunction();

    } catch(e) {
        console.log("(!!!) exception executing twitter import");
        console.log(e);
        process.exit(1);
    }

};


Extension.prototype.makeMicroBlogPost = function(tweet) {
    var post = {'@type':[core.vocabulary.sioc.MicroBlogPost,
                         core.vocabulary.sioc.Post],
                '@context': {'xsd':'http://www.w3.org/2001/XMLSchema#'}};

    var account = {'@type':'http://rdfs.org/sioc/ns#UserAccount',
                   'sioc:avatar':tweet.user.profile_image_url,
                   'sioc:name': tweet.user.screen_name,
                   'sioc:accountOf': this.webid,
                   '@context': {'sioc':'http://rdfs.org/sioc/ns#', '@coerce':{'@iri':'sioc:avatar'}}};

    post['sioc:has_creator'] = account;

    if(tweet.user.screen_name === this.account['sioc:name']) {
        core.jsonld.addValue(post, core.vocabulary.dcterms.creator, this.webid, '@iri');
    };
    core.jsonld.addValue(post, '@subject', 'http://api.twitter.com/1/statuses/show/'+tweet.id_str+'.json');
    core.jsonld.addValue(post, core.vocabulary.configuration.managed_by_extension, Extension.iri, '@iri');
    core.jsonld.addValue(post, core.vocabulary.configuration.belongs_to_account, this.account['@subject'], '@iri');
    core.jsonld.addValue(post, core.vocabulary.dcterms.created, new Date(Date.parse(tweet.created_at)), 'xsd:date');
    core.jsonld.addValue(post, core.vocabulary.sioc.content, tweet.text);

    return post;
};

Extension.prototype.formatNode = function(node, mediaType) {
    if(mediaType === 'rdfa') {
        var txt = node['sioc:content'];
        var matches = (txt.match(/((mailto\:|(news|(ht|f)tp(s?))\:\/\/){1}\S+)/g)||[]);
        var match;

        for(var i=0; i<matches.length; i++) {
            match = matches[i];
            txt = txt.replace(match,"<a href='"+match+"'>"+match+"</a>");
        }

        matches = (txt.match(/@[\a-zA-Z0-9]+/g)||[]);
        for(var i=0; i<matches.length; i++) {
            match = matches[i];
            txt = txt.replace(match,"<span class='tweet-ref'>"+match+"</span>");
        }

        node['sioc:content'] = txt;
        var parts = node['@subject'].split("/")
        node['html_link'] = "https://twitter.com/#!/"+node['sioc:has_creator']['sioc:name']+"/status/"+(parts[parts.length-1].split(".")[0])
        return node;
    } else {
        return null;
    }
};

Extension.prototype.handleMessage = function(msg) {
    //@todo Ignore by now
};

// exports
exports.Extension = Extension;

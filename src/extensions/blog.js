var sys = require('util');
var core = require('../core');
var utils = require('../utils').utils;
var https = require('https');
var url = require('url');
var FeedParser = require('feedparser');
var extensionUtils = require('../extension_utils');
var Extension = function(){
    this.identifier = 'blog';
};

/**
 * Name identifying this extension
 */
Extension.identifier = "blog";

/**
 * IRI identifying the extension
 */
Extension.iri = "http://social-rdf.org/vocab/extensions/blog#extension";

/**
 * Version of this extension
 */
Extension.version = "0.0.1";

/**
 * Description of this extension functionality
 */
Extension.description = "Imports blogs exposing a RSS/Atom feed";

/**
 * Prefix for extension URIs
 */
Extension.prefixes = {'srfeed': 'http://social-rdf.org/vocab/extensions/blog/'};

/**
 * Service this extension wraps
 */
Extension.service = "http://social-rdf.org/vocab/extensions/blog/";

/**
 * List of data objects that will be published by this extension
 */
Extension.dataPublished = [
    core.vocabulary.configuration.makeExportedResource('http://social-rdf.org/vocab/extensions/blog/public_updates', 
                                                       'Posts', 
                                                       'Posts published in this blog', 
                                                       core.vocabulary.resources.Post, 
                                                       true)
];

/**
 * Returns an array of JSON-LD objects containing the pieces of configuration data required by this application
 * to run.
 */
Extension.configurationData = function(){
    return [
        core.vocabulary.configuration.makeExtensionConfigurationData("http://social-rdf.org/vocab/extensions/blog/homepage", 
                                                                     "Blog URL", 
                                                                     "URL of blog public URL", 
                                                                     "string", 
                                                                     false, 
                                                                     ''),

        core.vocabulary.configuration.makeExtensionConfigurationData("http://social-rdf.org/vocab/extensions/blog/feed", 
                                                                     "Feed URL", 
                                                                     "URL of the RSS/Atom feed with the posts of the blog", 
                                                                     "string", 
                                                                     true, 
                                                                     ''),

        core.vocabulary.configuration.makeExtensionConfigurationData("http://social-rdf.org/vocab/extensions/blog/update_frequency", 
                                                                     "Frequency of update checks (minutes)", 
                                                                     "New data from the posts feed will be retrived with this frequency", 
                                                                     "int", 
                                                                     false,
                                                                     60)
    ];
};


/**
 * Returns an account object generated by this extension when associated to an identity with some configuration data.
 * Returns null if the extension doest not require account creation.
 */
Extension.prototype.installForWebID = function(configuration, webID, callback){
    try {
        var feedURL = configuration["http://social-rdf.org/vocab/extensions/blog/feed"];
        var updateFrequency = configuration["http://social-rdf.org/vocab/extensions/blog/update_frequency"];
        var blogURL = configuration["http://social-rdf.org/vocab/extensions/blog/homepage"];

        try {
            var userAccount = core.vocabulary.configuration.makeUserAccount(webID);
            core.jsonld.addValue(userAccount, 'http://social-rdf.org/vocab/extensions/blog/feed',feedURL,'@iri');

            if(blogURL != null && blogURL != "") {
                userAccount['srfeed:homepage'] = blogURL;
            };
            userAccount['srfeed:update_frequency'] = parseInt(updateFrequency);
            userAccount['@context']['srfeed'] = 'http://social-rdf.org/vocab/extensions/blog/';

            console.log("ABOUT TO SAVE ACCOUNT:");
            console.log(userAccount);
            console.log("---------------------------------");

            callback(true, userAccount);
        } catch(e) {
            console.log("[blog] ** error: "+e);
            console.log(e);
            callback(false, e);
        }
    } catch(e) {
        callback(false, e);
    }
};

/**
 * Main loop of the extension
 */
Extension.prototype.execute = function(account, bindings, dbClient){
    try {
        console.log("[blog] ** executing extension...");

        var that = this;

        this.webid = account['sioc:has_owner'];

        this.account = account;
        this.bindings = bindings;
        
        var publicBinding = null;

        for(var i=0; i<bindings.length; i++) {
            if(bindings[i]['srcfg:isPublic'] === "true") {
                publicBinding = bindings[i];
            }
        }

        var feedURL = account['srfeed:feed'];
        var updateFrequency = parseInt(account["srfeed:update_frequency"]);


        var updateFunction = function(){
            try {
                console.log("[blog] ** updating blog <"+feedURL+"> events");

                var parser = new FeedParser();      

                var insertArticleObject = function(article) {
                    var post = that.makePost(account, article);
                    if(post!=null) {
                        extensionUtils.saveObject(post, dbClient, function(){});
                    }
                };

                parser.on('article', function(article) {
                    var microblogpost = that.makeMicroBlogPost(account, article);
                    console.log("!MicroBlogPost");
                    console.log(microblogpost);
                    if(microblogpost != null) {
                        core.jsonld.addValue(microblogpost, core.vocabulary.extensions.bound_to, [publicBinding['@subject']], '@iri');
                        dbClient.collection('stream', function(coll) {

                            coll.update({'@subject':microblogpost['@subject']},
                                        microblogpost, 
                                        {'upsert':true},
                                        function(err, res){
                                            insertArticleObject(article);
                                        });
                        });
                    } else {
                        insertArticleObject(article);
                    }
                });

                parser.parseFile(feedURL);
            } catch(e) {
                console.log("[blog] ** (!!!) Exception updating tweet stream");
                console.log(e);
            }
        };

        // setting up the timer
        setInterval(updateFunction, (updateFrequency*60*1000));
        updateFunction();

    } catch(e) {
        console.log("[blog] ** (!!!) exception executing twitter extension");
        console.log(e);
    }

};

Extension.prototype.import = function(account, bindings, dbClient){
    // nothing here
};


Extension.prototype.makePost = function(account,article) {
    var post = {'@type':[core.vocabulary.sioc.Post],
                '@context': {'xsd':'http://www.w3.org/2001/XMLSchema#'}};

    account = {
        'foaf:accountServiceHomepage': account['srfeed:feed'],
        'sioc:accountOf': this.webid
    };

    post['sioc:has_creator'] = account;
    if(article.pubDate) {
        core.jsonld.addValue(post, core.vocabulary.dcterms.created, new Date(Date.parse(article.pubDate)), 'xsd:date');
    }
    post['@subject'] = article.link;
    post['dcterms:title'] = article.title;
    post['sioc:content'] = (article.description || article.summary);
    return post;
};

Extension.prototype.makeMicroBlogPost = function(account,article) {
    var post = {'@type':[core.vocabulary.sioc.MicroBlogPost,
                         core.vocabulary.sioc.Post],
                '@context': {'xsd':'http://www.w3.org/2001/XMLSchema#'}};

    account = {
        'foaf:accountServiceHomepage': account['srfeed:feed'],
        'sioc:accountOf': this.webid
    };

    post['sioc:has_creator'] = account;

    if(article.pubDate) {
        core.jsonld.addValue(post, core.vocabulary.dcterms.creator, this.webid, '@iri');
        core.jsonld.addValue(post, core.vocabulary.dcterms.created, new Date(Date.parse(article.pubDate)), 'xsd:date');  
        core.jsonld.addValue(post, '@subject', ("http://social-rdf.org/vocab/extensions/blog/events/ids/"+(new Date(Date.parse(article.pubDate)).getTime())+''+(new Date().getTime())), '@iri');
        core.jsonld.addValue(post, core.vocabulary.foaf.homepage, article['link'] );
        core.jsonld.addValue(post, core.vocabulary.configuration.managed_by_extension, Extension.iri, '@iri');
        core.jsonld.addValue(post, core.vocabulary.configuration.belongs_to_account, this.account['@subject'], '@iri');
        core.jsonld.addValue(post, core.vocabulary.sioc.content, "A new post has been published: '<a href='"+article['link']+"'>"+article['title']+"</a>' " );

    } else {
        post=null;
    }


    return post;
};

Extension.prototype.formatNode = function(node, mediaType) {
    if(mediaType == 'rdfa') {        
        switch(node['srgh:event_type']) {
        case "http://social-rdf.org/vocab/extensions/github/PullRequestEvent":
            node['event_type_formatted'] = "pull request";
            break;
        case "http://social-rdf.org/vocab/extensions/github/CreateEvent":
            node['event_type_formatted'] = "create";        
            break;
        case "http://social-rdf.org/vocab/extensions/github/ForkEvent":
            node['event_type_formatted'] = "fork";
            break;
        case "http://social-rdf.org/vocab/extensions/github/PushEvent":
            node['event_type_formatted'] = "push";
            break;
        }
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
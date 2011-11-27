(function(){
    var socialrdf = {};
    window['socialrdf'] = socialrdf;

    socialrdf.model = {
        webhooksForm: {
            graph: ko.observable(''),
            name: ko.observable(''),
            query: ko.observable(''),
            callback: ko.observable('')
        }
    };
    
    socialrdf.init = function() {
        socialrdf.model.webhooksForm.graph(window.location.href.split("#")[0]);
        socialrdf.model.webhooksForm.query('')
        socialrdf.model.webhooksForm.name('')
        ko.applyBindings(socialrdf.model);
    };

    socialrdf.model.webhooksForm.cancel = function() {
        socialrdf.model.webhooksForm.graph(window.location.href.split("#")[0]);
        socialrdf.model.webhooksForm.query('')
        socialrdf.model.webhooksForm.name('')
        jQuery("#create-webhook-modal").modal(false);
    };

    socialrdf.model.showSPARQLfrontend = function() {
        try {
            var url = window.location.href.split("#")[0];
            rdfstore.create(function(store) {
                store.registerDefaultProfileNamespaces();
                console.log("*** loading graph "+url);
                jQuery.ajax({
                    'url': url+"?rand="+(new Date().getTime()),
                    'accepts': 'application/json',
                    'type': 'GET',
                    'dataType': 'json',
                    'beforeSend': function(xhr) {
                        xhr.setRequestHeader('Accept', 'application/json');
                    },
                    'error': function(xhr, status, error){
                        console.log("*** XHR error, status:"+status);
                        alert('Error:'+error);
                    },
                    'success': function(data, status, xhr) {
                        store.load("application/json", data, function(success, msg) {
                            new rdfstore_frontend('#frontend',store);
                        })
                    }
                })
            });
        }catch(e) {
            console.log("(!!) error: "+e);
            console.log(e);
            alert("There was an error loading graph");
        }
    };

    socialrdf.model.webhooksForm.submit = function() {
        if(socialrdf.model.webhooksForm.graph() == '' ||
           socialrdf.model.webhooksForm.query() == '') {
            alert("Graph and query must be provided");
        } else {
            jQuery.ajax({
                'url': 'https://localhost:8081/social/webhooks',
                'type': 'POST',
                'contentType': 'text/plain',
                'data': JSON.stringify({'graph':socialrdf.model.webhooksForm.graph(),
                                        'query': socialrdf.model.webhooksForm.query(),
                                        'name': socialrdf.model.webhooksForm.name(),
                                        'callback': socialrdf.model.webhooksForm.callback()}),
                'error': function(xhr, status, error){
                    console.log("STATUS:"+status);
                    alert('ERROR:'+error);
                },
                'success': function(data, status, xhr) {
                    if(status === 'success') {
                        jQuery("#create-webhook-modal").modal(false);
                        console.log("webhook created: "+data);
                        alert('webhook created');
                    } else {
                        console.log("STATUS:"+status);
                        alert('Error:'+data);
                    }
                }
            });
        }

    };
})();


(function(){

    // declare socialrdf namespace
    window['socialrdf'] = window['socialrdf'] || {};
    var socialrdf = window['socialrdf'];
    
    // declare admin object
    window['socialrdf']['admin'] = {};
    var admin = socialrdf.admin;

    admin.controller = {
        showExtensionsList: ko.observable('menu'),
        selectedExtension: ko.observable('<http://social-rdf.org/vocab/WebID>'),
        webid: ko.observable("<http://social-rdf.org/unknown>"),
        xsdTypes: ko.observable(['literal','xsd:integer','xsd:double','xsd:float','xsd:string', 'xsd:date','other']),
        foafProperties: ko.observable(['other',
                                       'foaf:nick',
                                       'foaf:firstName',
                                       'foaf:lastName',
                                       'foaf:depicts',
                                       'foaf:mbox',
                                       'foaf:homepage',
                                       'foaf:phone',
                                       'foaf:weblog',
                                       'foaf:openid',
                                       'foaf:jabberID',
                                       'foaf:skypeID',
                                       'foaf:publications']),
        objectTypes: ko.observable([])
    };

    //
    // Updates the WebID profile
    //
    admin.controller.updateWebID = function() {
        sko.store.node(sko.plainUri(admin.controller.webid()),
                       function(success, graph){
                           if(success) {
                               var jsonld = sko.jsonld.graphToJSONLD(graph, sko.store.rdf);
                               jQuery.ajax({
                                   'url': '/admin/webid',
                                   'accepts': 'application/json',
                                   'type': 'PUT',
                                   'data': JSON.stringify(jsonld[0]),
                                   'error': function(xhr, status, error) {
                                       console.log("STATUS"+status);
                                       alert("Error updating WebID:"+error);
                                   },
                                   'success': function(data, status, xhr) {
                                       if(status === 'success') {
                                           admin.controller.accountsWebID.updateDirtyAccounts();
                                       } else {
                                           console.log("STATUS:"+status);
                                           alert('Error updating WebID:'+data);
                                       }
                                   }
                               });
                           } else {
                               console.log(graph);
                               alert("There was an error.");
                           }
                       });
    };

    //  
    // New Property Modal interaction
    //  

    // observables
    admin.controller.newPropertyWebID = {
        selectedPropertyURI: ko.observable('other'),
        selectedXsdType: ko.observable('literal'),
        propertyTypeOptions: ko.observable(['URI', 'literal']),
        propertyTypeSelected: ko.observable('URI'),
        customDataType: ko.observable(),
        customValue: ko.observable(),
        customPropertyURI: ko.observable(),
        editionMode: ko.observable('create')
    };

    // Computes an array with the properties of the current webID RDF node
    admin.controller.webidProperties = ko.dependentObservable(function(){
        var webid = admin.controller.webid();
        try {
            if(webid != null) {
                var acum = [];
                sko.store.execute("SELECT ?p ?o { "+webid+" ?p ?o . \
                                       FILTER(?p != <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> &&\
                                              ?p != <http://xmlns.com/foaf/0.1/holdsAccount>)}", 
                                  function(succ, triples) {
                                      for(var i=0; i<triples.length; i++) {
                                          acum.push({prop:triples[i].p.value, val:triples[i].o.value});
                                      }
                                  });
                
                return acum;
            } else {
                console.log("returning []");
                return [];
            }
        } catch(e) { 
            return [];
        }
    });

    // removes a RDF property from the WebID profile
    admin.controller.newPropertyWebID.removeProperty = function(propertyURI){
        var subject = sko.plainUri(admin.controller.webid());
        sko.store.execute("DELETE { <"+subject+"> <"+propertyURI+"> ?o } WHERE { <"+subject+"> <"+propertyURI+"> ?o }", 
                          function(success,res) {
                              // update properties
                              admin.controller.webid.valueHasMutated(admin.controller.webid());

                          });
    };

    // clears the modal dialog 
    admin.controller.newPropertyWebID.clearModal = function(){
        jQuery("#new-webid-property-modal").modal('hide');
        
        // clean
        jQuery('#new-webid-property-modal .alert-message').hide();
        admin.controller.newPropertyWebID.selectedPropertyURI('other');
        admin.controller.newPropertyWebID.customPropertyURI('');
        admin.controller.newPropertyWebID.customValue('');
        admin.controller.newPropertyWebID.propertyTypeSelected('URI');
        admin.controller.newPropertyWebID.selectedXsdType('literal');
        admin.controller.newPropertyWebID.customDataType('');
    };

    // opens the dialog
    admin.controller.newPropertyWebID.openPropertyWebIDModal = function() {
        admin.controller.newPropertyWebID.editionMode("create"); 
        jQuery("#new-webid-property-modal").modal({backdrop:true, show:true});
    };
    
    // edits one of the properties in the profile
    admin.controller.newPropertyWebID.editProperty = function(propURI){ 
        sko.store.execute("select ?o { <"+sko.plainUri(admin.controller.webid())+"> <"+propURI+"> ?o }",
                          function(success, res) {
                              if(success && res.length>0) {
                                  admin.controller.newPropertyWebID.editionMode("edit"); 
                                  jQuery("#new-webid-property-modal").modal({backdrop:true, show:true}); 
                                  var obj = res[0]['o'];
                                  if(propURI.indexOf('http://xmlns.com/foaf/0.1/') === 0) {
                                      var found = false;
                                      var shrinked = 'foaf:'+propURI.split('http://xmlns.com/foaf/0.1/')[1];
                                      var props = admin.controller.foafProperties();
                                      for(var i=0; i<props.length; i++) {
                                          if(props[i] === shrinked) {
                                              found = true;
                                              break;
                                          }
                                      }

                                      if(found) {
                                          admin.controller.newPropertyWebID.selectedPropertyURI(shrinked);
                                          admin.controller.newPropertyWebID.customPropertyURI('');
                                      } else {
                                          admin.controller.newPropertyWebID.selectedPropertyURI('other');
                                          admin.controller.newPropertyWebID.customPropertyURI(propURI);
                                      }
                                  } else {
                                      admin.controller.newPropertyWebID.selectedPropertyURI('other');
                                      admin.controller.newPropertyWebID.customPropertyURI(propURI);
                                  }
                                  
                                  if(obj.token === 'literal') {
                                      admin.controller.newPropertyWebID.propertyTypeSelected('literal');
                                      if(obj.type != null) {
                                          if(obj.type.indexOf('http://www.w3.org/2001/XMLSchema#') === 0) {
                                              var shrinked = 'xsd:'+obj.type.split('http://www.w3.org/2001/XMLSchema#')[1];
                                              var props = admin.controller.xsdTypes();
                                              var found = false;
                                              for(var i=0; i<props.length; i++) {
                                                  if(props[i] === shrinked) {
                                                      found = true;
                                                      break;
                                                  }
                                              }
                                              if(found) {
                                                  admin.controller.newPropertyWebID.customValue(obj.value);
                                                  admin.controller.newPropertyWebID.selectedXsdType(shrinked);
                                                  admin.controller.newPropertyWebID.customDataType('');
                                              } else {
                                                  admin.controller.newPropertyWebID.customValue(obj.value);
                                                  admin.controller.newPropertyWebID.selectedXsdType('other');
                                                  admin.controller.newPropertyWebID.customDataType(obj.value);
                                              }
                                          } else {
                                              admin.controller.newPropertyWebID.customValue(obj.value);
                                              admin.controller.newPropertyWebID.selectedXsdType('other');
                                              admin.controller.newPropertyWebID.customDataType(obj.value);
                                          }
                                      } else {
                                          admin.controller.newPropertyWebID.customValue(obj.value);
                                          admin.controller.newPropertyWebID.selectedXsdType('literal');
                                          admin.controller.newPropertyWebID.customDataType('');
                                      }
                                  } else {
                                      admin.controller.newPropertyWebID.customValue(obj.value);
                                      admin.controller.newPropertyWebID.propertyTypeSelected('URI');
                                      admin.controller.newPropertyWebID.selectedXsdType('literal');
                                      admin.controller.newPropertyWebID.customDataType('');
                                  }
                              } else {
                                  alert("Error retrieving property "+propURI);
                              }
                          });
    };

    // logic for new property creation
    admin.controller.newPropertyWebID.createNewProperty = function() {
        var propertyURI, propertyValue, propertyType, propertyDataType;
        var graph = sko.rdf.createGraph();
        var subject, property, object;
        try {
            subject = sko.rdf.createNamedNode(sko.plainUri(admin.controller.webid()));

            if(admin.controller.newPropertyWebID.selectedPropertyURI() === 'other') {
                propertyURI = admin.controller.newPropertyWebID.customPropertyURI();
            } else {
                propertyURI = 'http://xmlns.com/foaf/0.1/'+admin.controller.newPropertyWebID.selectedPropertyURI().split(":")[1];
            }

            propertyValue = admin.controller.newPropertyWebID.customValue();

            if(admin.controller.newPropertyWebID.propertyTypeSelected() === 'URI') {
                propertyType = 'uri';
                object = sko.rdf.createNamedNode(sko.rdf.prefixes.resolve(propertyValue));
            } else {
                propertyType = 'literal';
                if(admin.controller.newPropertyWebID.selectedXsdType() === 'other') {
                    propertyDataType = admin.controller.newPropertyWebID.customDataType();
                    propertyDataType = sko.rdf.prefixes.resolve(propertyDataType);

                    object = sko.rdf.createLiteral(propertyValue,null,propertyDataType);
                } else if(admin.controller.newPropertyWebID.selectedXsdType() !== 'literal') {
                    propertyDataType = "http://www.w3.org/2001/XMLSchema#"+admin.controller.newPropertyWebID.selectedXsdType().split(":")[1];
                    object = sko.rdf.createLiteral(propertyValue,null,propertyDataType);
                } else {
                    object = sko.rdf.createLiteral(propertyValue);
                }
            }

            if(sko.rdf.prefixes.resolve(propertyURI) != null) {
                propertyURI = sko.rdf.prefixes.resolve(propertyURI);
            }

            property = sko.rdf.createNamedNode(propertyURI);

            if(admin.controller.newPropertyWebID.editionMode()==="create") {
                debugger;
                graph.add(sko.rdf.createTriple(subject,property,object));

                sko.store.insert(graph,function(success,res) {
                    if(success == true) {
                        // close modal
                        jQuery("#new-webid-property-modal").modal('hide');
                        
                        // update properties
                        admin.controller.webid.valueHasMutated(admin.controller.webid());
                        
                        // clean
                        jQuery('#new-webid-property-modal .alert-message').hide();
                        admin.controller.newPropertyWebID.selectedPropertyURI('other');
                        admin.controller.newPropertyWebID.customPropertyURI('');
                        admin.controller.newPropertyWebID.customValue('');
                        admin.controller.newPropertyWebID.propertyTypeSelected('URI');
                        admin.controller.newPropertyWebID.selectedXsdType('literal');
                        admin.controller.newPropertyWebID.customDataType('');
                    } else {
                        jQuery('#new-webid-property-modal .alert-message').toggle();
                    }

                });
            } else {
                debugger;
                sko.store.execute("DELETE { "+subject.toNT()+property.toNT()+" ?o} INSERT {"+
                                  subject.toNT()+property.toNT()+object.toNT()+"} WHERE {"+
                                  subject.toNT()+property.toNT()+" ?o}",
                                 function(success, res){
                                     if(success) {
                                         // update properties
                                         admin.controller.webid.valueHasMutated(admin.controller.webid());
                                         admin.controller.newPropertyWebID.clearModal();
                                     } else {
                                         alert("There was an error updating the property value");
                                     }
                                 });
            }
            
        } catch(e) {
            jQuery('#new-webid-property-modal .alert-message').toggle();
        }        
    };

    //
    // Accounts information into WebID profile
    //
    admin.controller.accountsWebID = {
        selectedAccount: ko.observable()
    };

    admin.controller.accountsWebID.selectedProperties = ko.observable([]);
    admin.controller.accountsWebID.selectedPropertiesUpdater = ko.dependentObservable(function(){
        var accountURI = admin.controller.accountsWebID.selectedAccount();
        if(accountURI) {
            accountURI = accountURI.account.value;
            var acum = [];
            var props = {};
            var publicInfo = {};
     
            sko.store.execute("SELECT ?prop ?value { <"+accountURI+"> ?prop ?value . FILTER(?prop != srcfg:isPublic)}", function(success, res){
                if(success) {
                    for(var i=0; i<res.length; i++) {
                        props[res[i].prop.value] = res[i].value.value;
                    }
     
                    sko.store.execute("SELECT ?prop { <"+accountURI+"> srcfg:isPublic ?prop . FILTER(?prop != srcfg:isPublic)}",
                                      function(success, res) {
                                          if(success) {
                                              for(var i=0; i<res.length; i++) {
                                                  publicInfo[res[i].prop.value] = true;
                                              }
     
                                              for(var p in props) {
                                                  acum.push({'property':p,
                                                             'value': props[p],
                                                             'public': (publicInfo[p] === true)});
                                              }
     
                                              admin.controller.accountsWebID.selectedProperties(acum);
                                          } else {
                                              console.log("*** Error selecting public properties for account:"+accountURI);
                                              console.log(res);
     
                                          }
                                      });
                } else {
                    console.log("*** Error selecting properties for account:"+accountURI);
                    console.log(res);
                }
            });
        }
    });

    admin.controller.accountsWebID.dirtyAccounts = {};

    admin.controller.accountsWebID.updateAccountProperty = function(property, event){
        var currentAccount = admin.controller.accountsWebID.selectedAccount().account.value;
        var mustExport =  event.currentTarget.checked;

        admin.controller.accountsWebID.dirtyAccounts[currentAccount] = true;

        var callback = function(){
            admin.controller.accountsWebID.selectedAccount.valueHasMutated();
        };

        if(mustExport) {
            sko.store.execute("INSERT DATA { <"+currentAccount+"> srcfg:isPublic <"+property+"> }", callback);
        } else {
            sko.store.execute("DELETE DATA { <"+currentAccount+"> srcfg:isPublic <"+property+"> }", callback);
        }
    };

    // Updates all the dirty accounts
    admin.controller.accountsWebID.updateDirtyAccounts = function() {
        var graph = [];
        var dirtyAccounts = [];
        for(var p in admin.controller.accountsWebID.dirtyAccounts) {
            dirtyAccounts.push(p);
        }
        console.log("*** dirty accounts:"+dirtyAccounts.length);
        for(var i=0; i<dirtyAccounts.length; i++) {
            sko.store.node(sko.plainUri(dirtyAccounts[i]),
                           function(success, node){
                               graph = graph.concat(sko.jsonld.graphToJSONLD(node, sko.store.rdf));
                           });
        }

        jQuery.ajax({
            'url': '/admin/extensions',
            'accepts': 'application/json',
            'type': 'PUT',
            'contentType': 'application/json',
            'data': JSON.stringify(graph),
            'dataType': 'json',
            'error': function(xhr, status, error){
                console.log("*** XHR error, status:"+status);
                alert('Error updating WebID:'+error);
            },
            'success': function(data, status, xhr) {
                if(status === 'success') {
                    //sko.store.load("application/json", data, function(success, msg) {
                    //    console.log("*** update result: "+msg);
                    //    alert('WebID updated');
                    //});
                    alert('WebID updated');
                } else {
                    console.log("*** XHR sucess with erro status:"+status);
                    alert('Error updating WebID:'+data);
                }
            }
        });
    };

    //
    // Control of the extensions list
    //

    admin.controller.extensionsClickedIn = function() {
        if(this.showExtensionsList() === 'menu') {
            this.showExtensionsList('menu open');
        }
    };

    admin.controller.extensionsClickedOut = function() {
        if(this.showExtensionsList() === 'menu open') {
            this.showExtensionsList('menu');
        }
    };
    admin.controller.showExtensionList = function() {
        jQuery('#extensions-list').show();
    };

    admin.controller.hideExtensionList = function() {
        jQuery('#extensions-list').hide();
    };    

    //
    // Shows the store frontend
    //
    admin.controller.showRDFStoreFrontend = function() {
        try {
            this.extensionsClickedOut();
            admin.controller.frontend = new rdfstore_frontend('#frontend',sko.store);
        }catch(e) {
            logger.error("TERRIBLE ERROR");
        }
    };

    //
    // Selects the object browser
    //  
    admin.controller.showObjectBrowser = function() {
        this.selectedExtension("<http://social-rdf.org/vocab/objectBrowser>");
    };

    // 
    // Selects a type of object in the object browser
    //
    admin.controller.selectObjectType = function(objectType) {
        jQuery.ajax({
                  'url': '/admin/objects',
                  'accepts': 'application/json',
                  'type': 'GET',
                  'data': {
		      'type':objectType
		  },
                  'error': function(xhr, status, error){
                      console.log("STATUS:"+status);
                      alert('ERROR:'+error);
                  },
                  'success': function(data, status, xhr) {
                      if(status === 'success') {
			  sko.store.load("application/json", data, function(success, msg) {
					     console.log("loaded: "+msg);
					     alert("Object of type "+objectType+" loaded");
					 });
                      } else {
                          console.log("STATUS:"+status);
                          alert('ERROR:'+data);
                      }
                  }
              });
        	
    };

    // Selects a extension
    //
    admin.controller.selectExtension = function(iri) {
        this.selectedExtension(iri);
    };

    //
    //  Checks if the WebID is local or external
    //
    admin.controller.isLocalWebID = function() {
        var res;
        sko.store.execute("SELECT ?isLocal { <http://social-rdf.org/vocab/configuration#the_server>\
                                             <http://social-rdf.org/vocab/configuration#is_local_webid> ?isLocal }", function(scc, triples) {
                                                 if(triples[0].isLocal.value==='true') {
                                                     res = true;
                                                 } else {
                                                     res = false;
                                                 }
                                             });

        return res;
    };


    admin.controller.selectedExtensionOptions = function(){
        var res = null;
        var currentExtension = admin.controller.selectedExtension();
    };

    //
    // Extension installation callback
    //
    admin.controller.installExtension = function(){
        var resource = sko.resource("section#section-install-extension");
        var resourceUri = sko.plainUri(resource.about());

        var configurationOptions = sko.resource(".extension-configuration-option");
        var values = [];

        // add the configuration options
        for(var i=0; i<configurationOptions.length; i++) {
            var uri = sko.plainUri(configurationOptions[i].about());
            sko.store.execute("select ?p ?o { <"+uri+"> ?p ?o }", function(res, vals) {
                if(res) {
                    var jsonld = { '@context': {'@coerce':{}},
                                   '@subject': uri };

                    for(var i=0; i<vals.length; i++) {
                        jsonld[vals[i].p.value] = vals[i].o.value;
                        if(vals[i].o.token === 'uri' || vals[i].o.value.indexOf("http://")===0) {
                            if(jsonld['@context']['@coerce']['@iri'] == null) {
                                jsonld['@context']['@coerce']['@iri'] = [ vals[i].o.value ];
                            } else {
                                jsonld['@context']['@coerce']['@iri'].push(vals[i].o.value);
                            }
                        }
                    }

                    values.push(jsonld);
                }
            });
        }

        // add the URL bindings
        var uriBindings = sko.resource(".extension-url-binding");
        if(uriBindings.length == null) {
            uriBindings = [uriBindings];
        }
        for(var i=0; i<uriBindings.length; i++) {

            var uri = sko.plainUri(uriBindings[i].about());
            sko.store.execute("select ?p ?o { <"+uri+"> ?p ?o }", function(res, vals) {
                if(res) {
                    var jsonld = { '@context': {'@coerce':{}},
                                   '@subject': uri };

                    for(var i=0; i<vals.length; i++) {
                        jsonld[vals[i].p.value] = vals[i].o.value;
                        if(vals[i].o.token === 'uri' || vals[i].o.value.indexOf("http://")===0) {
                            if(jsonld['@context']['@coerce']['@iri'] == null) {
                                jsonld['@context']['@coerce']['@iri'] = [ vals[i].o.value ];
                            } else {
                                jsonld['@context']['@coerce']['@iri'].push(vals[i].o.value);
                            }
                        }
                    }

                    values.push(jsonld);
                }
            });
        }

        // identify the extension to be installed
        values.push({'@subject': sko.plainUri(this.selectedExtension()),
                     '@type': 'http://social-rdf.org/vocab/Extension'});
        
        jQuery.ajax({
            'url': '/admin/extensions',
            'accepts': 'application/json',
            'type': 'POST',
            'contentType': 'application/json',
            'data': JSON.stringify(values),
            'dataType': 'json',
            'error': function(xhr, status, error){
                console.log("STATUS:"+status);
                alert('ERROR:'+error);
            },
            'success': function(data, status, xhr) {
                if(status === 'success') {
                    sko.store.load("application/json", data, function(success, msg) {
                        console.log("loaded: "+msg);
                        alert('Extension installed');
                    });
                } else {
                    console.log("STATUS:"+status);
                    alert('ERROR:'+data);
                }
            }
        });
    };

    admin.controller.updateExtension = function(){
        var resource = sko.resource(".extension-account-update-info");
        resource.toJSON(function(success, jsonld) {
            if(success) {
              jQuery.ajax({
                  'url': '/admin/extensions',
                  'accepts': 'application/json',
                  'type': 'PUT',
                  'contentType': 'application/json',
                  'data': JSON.stringify(jsonld),
                  'dataType': 'json',
                  'error': function(xhr, status, error){
                      console.log("STATUS:"+status);
                      alert('ERROR:'+error);
                  },
                  'success': function(data, status, xhr) {
                      if(status === 'success') {
                          alert('Extension updated');
                      } else {
                          console.log("STATUS:"+status);
                          alert('ERROR:'+data);
                      }
                  }
              });
            } else {
                console.log("*** Error retrieving jsonld for the account udpate form");
                console.log(jsonld);
                alert("There was an error updating the extension configuration");
            }
        });
    };


    /************************************************************************************************/
    // Initializes the controller
    /************************************************************************************************/    

    admin.controller.initialize = function(cb){

        // If the extension has been installed, URI of the account managed by that extension
        admin.controller.selectedAccount = ko.observable();

        // Checks if the extension selected has been installed (does it have an account?)
        admin.controller.isSelectedExtensionInstalled = ko.dependentObservable(function(){
            var res = null;
            var currentExtension = admin.controller.selectedExtension();
            sko.store.execute("SELECT * { ?accountUri <http://social-rdf.org/vocab/configuration#account_generated_by> "+currentExtension+" }", function(succ, triples){
                if(triples.length>0) {
                    admin.controller.selectedAccount("<"+triples[0].accountUri.value+">");
                }
                res = triples.length>0;
            });

            sko.store.startObservingQuery("SELECT ?type WHERE { <http://social-rdf.org/the_server>  <http://social-rdf.org/vocab/configuration#stores_object_types> ?type }", function(triples) {
                var acum = [];
                for(var i=0; i<triples.length; i++) {
                    triples[i].type.binding = "<"+triples[i].type.value+">";
                    triples[i].type.label = "sioc:"+(triples[i].type.value.split("#")[1]);		    
                    acum.push(triples[i].type);
                }
                admin.controller.objectTypes(acum);
            });
            
            return res;
        });              


        try {
            sko.store.execute("SELECT ?webid { ?server <http://social-rdf.org/vocab/configuration#managed_webid> ?webid }", function(succ, triples) {
                admin.controller.webid("<"+triples[0].webid.value+">");
            });
        } catch(e) {
            console.log("ERR:");
            console.log(e);
        }

        //
        // List of installed extensions
        // 
        admin.controller.installedExtensions = ko.observable([]);
        admin.controller.installedExtensionsSPARQLQuery = null;
        admin.controller.installedExtensionsSPARQLObserver = ko.dependentObservable(function(){
            var webid = admin.controller.webid();
            if(admin.controller.installedExtensionsSPARQLQuery != null) {
                sko.store.stopObservingQuery(admin.controller.installedExtensionsSPARQLQuery);
            }

            admin.controller.installedExtensionsSPARQLQuery = "SELECT ?extension ?account ?service WHERE { ?account <http://rdfs.org/sioc/ns#account_of> "+webid+" ;\
                                                                                                           <http://social-rdf.org/vocab/configuration#account_generated_by> ?extension.\
                                                                                                           ?extension <http://social-rdf.org/vocab/extensions#serviceWrapped> ?service }";
            sko.store.startObservingQuery(admin.controller.installedExtensionsSPARQLQuery,
                                          function(res){
                                              // generate an easier to link label
                                              for(var i=0; i<res.length;i++) {
                                                  res[i].label = res[i].service.value;
                                              }
                                              admin.controller.installedExtensions(res);
                                          });
        });

        //admin.controller.installedExtensions = ko.dependentObservable(function(){
        //    
        //    var extensions = [];
        //    sko.store.execute("SELECT ?extension ?account ?service WHERE { ?account <http://rdfs.org/sioc/ns#account_of> "+webid+" ;\
        //                                                                  <http://social-rdf.org/vocab/configuration#account_generated_by> ?extension.\
        //                                                                  ?extension <http://social-rdf.org/vocab/extensions#serviceWrapped> ?service }",
        //                      );
        // 
        //    return extensions;
        //});

        // initialization finished
        cb();
    };

})();

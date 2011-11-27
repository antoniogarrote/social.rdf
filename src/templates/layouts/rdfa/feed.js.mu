<!doctype html>
<html xmlns="http://www.w3.org/1999/xhtml"
      {{#ns}}
      xmlns:{{ns}}="{{iri}}"
      {{/ns}}>
  <head>
    <title>{{feedTitle}}</title>
    <link rel="alternate" type="application/atom+xml" href="{{current_graph}}.atom">
    <link rel="stylesheet" href="/social/css/bootstrap.min.css">
    <link rel="stylesheet" href="/social/css/socialrdf.css">
    <link rel="stylesheet" href="/social/css/rdfstore_frontend.css">
    <script type='text/javascript' src="http://ajax.googleapis.com/ajax/libs/jquery/1.7.1/jquery.min.js"></script>
    <script type='text/javascript' src='http://ajax.microsoft.com/ajax/jquery.templates/beta1/jquery.tmpl.min.js'></script>
    <script type='text/javascript' src="/social/js/jquery.min.js"></script>
    <script type='text/javascript' src='/social/js/jquery.tmpl.js'></script>
    <script type='text/javascript' src="/social/js/bootstrap-dropdown.js"></script>
    <script type='text/javascript' src="/social/js/bootstrap-modal.js"></script>
    <script type='text/javascript' src="/social/js/knockout.js"></script>
    <script type='text/javascript' src="/social/js/rdf_store_min.js"></script>
    <script type='text/javascript' src="/social/js/rdfstore_frontend.js"></script>
    <script type='text/javascript' src="/social/js/socialrdf.js"></script>
    <meta name="author" content="{{feed_author}}" />
    <script type='text/javascript'>
      jQuery(document).ready(function(){
         socialrdf.init();
      });
    </script>
  </head>
  <body>

    <!-- menu -->
    <div id='graph-selector' class='topbar-wrapper'>
      <div class='topbar' data-dropdown="dropdown">
        <div class='topbar-inner'>

          <div class='container'>
            <h4>graph:</h4>
            <ul class='nav' id='graph-list'>
              <li class="dropdown">
                <a class='dropdown-toggle' href='{{current_graph}}'>{{current_graph}}</a>
                <ul class='dropdown-menu'>
                  {{#graphs}}
                    {{#bindings}}
                      <li><a href='{{graph}}'>{{graph}}</a></li>
                    {{/bindings}}
                      <li class='divider'></li>
                    {{#resources}}
                      <li><a href='{{graph}}'>{{graph}}</a></li>
                    {{/resources}}
                  {{/graphs}}
                </ul>
              </li>
            </ul>


            <ul id='paginator' class='nav secondary-nav'>
              <li><a href='{{prev-link}}'>prev</a></li>
              <li><h4>page {{page}}</h4></li>
              <li><a href='{{next-link}}'>next</a></li>
            </ul>

            <ul class='nav secondary-nave' id='tools-list'>
              <li class="dropdown">
                <a class='dropdown-toggle' href='#'>tools</a>
                <ul class='dropdown-menu'>
                  <li><a href='#' data-controls-modal="create-webhook-modal" data-backdrop="static">webhooks</a></li>
                  <li><a href='#' data-bind="click: showSPARQLfrontend">SPARQL</a></li>
                </ul>
              </li>
            </ul>

          </div>
        </div>
      </div>
    </div>

    <!-- store frontend -->
    <div id='frontend-overlay'></div>
    <div id='frontend' style='position: absolute; width:95%; top:60px; left:5%'></div>


    <!-- Main content -->
    <div id='main-content' class='container'>
      {{#feedItems}} {{{node}}} {{/feedItems}}
    </div>

    <div id='create-webhook-modal' class='modal' style='display:none'>
      <div class='modal-header'>
        <a href='#' class='close'>x</a>
        <h3>Create Web Hook</h3>
      </div>
      <div class='modal-body'>
        <div class='alert-message warning'>
          <p>
            Your WebID certificate must be installed in this browser and the browser must support CORS headers for the request to succeed. 
          </p>
        </div>

        <form>
          <fieldset>

            <div class='clearfix'>
              <label>Name:</label>
              <div class='input'>
                <input id='wh-input-name' class='xlarge' data-bind='value:webhooksForm.name'></input>
              </div>
            </div>

            <div class='clearfix'>
              <label>Graph:</label>
              <div class='input'>
                <input id='wh-input-graph' class='xlarge' data-bind='value:webhooksForm.graph'></input>
              </div>
            </div>

            <div class='clearfix'>
              <label>Callback URL:</label>
              <div class='input'>
                <input id='wh-input-callback' class='xlarge' data-bind='value:webhooksForm.callback'></input>
              </div>
            </div>

            <div class='clearfix'>
              <label>SPARQL:</label>
              <div class='input'>
                <textarea id='wh-input-query' class='xlarge' rows='4' data-bind='value:webhooksForm.query'></textarea>
              </div>
            </div>

          </fieldset>
        </form>
      </div>
      <div class='modal-footer'>
        <a href='#' class='btn secondary' data-bind='click: webhooksForm.cancel'>Cancel</a>
        <a href='#' class='btn primary' data-bind='click: webhooksForm.submit'>Create</a>
      </div>
    </div>

  </body>
</html>

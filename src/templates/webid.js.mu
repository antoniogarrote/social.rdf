<!doctype html>
<html xmlns="http://www.w3.org/1999/xhtml"
      {{#ns}}
      xmlns:{{ns}}="{{iri}}"
      {{/ns}}
      xmlns:cert='http://www.w3.org/ns/auth/rsa#'
      xmlns:rsa='http://www.w3.org/ns/auth/cert#'>
  <head>
    <title>{{feedTitle}}</title>
    <link rel="stylesheet" href="/social/css/regularbootstrap.min.css">
    <meta name="author" content="{{feed_author}}" />
  </head>

  <body>
    <div id='main-content' class='container'>
      <div class='row'><div class='span16'>&nbsp;</div></div>
      <div class='page-header' id='local-webid-edit'>
        <h1>WebID: <a href='{{@subject}}'>{{@subject}}</a></h1>
      </div>
      <div class='row'><div class='span16'>&nbsp;</div></div>
      
      {{#certificate}}
         <div class='page-header'>
           <h2>Certificate Info</h2>
         </div>

        <div about='{{@subject}}' id='certificate' class='row'>
          <form>
          <fieldset>
          <div class='clearfix'>
            <label>Public Exponent:</label>
            <div class='input'>
              <textarea property='rsa:modulus' class='xxlarge' rows='8' content='{{rsa:modulus}}'>
                {{rsa:modulus}}
              </textarea>
            </div>
          </div>
          <div class='clearfix'>
            <label>Modulus:</label>
            <div class='input'>
              <input property='rsa:public_exponent'' type='text' value='{{rsa:public_exponent}}'></input>
            </div>
          </div>
          <a rel='cert:identity' type='hidden' href='{{cert:identity}}' style='display:none'>&nbsp;</a>
          </fieldset>
          </form>
        </div>
      {{/certificate}}

      <div class='page-header'>
        <h2>Properties</h2>
      </div>

      <div class='row'>
        <div class='span16'>
          <table class='bordered-table zebra-striped' about='{{@subject}}' typeof='foaf:Person'>
            <thead><tr><th>Property</th><th>Value</th></tr></thead>
            {{#properties}}
            <tr>
              <td>{{name}}</td>
              {{#urivalue}}
                <td><a about='{{@subject}}' typeof='foaf:Person' rel='{{name}}' href='{{value}}'>{{value}}</a></td>
              {{/urivalue}}
              {{#datavalue}}
                <td   about='{{@subject}}' typeof='foaf:Person' property='{{name}}' content={{value}}>{{html_value}}</td>
              {{/datavalue}}
            </tr>
            {{/properties}}
          </table>
        </div>
      </div>

      <div class='page-header'>
        <h2>Accounts</h2>
      </div>

      <span about='{{@subject}}'>
      {{#foaf:holdsAccount}}
        <div class='row'>
          <div class='span16'>
            <h3>{{foaf:accountServiceHomepage}}</h3>
          </div>
        </div>

        <div class='row' rel='foaf:holdsAccount'>
          <div class='span16'>
            <table class='bordered-table zebra-striped' typeof='http://rdfs.org/sioc/ns#UserAccount'>
              <thead><tr><th>Property</th><th>Value</th></tr></thead>
              {{#properties}}
              <tr>
                <td>{{name}}</td>
                {{#urivalue}}
                  <td><a rel='{{name}}' href='{{value}}'>{{value}}</a></td>
                {{/urivalue}}
                {{#datavalue}}
                  <td property='{{name}}' content={{value}}>{{html_value}}</td>
                {{/datavalue}}
              </tr>
              {{/properties}}
            </table>
          </div>
        </div>
      {{/foaf:holdsAccount}}
      </span>
    </div>
  </body>

</html>

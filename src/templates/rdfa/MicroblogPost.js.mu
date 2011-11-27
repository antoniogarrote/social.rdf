<div class='MicroblogPost Post row' about='{{@subject}}' typeof='sioc:MicroblogPost'>

    <div class='header row'>
      <span class='creator' rel='sioc:has_creator'>
        <span typeof='sioc:UserAccount'>
          {{#sioc:has_creator}}     
            <span class='name' property='sioc:name'>{{sioc:name}}</span>
            <a target='_blank' class='webid-link label warning' rel='sioc:accountOf' href='{{sioc:accountOf}}'>webid</a>
          {{/sioc:has_creator}}
        </span>
      </span>    
      <span class='date' property='dcterms:created'
            content='{{dcterms:created}}'
            datatype='xsd:date'>
        {{dcterms_created_formatted}}
      </span>
    </div>

    <div class='body row'>
      {{#sioc:has_creator}}
        <span class='span2 avatar' rel='sioc:avatar'><img src='{{sioc:avatar}}'></img></span>
      {{/sioc:has_creator}}      
      <div class='span14' property='sioc:content'>
        {{{sioc:content}}}
      </div>
    </div>

    <div class='row actions action-links'>
      <a class='source-link' href='{{@subject}}'>source</a>
      |
      <a rel='sioc:embedsKnowledge' href='{{sioc:embedsKnowledge}}'>permalink</a>
    </div>
</div>

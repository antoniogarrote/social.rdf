<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">

  <title>{{feedTitle}}</title>
  <link rel="alternate" href="{{current_graph}}" type="text/html" />
  <link rel="self" href="{{current_graph}}.atom" type="application/xml+atom"/>
  <updated>{{updated}}</updated>
  <id>{{current_graph}}</id>

  {{#feedItems}} {{{node}}} {{/feedItems}}

</feed>

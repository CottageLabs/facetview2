#FacetView2

a pure javascript frontend for ElasticSearch search indices.

It has been developed as a jQuery plugin and lets you easily embed a faceted browse front end into any web page.

FacetView2 is a major re-write of the original FacetView application.  See https://github.com/okfn/facetview for the previous version.

## Using FacetView2

Add the following code to your web page:

    <script type="text/javascript" src="vendor/jquery/1.7.1/jquery-1.7.1.min.js"></script>
    <link rel="stylesheet" href="vendor/bootstrap/css/bootstrap.min.css">
    <script type="text/javascript" src="vendor/bootstrap/js/bootstrap.min.js"></script>  
    <link rel="stylesheet" href="vendor/jquery-ui-1.8.18.custom/jquery-ui-1.8.18.custom.css">
    <script type="text/javascript" src="vendor/jquery-ui-1.8.18.custom/jquery-ui-1.8.18.custom.min.js"></script>
    <script type="text/javascript" src="jquery.facetview2.js"></script>
    <link rel="stylesheet" href="css/facetview.css">

Then add a script somewhere to your page that actually calls and sets up the  facetview on a particular page element:

    <script type="text/javascript">
    jQuery(document).ready(function($) {
      $('.facet-view-simple').facetview({
        search_url: 'http://localhost:9200/myindex/type/_search',
        facets: [
            {'field': 'publisher.exact', 'size': 100, 'order':'term', 'display': 'Publisher'},
            {'field': 'author.name.exact', 'display': 'author'},
            {'field': 'year.exact', 'display': 'year'}
        ],
      });
    });
    </script>


## Customisation

FacetView2 has been written to allow extensive customisation within a flexible but constrained page framework.

There will be more documentation here on how to do that, but in the mean time, take a look at the source of jquery.facetview.js for the config options and templates that can be replaced for custom display.


Copyright and License
=====================

Copyright 2014 Cottage Labs.

Licensed under the MIT Licence

twitter bootstrap: http://twitter.github.com/bootstrap/
MIT License: http://www.opensource.org/licenses/mit-license.php

